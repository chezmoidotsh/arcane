# DB-20260723-00 Restaurer CNPG depuis le stockage objet

Cette procédure amorce un `Cluster` CloudNative-PG à partir d'un backup existant du plugin
`barman-cloud.cloudnative-pg.io`, soit pour recréer la même base logique sur un nouveau cluster Kubernetes (reprise
après sinistre), soit pour ramener un cluster à son dernier backup sain. Elle est volontairement générique et
indépendante de l'application : les procédures de reprise après sinistre
d'[OpenBao](../../../projects/rhodes.akn/docs/disaster-recovery/openbao.md) et de
[Pocket-Id](../../../projects/rhodes.akn/docs/disaster-recovery/pocket-id.md) l'utilisent comme étape de restauration de
la base au lieu de dupliquer la mécanique. Durée : de quelques minutes à plusieurs dizaines de minutes, selon la taille
du base backup et le volume de WAL à rejouer.

> [!WARNING] Procédure vérifiée contre le dépôt le 2026-10-11 ; ses commandes n'ont pas été rejouées sur un cluster.

## Cadre technique et conventions

Tout cluster CNPG de ce dépôt sauvegardé par le plugin `barman-cloud.cloudnative-pg.io` possède trois coordonnées que
cette procédure relie, et qu'il est facile de confondre :

| Champ                            | Rôle                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serverName`                     | ULID identifiant un dossier S3 précis sous le `destinationPath` de l'`ObjectStore` (`spec.plugins[].parameters.serverName`, ou sous `externalClusters[].plugin.parameters`), par exemple `01KEPSN912SSFFARX3YYZNA22Q` pour `s3://cnpg-rhodes-akn/openbao/01KEPSN912SSFFARX3YYZNA22Q/` |
| `spec.bootstrap.recovery.source` | Libellé arbitraire (la convention du dépôt est le timestamp décodé de l'ULID, par exemple `2026-01-11T08:07:53.126Z`) qui doit correspondre exactement au `name` d'une entrée de `spec.externalClusters[]`                                                                            |
| `spec.externalClusters[].name`   | Libellé référencé par `bootstrap.recovery.source` ; son propre `plugin.parameters.serverName` désigne le dossier S3 réel                                                                                                                                                              |

Les ULID sont triables lexicographiquement par date de création : le dernier dossier d'un listing trié par ordre
alphabétique est le plus récent. La chaîne de résolution est : `bootstrap.recovery.source`, puis recherche dans
`externalClusters[].name`, puis `externalClusters[].plugin.parameters.serverName`, qui donne le dossier S3 réel. Deux de
ces noms sont des libellés (le libellé de `source` et `name`), le troisième (l'ULID) se lit sur S3.

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `kubectl`, `s3cmd`, `kustomize`,
`ksops` (pour déchiffrer les secrets SOPS de l'application source s'ils ne sont pas déjà appliqués).

Les accès suivants sont également nécessaires :

- Accès `kubectl` au cluster cible, avec le droit de créer et modifier des ressources dans le namespace cible.
- Opérateur CNPG et plugin `barman-cloud.cloudnative-pg.io` déjà installés sur le cluster cible (hors périmètre ici :
  cela fait partie du démarrage du cluster, par exemple
  [OMNI-20260721-00](../omni/OMNI-20260721-00.omni-cluster-creation.md)).
- Accès en lecture au bucket S3 de l'`ObjectStore` source (les identifiants viennent du secret `cnpg-backup-credentials`
  du namespace de l'application ; appliquer d'abord le dossier `sops/` de l'application s'il n'y est pas encore).

## Entrées requises

Exporter ces variables une fois ; toutes les commandes suivantes se copient ensuite telles quelles.

```sh
export CLUSTER_CONTEXT=<contexte kubectl du cluster cible>           # ex. admin@rhodes.akn
export NAMESPACE=<namespace du cluster CNPG>                         # ex. vault
export CLUSTER_MANIFEST=<manifeste du Cluster à restaurer>           # ex. projects/rhodes.akn/src/apps/vault/cnpg.cluster.yaml
export OBJECTSTORE_MANIFEST=<manifeste de l'ObjectStore>             # ex. projects/rhodes.akn/src/apps/vault/cnpg.objectstore.yaml
export SCHEDULEDBACKUP_MANIFEST=<manifeste du ScheduledBackup>       # ex. projects/rhodes.akn/src/apps/vault/cnpg.scheduledbackup.yaml
export CLUSTER_NAME=<metadata.name du Cluster>                       # le nom choisi à l'étape 3 si le cluster est renommé
```

Les trois manifestes sont dans le même dossier. Leur nom varie selon le projet : `cnpg.*.yaml` sur `rhodes.akn`,
`<nom>.objectstore.yaml` et `<nom>.scheduledbackup.yaml` sur `lungmen.akn` (par exemple
`projects/lungmen.akn/src/apps/databases/apps.objectstore.yaml`). `kubectl get cluster` après l'étape 4 confirme le nom
réellement utilisé pour `CLUSTER_NAME`.

## Étape 1 — Extraire les coordonnées S3 et les identifiants

```sh
# Bucket et chemin, depuis le manifeste ObjectStore
grep destinationPath $OBJECTSTORE_MANIFEST
# → par exemple : destinationPath: s3://cnpg-rhodes-akn/openbao

# Endpoint, depuis le même manifeste
grep endpointURL $OBJECTSTORE_MANIFEST
# → par exemple : endpointURL: https://s3.chezmoi.sh

# Identifiants : décoder le secret cnpg-backup-credentials déjà appliqué
kubectl --context $CLUSTER_CONTEXT get secret cnpg-backup-credentials -n $NAMESPACE \
  -o go-template='{{range $k, $v := .data}}{{$k}}={{$v | base64decode}}{{"\n"}}{{end}}'
# → access_key_id=...
# → access_secret_key=...
# → region=...
```

Toutes les applications du dépôt ne fournissent pas `cnpg-backup-credentials` de la même façon ; vérifier le cas qui
s'applique avant de supposer l'un ou l'autre chemin. D'après
[`@chezmoi.sh/pulumi-garage-cnpg-backup`](../../../catalog/pulumi/components/garage-cnpg-backup/README.md), la plupart
des clusters l'obtiennent de Vault par un `ExternalSecret` : le secret existe une fois ESO déployé et synchronisé, sans
autre action que de confirmer qu'ESO est sain. `rhodes.akn` (le cluster de plateforme, qui ne peut pas dépendre de Vault
pour ses propres identifiants de backup : dépendance circulaire) l'obtient d'un `Secret` que la stack Pulumi
`rhodes-akn-infra` écrit directement dans le cluster. L'appliquer une fois le namespace cible créé :

```sh
cd projects/rhodes.akn/src/infrastructure/pulumi && pulumi up --refresh --parallel 15
```

Les procédures de reprise après sinistre d'[OpenBao](../../../projects/rhodes.akn/docs/disaster-recovery/openbao.md) et
de [Pocket-Id](../../../projects/rhodes.akn/docs/disaster-recovery/pocket-id.md) sont toutes deux sur `rhodes.akn` et
traitent ce point avant d'appeler cette procédure.

## Étape 2 — Lister le bucket et identifier le dernier backup

La tâche `mise run cnpg:backup:latest -- <context> <namespace> <objectstore_manifest> [credentials_secret]`
(`.mise/tasks/cnpg/backup/latest`, valable pour tout le dépôt et pour tout cluster CNPG sauvegardé par le plugin
`barman-cloud.cloudnative-pg.io`, pas seulement `rhodes.akn`) regroupe cette étape et l'extraction des identifiants de
l'étape 1 en une seule commande. `mise run cnpg:backup:latest --help` détaille les arguments. Comme cette étape, elle
est en lecture seule. Les documents de reprise après sinistre de `rhodes.akn` l'encapsulent dans des tâches par
application, `dr:openbao:backup:latest` et `dr:pocket-id:backup:latest`, qui figent le chemin du manifeste.

```sh
export ACCESS_KEY=<access_key_id de l'étape 1>
export SECRET_KEY=<access_secret_key de l'étape 1>
export ENDPOINT=s3.chezmoi.sh          # hôte seul, sans schéma
export BUCKET_PATH=<bucket/chemin de l'étape 1>     # ex. cnpg-rhodes-akn/openbao

# --host-bucket égal à --host (sans modèle "%(bucket)s") force l'adressage
# path-style plutôt que virtual-hosted, nécessaire pour Garage. À vérifier au
# premier usage : si le listing échoue, c'est la première option à contrôler
# par rapport à l'endpoint.
s3cmd --access_key="$ACCESS_KEY" --secret_key="$SECRET_KEY" \
  --host="$ENDPOINT" --host-bucket="$ENDPOINT" \
  ls "s3://${BUCKET_PATH}/"
# → un dossier par serverName (ULID), par exemple :
#     DIR  s3://cnpg-rhodes-akn/openbao/01KEP1HV1693BFHSVVNCTQWZ7A/
#     DIR  s3://cnpg-rhodes-akn/openbao/01KEPSN912SSFFARX3YYZNA22Q/
# Les ULID sont triés par date de création : le dernier listé est le plus récent.

export SERVER_NAME=<dernier ULID (le plus récent) du listing>

# Confirmer qu'il contient un base backup et des WAL
s3cmd --access_key="$ACCESS_KEY" --secret_key="$SECRET_KEY" \
  --host="$ENDPOINT" --host-bucket="$ENDPOINT" \
  ls "s3://${BUCKET_PATH}/${SERVER_NAME}/"
# → les sous-dossiers "base/" et "wals/" sont attendus
```

## Étape 3 — Renommer le cluster et le pointer vers ce backup

Cette étape modifie quatre champs, dont aucun n'est arbitraire : chacun suit une convention vérifiée sur les manifestes
réels du dépôt.

| Champ                                                              | Valeur                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metadata.name`                                                    | Nouveau suffixe `-YYYYMMDD` (date UTC du jour), qui remplace l'éventuel suffixe existant. La restauration CNPG crée un nouvel objet `Cluster` au lieu de modifier l'ancien en place : la nouvelle incarnation a donc besoin de son propre nom (schéma déjà visible dans `pocket-id-20260530`).                                                                                  |
| `spec.bootstrap.recovery.source` et `spec.externalClusters[].name` | Ce n'est pas l'heure d'exécution de la restauration : c'est le timestamp de création décodé de l'ULID du `serverName` de récupération (chaque occurrence existante dans les manifestes CNPG du dépôt correspond exactement au timestamp décodé de son `serverName` ; un ULID encode un timestamp de 48 bits en millisecondes dans ses 10 premiers caractères Crockford-Base32). |
| `spec.externalClusters[].plugin.parameters.serverName`             | Le `SERVER_NAME` trouvé à l'étape 2, avec un commentaire final `# <timestamp décodé>` de même valeur que ci-dessus.                                                                                                                                                                                                                                                             |
| `spec.plugins[].parameters.serverName`                             | Un ULID généré à neuf, jamais celui du backup récupéré : c'est l'archiveur WAL du cluster pour la suite. Son commentaire final est son propre timestamp décodé (en pratique « maintenant »).                                                                                                                                                                                    |

```yaml
metadata:
  name: <app>-<YYYYMMDD> # À adapter : remplace tout suffixe "-YYYYMMDD" existant
spec:
  bootstrap:
    recovery:
      source: "2026-01-11T08:07:53.126Z" # À adapter : décodé de l'ULID de SERVER_NAME, doit correspondre à externalClusters[].name ci-dessous
  plugins:
    - enabled: true
      isWALArchiver: true
      name: barman-cloud.cloudnative-pg.io
      parameters:
        barmanObjectName: <nom de l'ObjectStore, par exemple selfhosted>
        serverName: "<un ULID NEUF, pas SERVER_NAME>" # À adapter : le commentaire final est le timestamp décodé de cet ULID
  externalClusters:
    - name: "2026-01-11T08:07:53.126Z" # Doit correspondre exactement à bootstrap.recovery.source
      plugin:
        enabled: true
        isWALArchiver: false
        name: barman-cloud.cloudnative-pg.io
        parameters:
          barmanObjectName: <nom de l'ObjectStore, par exemple selfhosted>
          serverName: "<SERVER_NAME de l'étape 2>" # le commentaire final est le timestamp décodé de SERVER_NAME
```

> [!IMPORTANT] `isWALArchiver: false` sur l'entrée `externalClusters[]` est délibéré : l'entrée `spec.plugins[]` de
> premier niveau du cluster (avec le **nouveau** `serverName` généré) archive les WAL pour la suite. Ne pas y réutiliser
> le `serverName` récupéré, qui identifie un autre flux d'archive, déjà clos.

Pour les appelants OpenBao et Pocket-Id de `rhodes.akn`,
`projects/rhodes.akn/docs/disaster-recovery/.mise/tasks/dr/cnpg/patch-recovery-source` (tâche
`dr:cnpg:patch-recovery-source`, encapsulée à son tour par `dr:openbao:patch-recovery` et `dr:pocket-id:patch-recovery`)
automatise toute cette étape, y compris le décodage et la génération des ULID. Elle modifie le fichier uniquement et
n'exécute aucun `kubectl apply`. Cette tâche est locale à ce dossier, contrairement à `cnpg:backup:latest` qui vaut pour
tout le dépôt : il n'existe pas encore d'équivalent générique en dehors de `rhodes.akn`.

> [!WARNING] Le renommage de `metadata.name` ne se limite pas à ce fichier. Le `spec.cluster.name` du manifeste
> `ScheduledBackup` correspondant (et tout label `app.kubernetes.io/instance` ailleurs qui repose sur l'ancien nom) doit
> être aligné à la main : ni cette étape ni la tâche ci-dessus ne le font.

## Étape 4 — Appliquer l'ObjectStore et le Cluster

```sh
kubectl --context $CLUSTER_CONTEXT apply -f $OBJECTSTORE_MANIFEST
kubectl --context $CLUSTER_CONTEXT apply -f $CLUSTER_MANIFEST

# Suivre la restauration
kubectl --context $CLUSTER_CONTEXT get cluster -n $NAMESPACE -w
# → la phase progresse : "Setting up primary", "Recovering instance", puis "Cluster in healthy state"
```

> [!NOTE] Une restauration dure de moins d'une minute à plusieurs dizaines de minutes, selon la taille du base backup et
> le volume de WAL à rejouer depuis. Surveiller avant de conclure à un blocage.

## Étape 5 — Confirmer les données restaurées

```sh
# Phase du cluster
kubectl --context $CLUSTER_CONTEXT get cluster -n $NAMESPACE
# → Cluster in healthy state

# Pods
kubectl --context $CLUSTER_CONTEXT get pods -n $NAMESPACE
# → 2/2 Running (ou 1/2 pour un cluster à instance unique, par exemple openbao-database)
```

Appliquer aussi à ce stade le manifeste `ScheduledBackup` correspondant (même dossier), pour que le cluster restauré
reprenne son propre rythme de backup au lieu de dépendre seulement de l'historique récupéré :

```sh
kubectl --context $CLUSTER_CONTEXT apply -f $SCHEDULEDBACKUP_MANIFEST
```

## Vérifications rapides

- **Phase du cluster** : `kubectl --context $CLUSTER_CONTEXT get cluster $CLUSTER_NAME -n $NAMESPACE` →
  `Cluster in healthy state`
- **Pods Running** : `kubectl --context $CLUSTER_CONTEXT get pods -n $NAMESPACE` → tous les conteneurs `Running`
- **Archivage WAL repris** :
  `kubectl --context $CLUSTER_CONTEXT get cluster $CLUSTER_NAME -n $NAMESPACE -o jsonpath='{.status.conditions}'` →
  `ContinuousArchivingSuccess`
- **ScheduledBackup actif** : `kubectl --context $CLUSTER_CONTEXT get scheduledbackup -n $NAMESPACE`

## Retour arrière

Si un mauvais `serverName` a été choisi (un backup plus ancien ou corrompu) et que la restauration échoue ou produit des
données inattendues :

```sh
# Supprimer le Cluster en échec (et ses PVC ; rien n'est touché sur S3)
kubectl --context $CLUSTER_CONTEXT delete cluster $CLUSTER_NAME -n $NAMESPACE
kubectl --context $CLUSTER_CONTEXT delete pvc -n $NAMESPACE -l cnpg.io/cluster=$CLUSTER_NAME

# Reprendre à l'étape 3 avec le bon serverName
```

Cette procédure ne modifie jamais le backup S3, elle le lit seulement : réessayer est toujours sans risque.

## Historique

- _2026-10-17_ : Reclassement de `BKP-20260723-00` en `DB-20260723-00` : la page restaure une base PostgreSQL, elle vit
  donc avec les procédures CNPG de `databases/`. Aucun contenu modifié hors l'identifiant et les liens relatifs qui
  traversaient le déplacement.
- _2026-10-17_ : Reprise après revue : les entrées sont des variables `export` comme dans la restauration Velero, le
  décodage des identifiants passe par un `go-template` kubectl, la justification de `s3cmd` et la précision sur le skill
  `cnpg-backup` sont retirées, le paragraphe sur le mot de passe du rôle, redondant avec les procédures de reprise après
  sinistre, est supprimé, et l'état de vérification de la procédure est un callout `WARNING`.
- _2026-10-11_ : Migration vers le standard de documentation, en français. Correction : les noms de fichiers cités pour
  les manifestes `ObjectStore` et `ScheduledBackup` référençaient `amiya.akn` et un motif
  `{app}.postgresql-objectstore.yaml` qui n'existent plus dans `projects/` ; ils sont remplacés par
  `<nom>.objectstore.yaml` et `<nom>.scheduledbackup.yaml` de `lungmen.akn`
  (`projects/lungmen.akn/src/apps/databases/`). Le callout de l'étape 2 a été inséré dans le texte et les renvois aux
  autres procédures suivent leurs nouveaux noms.
- _2026-08-06_ : Reclassement de `DB-20260723-00` en `BKP-20260723-00` : c'est fondamentalement une procédure de
  restauration de backup, elle vit donc avec `BKP-20260805-00` dans `docs/procedures/backups/` et non plus dans
  `databases/`. Aucun contenu modifié hors l'identifiant et les liens relatifs qui traversaient le déplacement.
- _2026-07-25_ : Mise à jour de la note sur la source des identifiants à l'étape 1 : le `cnpg-backup-credentials` de
  `rhodes.akn` est passé d'un secret SOPS commité à un `Secret` écrit directement par la stack Pulumi
  `rhodes-akn-infra`, et le `passwordSecret` de son rôle (référencé par `CLUSTER_MANIFEST`) vient désormais d'une paire
  ESO `Generator`/`ExternalSecret` locale plutôt que de SOPS ; les deux contournent toujours Vault pour la même raison
  de dépendance circulaire, seule la source a changé.
- _2026-07-24_ : Revue par un pair : ajout d'un front matter, scission de la note de l'étape 1 entre identifiants
  commités avec SOPS et identifiants fournis par Vault/ESO (toutes les applications du dépôt n'utilisent pas SOPS),
  passage de la justification `s3cmd` contre `mc` en callout, ajout des liens croisés et passage de l'historique au
  format en liste du skill.
- _2026-07-24_ : Extraction du listing et de l'extraction des identifiants de l'étape 2 dans une tâche mise de fichier
  valable pour tout le dépôt, `cnpg:backup:latest` (`.mise/tasks/cnpg/backup/latest`), générique pour tout cluster CNPG
  utilisant le plugin `barman-cloud.cloudnative-pg.io`. Les tâches `dr:openbao:backup:latest` et
  `dr:pocket-id:backup:latest` de `rhodes.akn` lui délèguent désormais au lieu de dupliquer la logique.
- _2026-07-24_ : Réécriture de l'étape 3 : correction d'une hypothèse fausse selon laquelle `bootstrap.recovery.source`
  et `externalClusters[].name` étaient un libellé arbitraire « heure de restauration » ; vérification sur toutes les
  occurrences existantes des manifestes CNPG du dépôt qu'il s'agit toujours du timestamp de création décodé de l'ULID du
  `serverName` de récupération. Ajout de deux points auparavant omis : le renommage de `metadata.name` avec la date du
  jour (une restauration crée un nouvel objet `Cluster`) et la régénération d'un ULID neuf pour
  `spec.plugins[].parameters.serverName` (l'archiveur du nouveau cluster, distinct du `serverName` récupéré).
  Signalement que le `spec.cluster.name` du `ScheduledBackup` correspondant demande le même renommage à la main.
- _2026-07-24_ : Retrait du bloc de front matter ajouté plus tôt le même jour, jugé inutile pour une procédure isolée.
- _2026-07-24_ : Revue de PR GitHub Copilot : correction d'un retour à la ligne qui transformait `already-running` en
  élément de liste Markdown involontaire et suppression de l'échappement de `\[!TYPE]` pour que les callouts s'affichent
  comme de vraies alertes GitHub.
- _2026-07-23_ : Création initiale.

## Pour aller plus loin

- [Documentation CNPG : bootstrap depuis un backup](https://cloudnative-pg.io/documentation/current/bootstrap/#bootstrap-from-a-backup)
  : la référence amont du mécanisme `bootstrap.recovery`.
- [Documentation CNPG : backup et plugin barman-cloud](https://cloudnative-pg.io/documentation/current/backup/) :
  fonctionnement du plugin dont cette procédure restaure les backups.
- [DB-20260530-00](../databases/DB-20260530-00-Retablir-un-Cluster-CNPG-au-WAL-Plein.md) : même extraction des
  coordonnées S3, appliquée à un incident sur un cluster vivant plutôt qu'à une restauration complète.
- [`@chezmoi.sh/pulumi-garage-cnpg-backup`](../../../catalog/pulumi/components/garage-cnpg-backup/README.md) : origine
  de `cnpg-backup-credentials` selon le cluster (Vault/ESO ou `Secret` Pulumi), référencée à l'étape 1.
