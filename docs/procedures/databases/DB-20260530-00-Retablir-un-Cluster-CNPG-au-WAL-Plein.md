# DB-20260530-00 Rétablir un cluster CNPG au WAL plein

Cette procédure rétablit un cluster CloudNative-PG dont le PVC WAL a atteint 100 % de sa capacité, ce qui empêche CNPG
de démarrer postgres (`Not enough disk space`) : elle agrandit les PVC WAL pour que postgres puisse repartir. Elle
découle de l'incident [CNPG WAL PVC saturation](../../incidents/Incident-2026-05-30-WAL-Plein-CNPG-Apps-Secured.md).
Quand la saturation vient d'un archivage WAL bloqué par `Expected empty archive`, elle se prolonge par
[DB-20260530-01](DB-20260530-01-Corriger-l-Erreur-Expected-Empty-Archive-de-barman-cloud.md), qui traite la cause.

> [!WARNING]\
> Procédure vérifiée contre le dépôt le 2026-10-11 ; ses commandes n'ont pas été rejouées sur un cluster. Le dépôt ne
> dit pas si le redimensionnement d'un PVC avec Proxmox CSI se fait en ligne (voir l'étape 2).

## Cadre technique et conventions

- **Contexte explicite** : toutes les commandes `kubectl` portent `--context`. Ne jamais s'appuyer sur le contexte par
  défaut du kubeconfig, car une opération CNPG sur le mauvais cluster est difficile à défaire.
- **`kubectl get backup` est ambigu** : CNPG et Velero exposent chacun une ressource `backup`. Qualifier toujours :
  `kubectl get backup.postgresql.cnpg.io`.

## Prérequis

Avant de commencer, vérifier que `kubectl` et `jq` sont installés.

Les accès suivants sont également nécessaires :

- accès `kubectl` avec un contexte qui pointe vers le cluster concerné ;
- droit de modifier les PVC du namespace du cluster CNPG (`databases` sur `lungmen.akn`).

## Entrées requises

Exporter ces variables une fois ; toutes les commandes suivantes se copient ensuite telles quelles.

```sh
export CLUSTER_CONTEXT=<contexte kubectl du cluster>   # ex. admin@lungmen.akn
export NAMESPACE=<namespace du cluster CNPG>           # ex. databases
export CLUSTER_NAME=<nom du cluster CNPG>              # ex. apps-secured-20260530 (apps-secured-20260329 lors de l'incident d'origine)
export WAL_SIZE=<nouvelle taille des PVC WAL>          # ex. 10Gi : voir l'étape 2 pour la choisir
```

## Étape 1 — Diagnostiquer l'état du cluster

Identifier la phase du cluster, ses conditions et l'état des Pods pour confirmer que la procédure s'applique.

```sh
# Phase du cluster
kubectl --context $CLUSTER_CONTEXT get cluster $CLUSTER_NAME -n $NAMESPACE
# → phase : "Not enough disk space"  ← la procédure s'applique

# Conditions du cluster
kubectl --context $CLUSTER_CONTEXT get cluster $CLUSTER_NAME -n $NAMESPACE -o json | jq '.status.conditions'
# → noter si ContinuousArchivingFailing apparaît et ce que dit son message

# État des Pods
kubectl --context $CLUSTER_CONTEXT get pods -n $NAMESPACE | grep $CLUSTER_NAME
# → le Pod 1 peut être en CrashLoopBackOff ; le Pod 2 (primaire) peut encore être Running
```

Constats attendus quand la procédure s'applique :

- phase du cluster : `Not enough disk space` ;
- au moins un Pod en `CrashLoopBackOff`.

> [!NOTE]\
> Un nombre élevé de redémarrages ralentit la reprise. Au-delà de 500 redémarrages, le délai du CrashLoopBackOff est
> d'environ 5 minutes : après l'agrandissement du PVC de l'étape 2, le Pod ne redémarre pas immédiatement et il faut
> attendre le cycle suivant.

> [!WARNING]\
> Si la phase est autre (problème de driver de stockage, secret manquant, erreur réseau), la procédure ne s'applique
> pas. S'arrêter et analyser le message réel du cluster avant de continuer.

## Étape 2 — Contrôler les PVC WAL et les agrandir

Confirmer que les PVC WAL sont pleins, puis les agrandir pour laisser à postgres la place de démarrer et aux WAL
archivés le temps de se vider.

`kubectl get pvc` n'affiche que la capacité demandée, pas l'occupation : le signal de saturation est la phase
`Not enough disk space` relevée à l'étape 1.

```sh
# Capacité des PVC (la StorageClass attendue est proxmox-lvmthin-*)
kubectl --context $CLUSTER_CONTEXT get pvc -n $NAMESPACE | grep $CLUSTER_NAME
# → repérer $CLUSTER_NAME-1-wal et $CLUSTER_NAME-2-wal

# Vérifier que la StorageClass autorise l'extension
kubectl --context $CLUSTER_CONTEXT get pvc $CLUSTER_NAME-1-wal -n $NAMESPACE -o jsonpath='{.spec.storageClassName}{"\n"}'
# → proxmox-lvmthin-ext4 (ou proxmox-lvmthin-xfs)
kubectl --context $CLUSTER_CONTEXT get storageclass proxmox-lvmthin-ext4 -o jsonpath='{.allowVolumeExpansion}{"\n"}'
# → true
```

Les trois `StorageClass` `proxmox-lvmthin-*` de `lungmen.akn` et les deux de `rhodes.akn` déclarent
`allowVolumeExpansion: true` (`projects/*/dist/infrastructure/kubernetes/proxmox/`), et l'expérience Proxmox CSI a
validé l'extension d'un volume (critère V-009 de `docs/experiments/20260617-proxmox-csi-ccm/README.md`,
redimensionnement `kubectl patch` vers `2Gi`).

> [!WARNING]\
> Le dépôt ne dit pas si le redimensionnement se fait en ligne, sans redémarrage du Pod, ni quand le système de fichiers
> est étendu : à confirmer sur le cluster. L'incident d'origine (2026-05-30) s'est déroulé sous Longhorn, qui étendait
> les volumes en ligne ; ce comportement ne se déduit pas pour Proxmox CSI.

> [!CAUTION]\
> L'agrandissement d'un PVC est irréversible : un PVC ne se réduit pas. Choisir une taille qui laisse assez de marge (au
> minimum de quoi vider les WAL existants, plus 2 à 3 jours de génération). Pour le cluster `apps-secured` de
> l'incident, 10 Gi ont suffi. La taille déclarée dans Git (`walStorage.size` dans
> `projects/lungmen.akn/src/apps/databases/postgres-apps-secured.helmvalues.yaml`) n'est pas modifiée par ce `patch`.

```sh
# Agrandir les deux PVC WAL
for pvc in $CLUSTER_NAME-1-wal $CLUSTER_NAME-2-wal; do
  kubectl --context $CLUSTER_CONTEXT patch pvc $pvc -n $NAMESPACE --type=json \
    -p "[{\"op\":\"replace\",\"path\":\"/spec/resources/requests/storage\",\"value\":\"$WAL_SIZE\"}]"
done

# Vérifier que l'agrandissement est pris en compte
kubectl --context $CLUSTER_CONTEXT get pvc -n $NAMESPACE | grep $CLUSTER_NAME
# → CAPACITY à la nouvelle taille une fois le redimensionnement terminé
```

## Étape 3 — Attendre le retour des Pods

Attendre que les Pods repassent en `Running` avant de continuer. Avec beaucoup de redémarrages, compter jusqu'à 5
minutes.

```sh
kubectl --context $CLUSTER_CONTEXT get pods -n $NAMESPACE -w | grep $CLUSTER_NAME
# → les Pods passent en Running ; le Pod 2 (primaire) est en 2/2
```

Si la condition `ContinuousArchivingFailing` relevée à l'étape 1 mentionne `Expected empty archive`, ou si les WAL
recommencent à s'accumuler, enchaîner avec
[DB-20260530-01](DB-20260530-01-Corriger-l-Erreur-Expected-Empty-Archive-de-barman-cloud.md).

## Vérifications rapides

- **Phase du cluster** : `kubectl --context $CLUSTER_CONTEXT get cluster $CLUSTER_NAME -n $NAMESPACE` —
  `Cluster in healthy state`
- **Capacité des PVC WAL** : `kubectl --context $CLUSTER_CONTEXT get pvc -n $NAMESPACE | grep $CLUSTER_NAME` — la
  nouvelle taille
- **Pods Running** : `kubectl --context $CLUSTER_CONTEXT get pods -n $NAMESPACE | grep $CLUSTER_NAME` — les deux Pods en
  `2/2 Running`

## Retour arrière

L'agrandissement du PVC est irréversible, car un PVC ne se réduit pas. Le coût est acceptable : un espace WAL plus grand
ne casse rien.

## Historique

- _2026-10-17_ : Reprise après revue : la page est scindée en deux. Celle-ci garde l'urgence (PVC WAL plein) ; le
  traitement de `Expected empty archive`, le déplacement S3, la sauvegarde et le correctif durable passent dans
  DB-20260530-01. Les entrées sont des variables `export`, les logs et les identifiants ne passent plus par `python3`,
  l'avertissement sur le redimensionnement Proxmox CSI et l'avertissement d'irréversibilité sont des callouts séparés,
  et l'état de vérification devient un callout `WARNING`.
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

- [DB-20260530-01](DB-20260530-01-Corriger-l-Erreur-Expected-Empty-Archive-de-barman-cloud.md) : corriger l'archivage
  WAL bloqué par `Expected empty archive`, cause la plus fréquente de l'accumulation de WAL.
- [Incident CNPG WAL PVC saturation](../../incidents/Incident-2026-05-30-WAL-Plein-CNPG-Apps-Secured.md) : l'incident
  d'origine, avec la chronologie et l'analyse de cause racine.
- [Restaurer CNPG depuis le stockage objet](DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md) : reconstruction
  d'un cluster depuis une sauvegarde, si le rétablissement échoue.
- [Skill cnpg-troubleshoot](../../../.agents/skills/cnpg-troubleshoot/SKILL.md) : diagnostic d'un cluster CNPG dégradé
  et routage vers cette procédure.
