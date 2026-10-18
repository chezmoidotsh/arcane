# Restaurer Pocket-Id

Ce guide restaure l'état de Pocket-Id sur un **nouveau** cluster Kubernetes, après la perte et la reconstruction de
`rhodes.akn`, le cluster qui l'héberge. À la fin, la base CNPG de Pocket-Id est restaurée depuis son backup S3, le Pod
`pocket-id-server` tourne et `auth.chezmoi.sh` sert les connexions. Le guide d'ensemble
[Restaurer Rhodes](Restaurer-Rhodes.md) donne les prérequis et la place de cette étape dans la chaîne de reprise.

> [!WARNING]\
> Brouillon traduit, non validé : la refonte du plan de reprise est suivie dans
> [l'issue 1109](https://github.com/chezmoidotsh/arcane/issues/1109). Vérifié contre le dépôt le 2026-10-11 ; les
> commandes n'ont pas été rejouées sur les clusters pour cette migration.

Contrairement à [Restaurer OpenBao](Restaurer-OpenBao.md), la reprise de Pocket-Id est simple : pas de HSM, pas de seal
à déverrouiller, pas de dépendance circulaire pour l'accès admin. Restaurer sa base et son secret d'application suffit
pour qu'il serve de nouveau les connexions. La reprise admin d'OpenBao ne dépend plus de Pocket-Id (le root token
fonctionne seul, voir [Restaurer OpenBao](Restaurer-OpenBao.md)) : les deux restaurations sont indépendantes et se font
dans n'importe quel ordre. Ce guide reste séparé parce que sa forme (ni HSM ni seal) prêterait à confusion dans celui
d'OpenBao.

> [!IMPORTANT]\
> Pocket-Id exige que la Gateway et un certificat TLS valide (cert-manager) servent `auth.chezmoi.sh` pour être
> utilisable de bout en bout : les passkeys (WebAuthn) demandent un « secure context », donc du HTTPS, et ne
> s'enregistrent ni ne s'authentifient en HTTP simple ou via un port-forward. Si la Gateway ou cert-manager ne sont pas
> encore prêts sur le nouveau cluster, la vérification de l'étape 4 passe via un port-forward, mais la connexion par
> passkey reste impossible jusqu'à ce que le HTTPS fonctionne. Cela bloque alors la vérification du SSO Pocket-Id vers
> OpenBao (étape 8 de [Restaurer Rhodes](Restaurer-Rhodes.md)).

## Avant de commencer

Outils nécessaires : `kubectl`, `s3cmd`, `kustomize`, `ksops`. `mise install` exécuté depuis `projects/rhodes.akn/` les
provisionne tous. Les tâches `dr:pocket-id:*` utilisées plus bas sont définies dans
`projects/rhodes.akn/docs/disaster-recovery/.mise.toml` : `mise install` doit aussi avoir été exécuté depuis ce dossier.

Accès et état requis :

- Le nouveau cluster est monté jusqu'à CNI, CSI et CCM (voir
  [OMNI-20260721-00](../../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md)), avec l'opérateur
  CNPG, le plugin `barman-cloud.cloudnative-pg.io` et ESO déployés (étape 2 de [Restaurer Rhodes](Restaurer-Rhodes.md)).
  ArgoCD et OpenBao ne sont pas nécessaires : aucun secret de Pocket-Id ne vient du vrai Vault, seulement du `Generator`
  local d'ESO et de la stack Pulumi du dépôt (étape 1).
- Une `SOPS_AGE_KEY_FILE` valide (via `mise install` et l'environnement du dépôt) pour déchiffrer les secrets de
  `pocket-id/sops/`.
- L'accès à la stack Pulumi `rhodes.akn` (`pulumi login`, bonne stack sélectionnée), nécessaire pour les identifiants S3
  de backup (étape 1).
- Pour vérifier la connexion par passkey de bout en bout (étape 4), la Gateway et un certificat TLS valide pour
  `auth.chezmoi.sh` (voir l'encadré ci-dessus).

Exporter le contexte `kubectl` du nouveau cluster une fois ; les commandes suivantes se copient ensuite telles quelles :

```sh
export CLUSTER_CONTEXT=<contexte kubectl du nouveau cluster>   # ex. admin@rhodes.akn
```

## Étapes

### 1. Restaurer les secrets d'amorçage du namespace `pocket-id`

Le namespace `pocket-id` et le secret `cnpg-backup-credentials` existent déjà (étape 3 de
[Restaurer Rhodes](Restaurer-Rhodes.md)) : `cnpg-backup-credentials` est un `Secret` créé par la stack Pulumi
(`projects/rhodes.akn/src/infrastructure/pulumi/stack/cloudnative-pg.ts`). Il reste deux secrets, dont aucun ne vient de
Vault (Pocket-Id n'a aucune dépendance à Vault, par conception) :

```sh
# pocket-id-secrets : le seul secret qui reste chiffré avec SOPS dans le dépôt
# (le secret de configuration de l'application, voir sops/config.secret.yaml)
kustomize build --enable-alpha-plugins --enable-exec projects/rhodes.akn/src/apps/pocket-id/sops \
  | kubectl --context ${CLUSTER_CONTEXT} apply -f -

# pocket-id-database-pocket-id : généré localement par un Generator d'ESO, sans
# Vault. ESO doit déjà être déployé (étape 2 de Restaurer Rhodes).
kubectl --context ${CLUSTER_CONTEXT} apply -f projects/rhodes.akn/src/apps/pocket-id/database.externalsecret.yaml
```

Vérifier que les trois secrets sont présents :

```sh
kubectl --context ${CLUSTER_CONTEXT} get secrets -n pocket-id
# → pocket-id-secrets, cnpg-backup-credentials, pocket-id-database-pocket-id présents
```

### 2. Restaurer le cluster CNPG de Pocket-Id

Suivre en entier la procédure
[DB-20260723-00](../../procedures/databases/DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md), avec :

```sh
export NAMESPACE=pocket-id
export CLUSTER_MANIFEST=projects/rhodes.akn/src/apps/pocket-id/cnpg.cluster.yaml
export OBJECTSTORE_MANIFEST=projects/rhodes.akn/src/apps/pocket-id/cnpg.objectstore.yaml
export SCHEDULEDBACKUP_MANIFEST=projects/rhodes.akn/src/apps/pocket-id/cnpg.scheduledbackup.yaml
```

Deux tâches `mise` (définies dans `projects/rhodes.akn/docs/disaster-recovery/.mise.toml`) allègent la procédure :
`mise run dr:pocket-id:backup:latest -- ${CLUSTER_CONTEXT}` affiche le dernier `serverName`, et
`mise run dr:pocket-id:patch-recovery -- <SERVER_NAME>` l'écrit dans `cnpg.cluster.yaml`. Cette seconde tâche modifie le
fichier uniquement et n'exécute aucun `kubectl apply`.

Le nom du cluster (`pocket-id-20260530`) embarque un suffixe de génération qui change à chaque recréation du cluster,
selon le même schéma que prend en compte le script de découverte du skill `cnpg-backup`. Confirmer le nom courant dans
`projects/rhodes.akn/src/apps/pocket-id/cnpg.cluster.yaml` au lieu de supposer que cette valeur s'applique encore.

> [!WARNING]\
> Ce nom apparaît aussi dans l'`uri` de `database.externalsecret.yaml` (hôte `pocket-id-20260530-rw`) et dans
> `cnpg.scheduledbackup.yaml` (`spec.cluster.name`). Si la procédure renomme le cluster, aligner ces deux fichiers à la
> main et réappliquer l'`ExternalSecret` ; la tâche `dr:pocket-id:patch-recovery` ne les modifie pas.

Revenir ici quand les vérifications rapides de cette procédure passent (`Cluster in healthy state`).

### 3. Appliquer le reste de l'application `pocket-id`

Les manifestes de `dist/` sont rendus depuis `src/`. Si l'étape 2 a modifié `src/apps/pocket-id/` (nouveau nom ou
nouveau `serverName`), régénérer `dist/` avant de l'appliquer, sans quoi `dist/` réapplique l'ancien `Cluster` :

```sh
dist:render projects/rhodes.akn/src/apps/pocket-id
kubectl --context ${CLUSTER_CONTEXT} apply -f projects/rhodes.akn/dist/apps/pocket-id/
```

Suivre le démarrage :

```sh
kubectl --context ${CLUSTER_CONTEXT} get pods -n pocket-id -w
# → le Pod pocket-id-server est Running
```

### 4. Vérifier que Pocket-Id sert les connexions

Si la Gateway et un certificat valide pour `auth.chezmoi.sh` sont déjà en place :

```sh
curl -sI https://auth.chezmoi.sh/ | head -1
# → HTTP/2 200 (ou une redirection vers la page de connexion)
```

Pour valider la connexion par passkey, préférer l'override `/etc/hosts` décrit dans
[Restaurer Rhodes](Restaurer-Rhodes.md) : un port-forward confirme que l'application est saine, mais pas la connexion
par passkey (voir l'encadré plus haut).

```sh
kubectl --context ${CLUSTER_CONTEXT} port-forward -n pocket-id svc/pocket-id 8080:80 &
curl -sI http://localhost:8080/ | head -1
# → HTTP/1.1 200 (ou une redirection vers la page de connexion)
```

Ce test confirme que la base et le secret d'application de Pocket-Id sont correctement restaurés : l'interface de
connexion, les comptes utilisateurs et les clients OIDC enregistrés vivent tous dans la base CNPG restaurée à l'étape 2.
La vérification du SSO vers OpenBao (Pocket-Id y est un fournisseur, pas une propriété de Pocket-Id) est à l'étape 8 de
[Restaurer Rhodes](Restaurer-Rhodes.md) et n'est pas répétée ici.

## Vérifier le résultat

| Contrôle              | Commande                                                             | Résultat attendu                                 |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| Cluster CNPG sain     | `kubectl --context <CTX> get cluster pocket-id-<gen> -n pocket-id`   | `Cluster in healthy state`                       |
| Pod en marche         | `kubectl --context <CTX> get pods -n pocket-id`                      | `Running`                                        |
| HTTP joignable        | `curl -sI https://auth.chezmoi.sh/`                                  | `200` ou redirection, pas d'erreur de connexion  |
| Connexion par passkey | Parcours de connexion complet (Gateway et certificat valides requis) | La connexion réussit, pas seulement le test HTTP |

## Historique

- _2026-10-11_ : Migration vers le standard de documentation (issue #1257) : traduction en français, déplacement vers
  `docs/guides/`. Ajout du renommage en cascade (`uri` de l'`ExternalSecret` et `ScheduledBackup`), vérifié dans
  `database.externalsecret.yaml` (hôte `pocket-id-20260530-rw`) et `cnpg.scheduledbackup.yaml`
  (`spec.cluster.name: pocket-id-20260530`). Étape 3 : `dist:render` avant `kubectl apply -f dist/` quand l'étape 2
  modifie `src/`, `dist/` étant rendu depuis `src/` (ADR-011). Chemins des tâches `dr:pocket-id:*` précisés :
  `projects/rhodes.akn/docs/disaster-recovery/.mise.toml`.
- _2026-09-06_ : Retrait des références obsolètes à un découpage « Option A/B » et à une dépendance à la disponibilité
  de Pocket-Id dans l'étape 5 du guide OpenBao (découpage abandonné le 2026-07-29, quand le root token autonome a
  remplacé le mécanisme de break-glass). Références vers le SSO repointées sur l'étape 8 du guide d'ensemble.
- _2026-07-30_ : La validation par passkey de l'étape 4 renvoie à la nouvelle section `/etc/hosts` du guide d'ensemble,
  le port-forward ne pouvant pas valider la connexion par passkey (pas de secure context).
- _2026-07-26_ : Suite de relecture : introduction réduite à une phrase renvoyant au guide d'ensemble ; tâche `mise`
  `dr:pocket-id:secrets` supprimée (deux commandes ne justifient pas un wrapper).
- _2026-07-26_ : La création du namespace `pocket-id` et l'appel à `pulumi up` quittent l'étape 1 : ils se font une
  fois, pour ce guide et celui d'OpenBao, à l'étape 3 du guide d'ensemble.
- _2026-07-25_ : Le mot de passe du rôle CNPG de Pocket-Id et les identifiants S3 de backup quittent SOPS : le premier
  passe à un `Generator` ESO local, les seconds à un `Secret` géré directement par Pulumi. Ni l'un ni l'autre ne
  venaient du vrai Vault, seule leur origine change. Étape 1 réordonnée en conséquence ; ESO doit être déployé d'abord.
- _2026-07-24_ : Relecture : correction du nom d'hôte (`id.` vers `auth.chezmoi.sh`), ajout de l'encadré sur la
  dépendance Gateway et passkey, retrait de l'étape SSO OpenBao hors périmètre, ajout des tâches `mise` `pocket-id:*`,
  correction des marqueurs d'encadré et du commentaire de vérification de l'étape 1.
- _2026-07-23_ : Création initiale, avant tout besoin réel, en même temps que le guide OpenBao : exercice de reprise
  proactif avant la migration `amiya.akn` vers `rhodes.akn`.

## Pour aller plus loin

- [Restaurer Rhodes](Restaurer-Rhodes.md) : le guide d'ensemble de la reprise de `rhodes.akn`, dont cette étape fait
  partie.
- [Restaurer OpenBao](Restaurer-OpenBao.md) : la restauration d'OpenBao, indépendante de celle-ci.
- [DB-20260723-00](../../procedures/databases/DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md) : la mécanique
  de restauration CNPG utilisée à l'étape 2.
- [Plan de reprise après sinistre](Plan-de-Reprise-apres-Sinistre.md) : le plan global dans lequel s'inscrit ce guide.
