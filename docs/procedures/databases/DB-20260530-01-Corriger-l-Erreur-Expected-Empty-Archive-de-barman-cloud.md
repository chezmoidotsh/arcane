# DB-20260530-01 Corriger l'erreur Expected empty archive de barman-cloud

Cette procédure débloque l'archivage WAL d'un cluster CloudNative-PG que `barman-cloud-check-wal-archive` refuse avec
l'erreur `Expected empty archive` : le dossier `serverName` du bucket S3 contient déjà des données, l'archivage échoue
donc en continu et les WAL s'accumulent jusqu'à saturer le PVC WAL. Elle déplace ce dossier vers un suffixe `.bak`,
vérifie que l'archivage repart, puis déclenche une sauvegarde. Elle découle de l'incident
[CNPG WAL PVC saturation](../../incidents/2026-05-30-cnpg-wal-disk-full-apps-secured.md). Si le PVC WAL est déjà plein,
rétablir d'abord le cluster avec [DB-20260530-00](DB-20260530-00-Retablir-un-Cluster-CNPG-au-WAL-Plein.md).

> [!WARNING] Procédure vérifiée contre le dépôt le 2026-10-11 ; ses commandes n'ont pas été rejouées sur un cluster.

> [!NOTE] Les clusters CNPG de `lungmen.akn` déclarent aujourd'hui `isWALArchiver: false`
> (`projects/lungmen.akn/src/apps/databases/postgres-apps*.helmvalues.yaml`) : l'archivage WAL y est désactivé, et cette
> erreur ne les concerne plus. La procédure reste valable pour tout cluster qui archive ses WAL vers un stockage objet.

## Cadre technique et conventions

- **Contexte explicite** : toutes les commandes `kubectl` portent `--context`. Ne jamais s'appuyer sur le contexte par
  défaut du kubeconfig, car une opération CNPG sur le mauvais cluster est difficile à défaire.
- **`s3cmd`** : les opérations S3 passent par `s3cmd`, avec les identifiants en options à chaque appel (aucun alias ni
  fichier de configuration persistant).
- **`kubectl get backup` est ambigu** : CNPG et Velero exposent chacun une ressource `backup`. Qualifier toujours :
  `kubectl get backup.postgresql.cnpg.io`.
- **`barman-cloud-check-wal-archive` s'exécute à chaque redémarrage de Pod**, pas seulement à la création du cluster. Un
  basculement qui laisse des données dans le chemin S3 `serverName/` bloque l'archivage de façon permanente tant que ce
  chemin n'est pas vidé.

## Prérequis

Avant de commencer, vérifier que `kubectl`, `jq` et `s3cmd` sont installés.

Les accès suivants sont également nécessaires :

- accès `kubectl` avec un contexte qui pointe vers le cluster concerné ;
- accès en lecture au namespace du cluster CNPG (`databases` sur `lungmen.akn`) ;
- accès en écriture au bucket S3 (identifiants dans le secret `cnpg-backup-credentials` du namespace du cluster) ;
- un cluster dont les Pods sont `Running` : un PVC WAL plein se traite d'abord avec
  [DB-20260530-00](DB-20260530-00-Retablir-un-Cluster-CNPG-au-WAL-Plein.md).

## Entrées requises

Exporter ces variables une fois ; toutes les commandes suivantes se copient ensuite telles quelles.

```sh
export CLUSTER_CONTEXT=<contexte kubectl du cluster>   # ex. admin@lungmen.akn
export NAMESPACE=<namespace du cluster CNPG>           # ex. databases
export CLUSTER_NAME=<nom du cluster CNPG>              # ex. apps-secured-20260530
export PRIMARY_POD=<Pod primaire du cluster>           # voir l'étape 1 (celui en 2/2 Running)
```

## Étape 1 — Confirmer la cause dans les logs barman-cloud

Lire les logs du sidecar barman-cloud pour confirmer l'erreur `Expected empty archive` avant de toucher au bucket.

```sh
# Identifier le Pod primaire (2/2 conteneurs Running)
kubectl --context $CLUSTER_CONTEXT get pods -n $NAMESPACE | grep $CLUSTER_NAME
# → noter le nom du Pod 2 (ou de celui qui est primaire) et l'exporter dans PRIMARY_POD

# Conditions du cluster : ContinuousArchivingFailing doit apparaître
kubectl --context $CLUSTER_CONTEXT get cluster $CLUSTER_NAME -n $NAMESPACE -o json | jq '.status.conditions'

# Erreurs barman-cloud (les logs sont en JSON ; le bruit "retention" est exclu)
kubectl --context $CLUSTER_CONTEXT logs -n $NAMESPACE $PRIMARY_POD -c plugin-barman-cloud --since=15m \
  | jq -Rr 'fromjson? | select(.msg | test("retention"; "i") | not) | "[\(.level)] \(.ts[:19]): \(.msg[:300])"' | tail -30
```

Sortie attendue quand la procédure s'applique :

```text
[error] 2026-05-30T17:25:00: WAL archive check failed for server 01KMWETKMBK0MYNB3X7RH6BT0X:
  Expected empty archive
```

Si l'erreur n'est pas `Expected empty archive`, s'arrêter : le déplacement S3 de l'étape 3 ne s'applique pas aux autres
types d'erreur (problème de driver de stockage, secret manquant, erreur réseau).

## Étape 2 — Identifier le chemin S3 et préparer s3cmd

Extraire les coordonnées S3 de la configuration du plugin et de l'`ObjectStore` du cluster.

```sh
# serverName dans la spec du cluster
kubectl --context $CLUSTER_CONTEXT get cluster $CLUSTER_NAME -n $NAMESPACE \
  -o jsonpath='{.spec.plugins[?(@.name=="barman-cloud.cloudnative-pg.io")].parameters.serverName}'
# → par exemple 01KMWETKMBK0MYNB3X7RH6BT0X

# Nom de l'ObjectStore (paramètre barmanObjectName du plugin), puis son destinationPath
kubectl --context $CLUSTER_CONTEXT get objectstore -n $NAMESPACE
kubectl --context $CLUSTER_CONTEXT get objectstore <OBJECTSTORE_NAME> -n $NAMESPACE \
  -o jsonpath='{.spec.configuration.destinationPath}{"\n"}{.spec.configuration.endpointURL}{"\n"}'
# → par exemple s3://cnpg-lungmen-akn/apps-secured
# → par exemple https://s3.chezmoi.sh

# Identifiants S3 dans le secret
kubectl --context $CLUSTER_CONTEXT get secret cnpg-backup-credentials -n $NAMESPACE \
  -o go-template='{{range $k, $v := .data}}{{$k}}={{$v | base64decode}}{{"\n"}}{{end}}'
# → access_key_id=...
# → access_secret_key=...
# → region=...
```

Renseigner ensuite les variables S3 à partir de ces sorties :

```sh
export SERVER_NAME=<serverName relevé ci-dessus>       # ex. 01KMWETKMBK0MYNB3X7RH6BT0X
export BUCKET_PATH=<bucket/chemin du destinationPath>  # ex. cnpg-lungmen-akn/apps-secured
export S3_HOST=<hôte de endpointURL, sans https://>    # ex. s3.chezmoi.sh

# Une fonction plutôt qu'une variable : elle garde les arguments intacts dans bash comme dans zsh.
# --host-bucket égal à --host (sans modèle "%(bucket)s") force l'adressage path-style plutôt que virtual-hosted,
# nécessaire pour Garage. À vérifier au premier usage ; si le listing échoue, c'est le premier réglage à recontrôler.
s3() { s3cmd --access_key=<access_key_id> --secret_key=<access_secret_key> --host=$S3_HOST --host-bucket=$S3_HOST "$@"; }

# Vérifier : lister le chemin de destination pour voir le dossier serverName
s3 ls "s3://${BUCKET_PATH}/"
# → le dossier serverName apparaît, avec des objets à l'intérieur
```

## Étape 3 — Déplacer le dossier S3 périmé vers .bak

Déplacer le dossier `serverName` vers un suffixe `.bak` au lieu de le supprimer. La sauvegarde de base d'origine reste
ainsi disponible tant que le nouveau cluster n'est pas confirmé stable. Le déplacement n'interrompt aucun processus
postgres.

```sh
# Déplacer vers .bak (conserve les données, libère le chemin pour la vérification)
s3 mv --recursive "s3://${BUCKET_PATH}/${SERVER_NAME}/" "s3://${BUCKET_PATH}/${SERVER_NAME}.bak/"

# Vérifier : le chemin d'origine doit être vide ou absent
s3 ls "s3://${BUCKET_PATH}/"
# → seul ${SERVER_NAME}.bak/ doit apparaître, brièvement
```

> [!WARNING] Ne pas exécuter `s3cmd rm` sur le dossier. La copie `.bak` protège d'une perte de données si la nouvelle
> sauvegarde de base échoue avant la fin. Supprimer `.bak` uniquement après avoir vérifié qu'une nouvelle sauvegarde de
> base est terminée.

## Étape 4 — Vérifier que l'archivage WAL est actif

Attendre la prochaine tentative d'archivage de barman-cloud et confirmer qu'elle réussit.

```sh
# Suivre les logs barman-cloud sur le Pod primaire
kubectl --context $CLUSTER_CONTEXT logs -n $NAMESPACE $PRIMARY_POD -c plugin-barman-cloud -f \
  | jq -Rr 'fromjson? | select(.msg | test("retention"; "i") | not) | "[\(.level)] \(.ts[:19]): \(.msg[:200])"'
# → attendu : [info] ...: Archived WAL file 000000020000000000000001
#             [info] ...: Archived WAL file 000000020000000000000002

# Confirmer que la condition du cluster est levée
kubectl --context $CLUSTER_CONTEXT get cluster $CLUSTER_NAME -n $NAMESPACE -o json \
  | jq '.status.conditions[] | select(.type | test("archiv"; "i"))'
# → ContinuousArchivingSuccess
```

> [!NOTE] Le Pod réplica (Pod 1) peut rester en `1/2 Running` longtemps pendant qu'il rejoue en streaming les WAL non
> archivés. Ce comportement est normal : l'archivage réussi sur le primaire (Pod 2) suffit à confirmer le correctif.

## Étape 5 — Déclencher une sauvegarde immédiate

L'archivage rétabli, créer une sauvegarde à la demande pour établir un point de reprise propre avant toute migration ou
reconstruction du cluster.

```sh
# Déclencher la sauvegarde avec le script du skill cnpg-backup
# Note : validate-cnpg.sh peut signaler un cluster en mauvais état si le réplica rejoue encore des WAL.
# Le primaire est sain : la validation peut être sautée et la sauvegarde déclenchée directement.
export BACKUP_NAME="$(.agents/skills/cnpg-backup/scripts/backup-cnpg.sh $CLUSTER_NAME $NAMESPACE $CLUSTER_CONTEXT)"
echo "Créée : $BACKUP_NAME"

# Vérifier la fin de la sauvegarde
sleep 60
.agents/skills/cnpg-backup/scripts/verify-cnpg.sh "$BACKUP_NAME" $NAMESPACE $CLUSTER_CONTEXT
# → COMPLETED: <nom de la sauvegarde>

# Autre possibilité : contrôle direct
kubectl --context $CLUSTER_CONTEXT get backup.postgresql.cnpg.io "$BACKUP_NAME" -n $NAMESPACE
```

## Vérifications rapides

- **Phase du cluster** : `kubectl --context $CLUSTER_CONTEXT get cluster $CLUSTER_NAME -n $NAMESPACE` —
  `Cluster in healthy state`
- **Archivage WAL** : condition du cluster `ContinuousArchiving: True (ContinuousArchivingSuccess)`
- **Pods Running** : `kubectl --context $CLUSTER_CONTEXT get pods -n $NAMESPACE | grep $CLUSTER_NAME` — les deux Pods en
  `2/2 Running`
- **Sauvegarde terminée** :
  `kubectl --context $CLUSTER_CONTEXT get backup.postgresql.cnpg.io $BACKUP_NAME -n $NAMESPACE` — `completed`
- **Nouveaux WAL sur S3** : `s3 ls "s3://${BUCKET_PATH}/${SERVER_NAME}/wals/"` — de nouveaux fichiers WAL sont présents

## Retour arrière

Le déplacement S3 est réversible tant que le dossier `.bak` existe.

```sh
# Restaurer le dossier serverName d'origine depuis .bak
s3 mv --recursive "s3://${BUCKET_PATH}/${SERVER_NAME}.bak/" "s3://${BUCKET_PATH}/${SERVER_NAME}/"
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

- _2026-10-17_ : Création, par scission de DB-20260530-00 : le traitement de l'erreur `Expected empty archive`
  (diagnostic dans les logs, déplacement S3, vérification de l'archivage, sauvegarde, correctif durable) devient une
  procédure à part. Les identifiants S3 sont décodés avec un `go-template` kubectl, les logs filtrés avec `jq`, et
  `s3cmd` est appelé directement, sans passer par `mise`.

## Pour aller plus loin

- [DB-20260530-00](DB-20260530-00-Retablir-un-Cluster-CNPG-au-WAL-Plein.md) : rétablir un cluster dont le PVC WAL est
  plein, à faire avant celle-ci si les Pods ne démarrent pas.
- [Incident CNPG WAL PVC saturation](../../incidents/2026-05-30-cnpg-wal-disk-full-apps-secured.md) : l'incident
  d'origine, avec la chronologie et l'analyse de cause racine.
- [Restaurer CNPG depuis le stockage objet](DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md) : reconstruction
  d'un cluster depuis une sauvegarde, si le rétablissement échoue.
- [Skill cnpg-backup](../../../.agents/skills/cnpg-backup/SKILL.md) : scripts de sauvegarde et de vérification utilisés
  à l'étape 5.
- [Skill cnpg-troubleshoot](../../../.agents/skills/cnpg-troubleshoot/SKILL.md) : diagnostic d'un cluster CNPG dégradé
  et routage vers cette procédure.
