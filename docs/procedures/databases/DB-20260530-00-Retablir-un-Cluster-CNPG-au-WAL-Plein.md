# DB-20260530-00 Rétablir un cluster CNPG au WAL plein

Cette procédure rétablit un cluster CloudNative-PG dont le PVC WAL a atteint 100 % de sa capacité, ce qui empêche CNPG
de démarrer postgres (`Not enough disk space`). Elle traite l'urgence (agrandir le PVC pour débloquer postgres) et la
cause racine la plus fréquente d'une accumulation silencieuse de WAL : l'erreur `Expected empty archive` de
`barman-cloud-check-wal-archive`.

Vérifiée contre le dépôt le 2026-10-11 ; les commandes n'ont pas été rejouées sur le cluster pour cette migration. Elle
découle de l'incident [CNPG WAL PVC saturation](../../incidents/2026-05-30-cnpg-wal-disk-full-apps-secured.md). Le
déplacement S3 n'interrompt aucun processus postgres ; le comportement exact du redimensionnement du PVC avec Proxmox
CSI (en ligne ou non) reste à confirmer sur le cluster, voir l'étape 2.

> [!NOTE] Les clusters CNPG de `lungmen.akn` déclarent aujourd'hui `isWALArchiver: false`
> (`projects/lungmen.akn/src/apps/databases/postgres-apps*.helmvalues.yaml`) : l'archivage WAL y est désactivé, et la
> cause racine `Expected empty archive` ne les concerne plus. La procédure reste valable pour tout cluster qui archive
> ses WAL vers un stockage objet.

## Cadre technique et conventions

- **Contexte explicite** : toutes les commandes `kubectl` portent `--context`. Ne jamais s'appuyer sur le contexte par
  défaut du kubeconfig, car une opération CNPG sur le mauvais cluster est difficile à défaire.
- **`s3cmd`** : les opérations S3 passent par `s3cmd`, avec les identifiants en options à chaque appel (aucun alias ni
  fichier de configuration persistant). `mise` n'a pas de nom court pour `s3cmd`, d'où le backend explicite `pipx:`.
- **Logs barman-cloud** : les logs sont en JSON ; filtrer avec `python3` plutôt qu'avec `grep` évite de capturer des
  lignes sans rapport.
- **`kubectl get backup` est ambigu** : CNPG et Velero exposent chacun une ressource `backup`. Qualifier toujours :
  `kubectl get backup.postgresql.cnpg.io`.

```sh
mise install pipx:s3cmd
mise x pipx:s3cmd -- s3cmd --version  # vérification
```

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `kubectl`, `mise` (`mise install`
exécuté), `python3`.

Les accès suivants sont également nécessaires :

- accès `kubectl` avec un contexte qui pointe vers le cluster concerné ;
- accès en lecture au namespace du cluster CNPG (`databases` sur `lungmen.akn`) ;
- accès en écriture au bucket S3 (identifiants dans le secret `cnpg-backup-credentials` du namespace du cluster).

## Entrées requises

- `CLUSTER_CONTEXT` : contexte `kubectl` du cluster, par exemple `admin@lungmen.akn`.
- `CLUSTER_NAME` : nom du cluster CNPG, par exemple `apps-secured-20260530`. Le cluster de l'incident d'origine
  s'appelait `apps-secured-20260329`.
- `NAMESPACE` : namespace Kubernetes, par exemple `databases`.

Les marqueurs sont écrits entre chevrons (`<CLUSTER_CONTEXT>`) dans les commandes.

## Étape 1 — Diagnostiquer l'état du cluster

Identifier la phase du cluster, ses conditions et l'état des Pods pour confirmer que la procédure s'applique.

```sh
# Phase et conditions du cluster
kubectl --context <CLUSTER_CONTEXT> get cluster <CLUSTER_NAME> -n <NAMESPACE>
# → phase : "Not enough disk space"  ← la procédure s'applique

# Conditions complètes, pour repérer la cause racine
kubectl --context <CLUSTER_CONTEXT> get cluster <CLUSTER_NAME> -n <NAMESPACE> \
  -o jsonpath='{.status.conditions}' | python3 -m json.tool
# → chercher ContinuousArchivingFailing, avec un message qui mentionne "Expected empty archive"

# État des Pods
kubectl --context <CLUSTER_CONTEXT> get pods -n <NAMESPACE> | grep <CLUSTER_NAME>
# → le Pod 1 peut être en CrashLoopBackOff ; le Pod 2 (primaire) peut encore être Running
```

Constats attendus quand la procédure s'applique :

- phase du cluster : `Not enough disk space` ;
- condition `ContinuousArchivingFailing` dont le message contient `Expected empty archive` ou `WAL archive check failed`
  ;
- au moins un Pod en `CrashLoopBackOff`.

> [!NOTE] Un nombre élevé de redémarrages ralentit la reprise. Au-delà de 500 redémarrages, le délai du CrashLoopBackOff
> est d'environ 5 minutes : après l'agrandissement du PVC de l'étape 2, le Pod ne redémarre pas immédiatement et il faut
> attendre le cycle suivant.

> [!WARNING] Si la condition affiche une autre erreur (problème de driver de stockage, secret manquant, erreur réseau),
> la procédure ne s'applique pas. S'arrêter et analyser le message réel de la condition avant de continuer.

## Étape 2 — Contrôler les PVC WAL et les agrandir

Confirmer que les PVC WAL sont pleins, puis les agrandir pour laisser à postgres la place de démarrer et aux WAL
archivés le temps de se vider.

`kubectl get pvc` n'affiche que la capacité demandée, pas l'occupation : le signal de saturation est la phase
`Not enough disk space` relevée à l'étape 1.

```sh
# Capacité des PVC (le StorageClass attendu est proxmox-lvmthin-*)
kubectl --context <CLUSTER_CONTEXT> get pvc -n <NAMESPACE> | grep <CLUSTER_NAME>
# → repérer <CLUSTER_NAME>-1-wal et <CLUSTER_NAME>-2-wal

# Vérifier que le StorageClass autorise l'extension
kubectl --context <CLUSTER_CONTEXT> get pvc <CLUSTER_NAME>-1-wal -n <NAMESPACE> \
  -o jsonpath='{.spec.storageClassName}{"\n"}'
# → proxmox-lvmthin-ext4 (ou proxmox-lvmthin-xfs)
kubectl --context <CLUSTER_CONTEXT> get storageclass proxmox-lvmthin-ext4 \
  -o jsonpath='{.allowVolumeExpansion}{"\n"}'
# → true

# Agrandir les deux PVC WAL (doubler la taille actuelle ; à adapter)
kubectl --context <CLUSTER_CONTEXT> patch pvc <CLUSTER_NAME>-1-wal \
  -n <NAMESPACE> --type=json \
  -p '[{"op":"replace","path":"/spec/resources/requests/storage","value":"10Gi"}]'

kubectl --context <CLUSTER_CONTEXT> patch pvc <CLUSTER_NAME>-2-wal \
  -n <NAMESPACE> --type=json \
  -p '[{"op":"replace","path":"/spec/resources/requests/storage","value":"10Gi"}]'

# Vérifier que l'agrandissement est pris en compte
kubectl --context <CLUSTER_CONTEXT> get pvc -n <NAMESPACE> | grep <CLUSTER_NAME>
# → CAPACITY à la nouvelle taille une fois le redimensionnement terminé
```

Les trois StorageClass `proxmox-lvmthin-*` de `lungmen.akn` et les deux de `rhodes.akn` déclarent
`allowVolumeExpansion: true` (`projects/*/dist/infrastructure/kubernetes/proxmox/`), et l'expérience Proxmox CSI a
validé l'extension d'un volume (critère V-009 de `docs/experiments/20260617-proxmox-csi-ccm/README.md`,
redimensionnement `kubectl patch` vers `2Gi`). Le dépôt ne dit pas si le redimensionnement se fait en ligne, sans
redémarrage du Pod, ni quand le système de fichiers est étendu : à confirmer sur le cluster. L'incident d'origine
(2026-05-30) s'est déroulé sous Longhorn, qui étendait les volumes en ligne ; ce comportement ne se déduit pas pour
Proxmox CSI.

> [!IMPORTANT] L'agrandissement d'un PVC est irréversible : un PVC ne se réduit pas. Choisir une taille qui laisse assez
> de marge (au minimum de quoi vider les WAL existants, plus 2 à 3 jours de génération). Pour le cluster `apps-secured`
> de l'incident, 10 Gi ont suffi. La taille déclarée dans Git (`walStorage.size` dans
> `projects/lungmen.akn/src/apps/databases/postgres-apps-secured.helmvalues.yaml`) n'est pas modifiée par ce `patch`.

Attendre que les Pods repassent en `Running` avant de continuer. Avec beaucoup de redémarrages, compter jusqu'à 5
minutes.

```sh
# Attendre que les Pods soient Running
kubectl --context <CLUSTER_CONTEXT> get pods -n <NAMESPACE> -w | grep <CLUSTER_NAME>
```

## Étape 3 — Identifier la cause racine dans les logs barman-cloud

Une fois postgres reparti, lire les logs du sidecar barman-cloud pour confirmer l'erreur `Expected empty archive`.

```sh
# Identifier le Pod primaire (2/2 conteneurs Running)
kubectl --context <CLUSTER_CONTEXT> get pods -n <NAMESPACE> | grep <CLUSTER_NAME>
# → noter le nom du Pod 2 (ou de celui qui est primaire)

# Filtrer les erreurs barman-cloud (logs JSON, bruit "retention" exclu)
kubectl --context <CLUSTER_CONTEXT> logs -n <NAMESPACE> <PRIMARY_POD> \
  -c plugin-barman-cloud --since=15m 2>/dev/null \
  | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        msg = d.get('msg', '')
        if 'retention' not in msg.lower():
            print(f'[{d.get(\"level\",\"\")}] {d.get(\"ts\",\"\")[:19]}: {msg[:300]}')
    except:
        pass
" | tail -30
```

Sortie attendue quand la procédure s'applique :

```text
[error] 2026-05-30T17:25:00: WAL archive check failed for server 01KMWETKMBK0MYNB3X7RH6BT0X:
  Expected empty archive
```

> [!NOTE] `barman-cloud-check-wal-archive` s'exécute à chaque redémarrage de Pod, pas seulement à la création du
> cluster. Un basculement qui laisse des données dans le chemin S3 `serverName/` bloque l'archivage de façon permanente
> tant que ce chemin n'est pas vidé.

Si l'erreur n'est pas `Expected empty archive`, s'arrêter : le déplacement S3 de l'étape 4 ne s'applique pas aux autres
types d'erreur.

## Étape 4 — Identifier le chemin S3 et préparer s3cmd

Extraire les coordonnées S3 de la configuration du plugin et de l'`ObjectStore` du cluster.

```sh
# serverName dans la spec du cluster
kubectl --context <CLUSTER_CONTEXT> get cluster <CLUSTER_NAME> -n <NAMESPACE> \
  -o jsonpath='{.spec.plugins[?(@.name=="barman-cloud.cloudnative-pg.io")].parameters.serverName}'
# → par exemple 01KMWETKMBK0MYNB3X7RH6BT0X

# Nom de l'ObjectStore (paramètre barmanObjectName du plugin), puis son destinationPath
kubectl --context <CLUSTER_CONTEXT> get objectstore -n <NAMESPACE>
kubectl --context <CLUSTER_CONTEXT> get objectstore <OBJECTSTORE_NAME> -n <NAMESPACE> \
  -o jsonpath='{.spec.configuration.destinationPath}{"\n"}{.spec.configuration.endpointURL}{"\n"}'
# → par exemple s3://cnpg-lungmen-akn/apps-secured
# → par exemple https://s3.chezmoi.sh

# Identifiants S3 dans le secret
kubectl --context <CLUSTER_CONTEXT> get secret cnpg-backup-credentials \
  -n <NAMESPACE> -o json \
  | python3 -c "
import sys, json, base64
s = json.load(sys.stdin)
for k, v in s['data'].items():
    print(f'{k}={base64.b64decode(v).decode()}')
"
# → access_key_id=...
# → access_secret_key=...
# → region=...

# Installer s3cmd si nécessaire
mise install pipx:s3cmd

# --host prend host[:port] sans schéma : retirer "https://" de endpointURL.
# --host-bucket égal à --host (sans modèle "%(bucket)s") force l'adressage
# path-style plutôt que virtual-hosted, nécessaire pour Garage. À vérifier au
# premier usage ; si le listing échoue, c'est le premier réglage à recontrôler.
S3CMD="mise x pipx:s3cmd -- s3cmd --access_key=<access_key_id> --secret_key=<access_secret_key> --host=<endpoint_host_sans_schema> --host-bucket=<endpoint_host_sans_schema>"

# Vérifier : lister le chemin de destination pour voir le dossier serverName
$S3CMD ls s3://<bucket>/<path>/
# → le dossier serverName apparaît, avec des objets à l'intérieur
```

## Étape 5 — Déplacer le dossier S3 périmé vers .bak

Déplacer le dossier `serverName` vers un suffixe `.bak` au lieu de le supprimer. La sauvegarde de base d'origine reste
ainsi disponible tant que le nouveau cluster n'est pas confirmé stable.

```sh
SERVER_NAME="<serverName relevé à l'étape 4>"
BUCKET_PATH="<bucket/path relevé à l'étape 4>"
# $S3CMD tel que défini à l'étape 4

# Déplacer vers .bak (conserve les données, libère le chemin pour la vérification)
$S3CMD mv --recursive \
  "s3://${BUCKET_PATH}/${SERVER_NAME}/" \
  "s3://${BUCKET_PATH}/${SERVER_NAME}.bak/"

# Vérifier : le chemin d'origine doit être vide ou absent
$S3CMD ls "s3://${BUCKET_PATH}/"
# → seul <SERVER_NAME>.bak/ doit apparaître, brièvement
```

> [!WARNING] Ne pas exécuter `s3cmd rm` sur le dossier. La copie `.bak` protège d'une perte de données si la nouvelle
> sauvegarde de base échoue avant la fin. Supprimer `.bak` uniquement après avoir vérifié qu'une nouvelle sauvegarde de
> base est terminée.

## Étape 6 — Vérifier que l'archivage WAL est actif

Attendre la prochaine tentative d'archivage de barman-cloud et confirmer qu'elle réussit.

```sh
# Suivre les logs barman-cloud sur le Pod primaire
kubectl --context <CLUSTER_CONTEXT> logs -n <NAMESPACE> <PRIMARY_POD> \
  -c plugin-barman-cloud -f 2>/dev/null \
  | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        msg = d.get('msg', '')
        if 'retention' not in msg.lower():
            print(f'[{d.get(\"level\",\"\")}] {d.get(\"ts\",\"\")[:19]}: {msg[:200]}')
    except:
        pass
"
# → attendu : [info] ...: Archived WAL file 000000020000000000000001
#             [info] ...: Archived WAL file 000000020000000000000002

# Confirmer que la condition du cluster est levée
kubectl --context <CLUSTER_CONTEXT> get cluster <CLUSTER_NAME> -n <NAMESPACE> \
  -o jsonpath='{.status.conditions}' | python3 -m json.tool | grep -A3 -i archiv
# → ContinuousArchivingSuccess
```

> [!NOTE] Le Pod réplica (Pod 1) peut rester en `1/2 Running` longtemps pendant qu'il rejoue en streaming les WAL non
> archivés. Ce comportement est normal : l'archivage réussi sur le primaire (Pod 2) suffit à confirmer le correctif.

## Étape 7 — Déclencher une sauvegarde immédiate

L'archivage rétabli, créer une sauvegarde à la demande pour établir un point de reprise propre avant toute migration ou
reconstruction du cluster.

```sh
# Déclencher la sauvegarde avec le script du skill cnpg-backup
# Note : validate-cnpg.sh peut signaler un cluster en mauvais état si le réplica rejoue encore des WAL.
# Le primaire est sain : la validation peut être sautée et la sauvegarde déclenchée directement.
backup_name="$(.agents/skills/cnpg-backup/scripts/backup-cnpg.sh \
  <CLUSTER_NAME> <NAMESPACE> <CLUSTER_CONTEXT>)"
echo "Créée : $backup_name"

# Vérifier la fin de la sauvegarde
sleep 60
.agents/skills/cnpg-backup/scripts/verify-cnpg.sh \
  "$backup_name" <NAMESPACE> <CLUSTER_CONTEXT>
# → COMPLETED: <backup_name>

# Autre possibilité : contrôle direct (groupe d'API complet pour éviter l'ambiguïté avec Velero)
kubectl --context <CLUSTER_CONTEXT> get backup.postgresql.cnpg.io \
  "$backup_name" -n <NAMESPACE>
```

> [!NOTE] Utiliser toujours `kubectl get backup.postgresql.cnpg.io` et non `kubectl get backup` : CNPG et Velero
> exposent chacun une ressource nommée `backup`, et sans le groupe d'API le mauvais type peut être renvoyé.

## Vérifications rapides

- **Phase du cluster** : `kubectl --context <CTX> get cluster <NAME> -n <NS>` — `Cluster in healthy state`
- **Archivage WAL** : condition du cluster `ContinuousArchiving: True (ContinuousArchivingSuccess)`
- **Pods Running** : `kubectl --context <CTX> get pods -n <NS> | grep <NAME>` — les deux Pods en `2/2 Running`
- **Sauvegarde terminée** : `kubectl --context <CTX> get backup.postgresql.cnpg.io <backup_name> -n <NS>` — `completed`
- **Nouveaux WAL sur S3** : `$S3CMD ls s3://<bucket>/<path>/<SERVER_NAME>/wals/` — de nouveaux fichiers WAL sont
  présents

## Retour arrière

**Agrandissement du PVC** : irréversible, car un PVC ne se réduit pas. Le coût est acceptable : un espace WAL plus grand
ne casse rien.

**Déplacement S3** : réversible tant que le dossier `.bak` existe.

```sh
# Restaurer le dossier serverName d'origine depuis .bak ($S3CMD tel que défini à l'étape 4)
$S3CMD mv --recursive \
  "s3://${BUCKET_PATH}/${SERVER_NAME}.bak/" \
  "s3://${BUCKET_PATH}/${SERVER_NAME}/"
```

N'annuler le déplacement S3 que pour abandonner ce chemin de récupération (par exemple pour une reconstruction complète
du cluster depuis une autre source de sauvegarde). L'annulation bloque de nouveau l'archivage WAL.

## Correctif durable : changement d'architecture

Le déplacement S3 règle la panne immédiate mais n'évite pas la récidive après le prochain basculement. Pour les clusters
de homelab où la restauration à un instant précis (point-in-time recovery) via les WAL n'est pas nécessaire, la
configuration suivante est retenue :

- **`isWALArchiver: false`** : désactive le streaming des WAL vers S3. Les WAL sont recyclés après les checkpoints, et
  les sauvegardes de base (`ScheduledBackup`) restent fonctionnelles et suffisent pour une couverture quotidienne.
- **PVC WAL de 2 Gi** : suffisant quand les WAL ne sont pas archivés (recyclage après checkpoint et
  `max_slot_wal_keep_size`).
- **`max_slot_wal_keep_size: 1500MB`** : empêche le retard du slot de réplication de remplir un PVC WAL de 2 Gi ; le
  slot est invalidé et déclenche un `pg_basebackup` au lieu de faire tomber le primaire.
- **`ScheduledBackup` quotidien** avec `immediate: true` : fournit un point de reprise par jour sans streaming des WAL.

Cette configuration est en place sur `lungmen.akn`
(`projects/lungmen.akn/src/apps/databases/postgres-apps-secured.helmvalues.yaml`, `apps-secured.scheduledbackup.yaml`).
Le raisonnement complet est dans [l'incident d'origine](../../incidents/2026-05-30-cnpg-wal-disk-full-apps-secured.md).

## Historique

- _2026-10-11_ : La mention d'ambiguïté du `backup` oppose désormais CNPG à Velero (déployé sur `lungmen.akn`) et non
  plus à Longhorn, qui n'est plus dans l'arbre. L'adresse de l'endpoint S3 est lue dans
  `ObjectStore.spec.configuration.endpointURL` (`https://s3.chezmoi.sh`) au lieu de `endpoint_url` du secret, dont le
  dépôt ne prouve pas l'existence ni la valeur (`:9000`). Exemple de cluster actualisé : `apps-secured-20260530` ; état
  actuel d'`isWALArchiver: false` ajouté.
- _2026-10-11_ : Étape 2 corrigée. Le stockage bloc du dépôt est Proxmox CSI (StorageClass `proxmox-lvmthin-ext4`,
  `-xfs` et `-ext4-retain`, tous avec `allowVolumeExpansion: true`), et non Longhorn ; l'affirmation « Longhorn expands
  online » est retirée, et le caractère en ligne du redimensionnement Proxmox CSI est signalé comme à confirmer sur le
  cluster. L'affirmation « `kubectl get pvc` montre un PVC à 100 % » est corrigée : la commande n'affiche que la
  capacité.
- _2026-10-11_ : Migration vers le standard de documentation (issue #1257) : page traduite en français, structure
  alignée sur le gabarit de procédure, liens vers les procédures renommées.
- _2026-07-24_ : Outillage S3 passé de `mc` (MinIO Client) à `s3cmd`, par cohérence avec la procédure de restauration
  CNPG depuis le stockage objet : `s3cmd` ne demande ni alias ni configuration persistante. Section History convertie du
  tableau vers une liste à puces. Marqueurs de callout `\[!TYPE]` corrigés pour s'afficher comme des alertes GitHub
  (relecture Copilot).
- _2026-05-30_ : Création initiale.

## Pour aller plus loin

- [Incident CNPG WAL PVC saturation](../../incidents/2026-05-30-cnpg-wal-disk-full-apps-secured.md) : l'incident
  d'origine, avec la chronologie et l'analyse de cause racine.
- [Restaurer CNPG depuis le stockage objet](DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md) : reconstruction
  d'un cluster depuis une sauvegarde, si le rétablissement échoue.
- [Restaurer un PVC Velero sous GitOps](../backups/BKP-20260805-00-Restaurer-un-PVC-Velero-sous-GitOps.md) :
  restauration de volumes hors CNPG.
- [Skill cnpg-backup](../../../.agents/skills/cnpg-backup/SKILL.md) : scripts de sauvegarde et de vérification utilisés
  à l'étape 7.
- [Skill cnpg-troubleshoot](../../../.agents/skills/cnpg-troubleshoot/SKILL.md) : diagnostic d'un cluster CNPG dégradé
  et routage vers cette procédure.
