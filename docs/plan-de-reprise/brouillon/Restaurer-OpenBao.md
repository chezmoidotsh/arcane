# Restaurer OpenBao

Restaurer l'état d'OpenBao sur un **nouveau** cluster Kubernetes, après la perte et la reconstruction complète de
`rhodes.akn`, qui l'héberge. À la fin du guide, l'instance est descellée (unseal automatique), son stockage PostgreSQL
est restauré depuis S3 et l'accès administrateur est récupéré avec le root token. Ce guide s'insère dans la chaîne
décrite par [Restaurer Rhodes](Restaurer-Rhodes.md), qui donne les prérequis et l'ordre global.

Il restaure une instance **déjà initialisée** : son stockage (montages, politiques, rôles, backends d'authentification,
secrets) arrive depuis le backup et déjà configuré. Il n'y a ni `bao operator init` ni `bao auth enable` ici : les deux
ont eu lieu sur l'instance source et sont inscrits dans les données restaurées. Ce que le guide résout, c'est la
**reprise de l'accès administrateur** à cette instance déjà configurée, avec le root token conservé hors de ce dépôt.

> [!WARNING]\
> Brouillon traduit, non validé : la refonte du plan de reprise est suivie dans
> [l'issue 1109](https://github.com/chezmoidotsh/arcane/issues/1109). Vérifié contre le dépôt le 2026-10-11 ; les
> commandes n'ont pas été rejouées sur les clusters pour cette migration.

## Cadre technique et conventions

| Sujet                       | Fonctionnement                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend de stockage         | PostgreSQL, pas Raft : `storage "postgresql"` dans `config.externalsecret.yaml`. Le cluster CNPG `openbao-database` **est** la donnée d'OpenBao. Le restaurer depuis son backup S3 restaure à l'identique chaque montage, politique, rôle et backend d'authentification, sans rejouer le composant `cluster-vault` de Pulumi.     |
| Unseal automatique          | PKCS#11 via SoftHSM, pas Shamir. Le token et son PIN sont chiffrés avec SOPS dans Git (`sops/softhsm-tokens.secret.yaml`) : c'est le second et dernier élément d'état nécessaire. Sans lui, les données PostgreSQL restaurées ne peuvent plus être déchiffrées, sans solution de repli.                                           |
| Accès administrateur        | Un root token et ses parts de clé de récupération Shamir sont conservés dans le gestionnaire de secrets personnel de l'opérateur, hors Git et hors Pulumi. Aucun token de secours n'est géré par Pulumi, et rien (Pocket-Id compris) ne doit être joignable au préalable : le root token fonctionne dès que OpenBao est descellé. |
| Backends d'authentification | Le backend `kubernetes/` (authentification du provider Vault de Pulumi) et le backend ESO `rhodes.akn` sont configurés par la variante « Local » de `ClusterVaultComponent` (`catalog/pulumi/components/cluster-vault/src/index.ts`), qui ne définit jamais `disableLocalCaJwt` (faux par défaut). Voir ci-dessous.               |

Sans SOPS, pas d'unseal : si `openbao-softhsm-tokens` est perdu, l'instance ne peut être que réinitialisée à vide, ce
qui détruit toutes les données.

Avec `disableLocalCaJwt` à faux, OpenBao redérive le JWT du reviewer et la CA en direct, depuis le ServiceAccount monté
dans son propre Pod, à chaque requête de login, au lieu de se fier à une valeur figée dans le stockage. Les deux
backends refonctionnent donc seuls sur le nouveau cluster, **sans modification manuelle de `auth/kubernetes/config`**,
dès que le `ClusterRoleBinding` `system:auth-delegator` et le `ServiceAccount` `openbao` sont (ré)appliqués (étape 3).
Cette auto-réparation explique que la restauration du stockage suffise malgré la configuration propre à chaque cluster
de ces backends.

## Prérequis

Outils : `kubectl`, `s3cmd`, `kustomize`, `ksops`. Lancer `mise install` depuis `projects/rhodes.akn/` pour les
provisionner tous. Les tâches `dr:openbao:*` citées plus bas ne sont visibles que depuis
[`projects/rhodes.akn/docs/disaster-recovery/`](../../../projects/rhodes.akn/docs/disaster-recovery), qui contient leur
`.mise.toml`.

Accès et état requis :

- Le nouveau cluster est monté jusqu'au CNI, au CSI et au CCM (voir
  [Procédure OMNI-20260721-00](../../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md)), avec
  l'opérateur CNPG, le plugin `barman-cloud.cloudnative-pg.io` et ESO déployés (voir
  [Restaurer Rhodes](Restaurer-Rhodes.md), étape 2). ArgoCD n'est pas nécessaire.
- Un accès `kubectl` au nouveau cluster, avec le droit de créer des namespaces et de gérer des ressources à l'échelle du
  cluster (les liaisons RBAC font partie de ce qui est restauré), configuré selon l'étape de récupération du kubeconfig
  de la procédure OMNI-20260721-00.
- `s3cmd`, `kustomize` et `ksops` dans le `PATH`. `s3cmd` n'a pas besoin de fichier de configuration : les identifiants
  sont passés en options à chaque commande. `kustomize` et `ksops` n'en ont pas besoin non plus.
- Un `SOPS_AGE_KEY_FILE` valide (via `mise install` et l'environnement du dépôt) pour déchiffrer les secrets de
  `vault/sops/`.
- Le root token, récupéré à l'avance dans le gestionnaire de secrets personnel de l'opérateur, nécessaire à l'étape 5.
  Il n'est suivi nulle part dans ce dépôt.

Entrée requise : `CLUSTER_CONTEXT`, le contexte kubectl du nouveau cluster (par exemple `admin@rhodes.akn`).

## Étapes

### 1. Restaurer les secrets d'amorçage du namespace `vault`

Le namespace `vault` et le secret `cnpg-backup-credentials` existent déjà (étape 3 de
[Restaurer Rhodes](Restaurer-Rhodes.md)). Il reste deux secrets, dont aucun ne vient de Vault :

```sh
# openbao-softhsm-tokens : le seul secret qui doit rester chiffré avec SOPS dans Git
# (aucune solution de repli en cas de perte, voir l'avertissement ci-dessous)
kustomize build --enable-alpha-plugins --enable-exec projects/rhodes.akn/src/apps/vault/sops \
  | kubectl --context <CLUSTER_CONTEXT> apply -f -

# openbao-database-credentials : généré localement par un Generator ESO, sans Vault
# (ESO doit déjà être déployé, voir Restaurer Rhodes, étape 2)
kubectl --context <CLUSTER_CONTEXT> apply -n vault -f projects/rhodes.akn/src/apps/vault/database.externalsecret.yaml
```

L'option `-n vault` est indispensable : `database.externalsecret.yaml` n'a pas de champ `namespace:` (il s'appuie sur le
`namespace: vault` de `kustomization.yaml`, que cet `apply` direct contourne). Sans elle, les ressources atterrissent
dans le namespace par défaut du contexte kubectl.

Vérifier que les trois secrets sont présents :

```sh
kubectl --context <CLUSTER_CONTEXT> get secrets -n vault
# → openbao-softhsm-tokens, cnpg-backup-credentials, openbao-database-credentials présents
```

> [!IMPORTANT]\
> Si `openbao-softhsm-tokens` ne se déchiffre pas (`SOPS_AGE_KEY_FILE` erroné ou absent), s'arrêter ici. Rien de la
> suite ne fonctionne sans lui et il n'existe pas de solution de repli (voir le
> [cadre technique](#cadre-technique-et-conventions)).

### 2. Restaurer le cluster CNPG `openbao-database`

Suivre en entier la
[Procédure DB-20260723-00](../../procedures/databases/DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md), avec
les entrées suivantes :

| Entrée                     | Valeur                                                         |
| -------------------------- | -------------------------------------------------------------- |
| `NAMESPACE`                | `vault`                                                        |
| `CLUSTER_MANIFEST`         | `projects/rhodes.akn/src/apps/vault/cnpg.cluster.yaml`         |
| `OBJECTSTORE_MANIFEST`     | `projects/rhodes.akn/src/apps/vault/cnpg.objectstore.yaml`     |
| `SCHEDULEDBACKUP_MANIFEST` | `projects/rhodes.akn/src/apps/vault/cnpg.scheduledbackup.yaml` |

Deux tâches `mise` (à lancer depuis `projects/rhodes.akn/docs/disaster-recovery/`) encapsulent les étapes manuelles :

```sh
mise run dr:openbao:backup:latest -- <CLUSTER_CONTEXT>   # affiche le dernier serverName (étapes 1 et 2 de la procédure)
mise run dr:openbao:patch-recovery -- <SERVER_NAME>      # l'écrit dans cnpg.cluster.yaml (étape 3 de la procédure)
```

La seconde modifie uniquement le fichier et n'exécute aucun `kubectl apply`. Ces tâches reprennent les étapes manuelles
de la procédure : au choix de l'opérateur, selon la voie en laquelle il a le plus confiance en pleine crise.

Revenir ici quand les vérifications rapides de la procédure passent (`Cluster in healthy state`).

> [!WARNING]\
> Le renommage de `metadata.name` par l'étape 3 de la procédure se répercute au-delà de `cnpg.cluster.yaml`.
> `database.externalsecret.yaml` construit l'`uri` de connexion d'OpenBao avec l'hôte `openbao-database-rw`, et son
> commentaire précise qu'il suit `metadata.name` : l'aligner sur le nouveau nom, comme `spec.cluster.name` de
> `cnpg.scheduledbackup.yaml`. Les manifestes de `projects/rhodes.akn/dist/apps/vault/` sont rendus depuis `src/` :
> lancer `dist:render` après ces modifications, sinon l'étape 3 réapplique l'ancien `Cluster` (`openbao-database`,
> ancien `serverName`).

### 3. Appliquer le reste de l'application `vault`

```sh
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/apps/vault/
```

Cette commande applique le `StatefulSet` OpenBao, le `ServiceAccount` `openbao` et le `ClusterRoleBinding`
`system:auth-delegator`, l'`ExternalSecret` `openbao-config` avec son `SecretStore` local, les `Service` et la
`HTTPRoute`. Suivre le démarrage du Pod :

```sh
kubectl --context <CLUSTER_CONTEXT> get pods -n vault -w
```

### 4. Vérifier l'unseal automatique

```sh
POD=$(kubectl --context <CLUSTER_CONTEXT> get pods -n vault -l app.kubernetes.io/name=vault \
  -o jsonpath='{.items[0].metadata.name}')

kubectl --context <CLUSTER_CONTEXT> exec -n vault "$POD" -- bao status -tls-skip-verify
# → Sealed: false
# → Storage Type: postgresql
```

`Sealed: false` confirme deux choses à la fois : les données PostgreSQL restaurées sont intactes et joignables, et le
token et le PIN SoftHSM restaurés à l'étape 1 les déchiffrent correctement par l'unseal automatique PKCS#11.

> [!WARNING]\
> Si `Sealed: true` ou si le Pod est en crash loop, s'arrêter et diagnostiquer avant de poursuivre : ne tenter aucune
> des étapes de reprise d'accès contre une instance scellée. Consulter d'abord `kubectl logs` sur le conteneur
> `openbao`. La cause la plus probable est une discordance entre les données PostgreSQL restaurées et le token SoftHSM
> restauré (par exemple des secrets issus de deux snapshots différents de l'instance source).

### 5. Reprendre l'accès administrateur

Récupérer le root token dans le gestionnaire de secrets personnel (hors bande ; il n'est suivi nulle part dans ce
dépôt). À ce stade d'une vraie reprise, la Gateway et un certificat TLS valide ne sont probablement pas encore
disponibles (ArgoCD n'est pas amorcé, cert-manager n'a peut-être rien émis) : joindre OpenBao directement plutôt que par
`vault.chezmoi.sh`.

```sh
kubectl --context <CLUSTER_CONTEXT> port-forward -n vault svc/openbao 8200:8200 &

export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN="<root token du gestionnaire de secrets>"
bao token lookup   # → confirme le root token (policies: ["root"])
```

`VAULT_TOKEN` est alors une session root, utilisable comme n'importe quel token d'administration pour la suite de la
chaîne :

- `bao secrets list` et `bao auth list` confirment que les montages et backends sont bien restaurés ;
- le `bao write auth/rhodes.akn/config ...` manuel de l'étape 6, si le backend d'authentification Kubernetes ne s'est
  pas auto-réparé ;
- le `pulumi up` de `rhodes-akn-infra` (étape 7 de [Restaurer Rhodes](Restaurer-Rhodes.md)) s'authentifie auprès du même
  `VAULT_ADDR` : exporter le même `VAULT_TOKEN` avant de le lancer.

Une fois la Gateway et un certificat valide confirmés, `VAULT_ADDR` peut passer à `https://vault.chezmoi.sh` (utiliser
la surcharge `/etc/hosts` de [Restaurer Rhodes](Restaurer-Rhodes.md) si le DNS local n'a pas encore rattrapé). Le SSO
Pocket-Id (membre du groupe OIDC `admin`, qui lie `sso-admin-policy`) devient alors la voie d'administration courante ;
l'étape 8 de [Restaurer Rhodes](Restaurer-Rhodes.md) vérifie cet aller-retour.

### 6. Vérifier l'auto-réparation des backends d'authentification Kubernetes

Avec l'accès administrateur de l'étape 5, confirmer qu'ESO s'authentifie par le backend `rhodes.akn` sans aucune
reconfiguration manuelle :

```sh
# Une fois ESO déployé et un SecretStore/ExternalSecret existant pour ce cluster :
kubectl --context <CLUSTER_CONTEXT> get externalsecret -A
# → SecretSyncedError doit disparaître en un intervalle de rafraîchissement ; s'il persiste,
#   reconfigurer à la main :
#   bao write auth/rhodes.akn/config kubernetes_host="https://kubernetes.default.svc.cluster.local" disable_local_ca_jwt=false
```

## Vérifier le résultat

| Contrôle                    | Commande ou page                                                 | Résultat attendu                                      |
| --------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| Cluster CNPG sain           | `kubectl --context <CTX> get cluster openbao-database -n vault`  | `Cluster in healthy state`                            |
| Instance descellée          | `bao status -tls-skip-verify` (via `kubectl exec`)               | `Sealed: false`                                       |
| Accès administrateur        | `bao token lookup` avec le root token exporté dans `VAULT_TOKEN` | `policies: ["root"]`                                  |
| Authentification Kubernetes | `ExternalSecret` du cluster                                      | `SecretSynced`, pas `SecretSyncedError`               |
| Interface web               | `https://vault.chezmoi.sh/ui`                                    | Page de login, instance descellée et non authentifiée |

## Limites connues

L'accès administrateur dépend du gestionnaire de secrets externe. Le root token et ses parts de clé de récupération
Shamir vivent dans le gestionnaire de secrets personnel de l'opérateur, entièrement hors de ce dépôt. Si ce gestionnaire
est lui-même injoignable, l'accès administrateur à l'instance restaurée est bloqué jusqu'à son retour : ce guide n'offre
aucune solution de repli pour ce cas. L'atténuer relève des procédures de sauvegarde et de récupération du gestionnaire
lui-même, hors périmètre ici.

## Historique

- _2026-10-11_ : migration vers le standard de documentation (issue #1257) : guide traduit en français, déplacé dans
  `docs/guides/`, tâches `mise` laissées dans `projects/rhodes.akn/docs/disaster-recovery/`. Vérification contre le
  dépôt : noms de ressources, chemins et variante « Local » de `ClusterVaultComponent` confirmés. Ajout d'un
  avertissement à l'étape 2 : `database.externalsecret.yaml` construit l'`uri` avec l'hôte `openbao-database-rw` (son
  commentaire dit qu'il suit `metadata.name`) et `dist/apps/vault/` contient encore l'ancien `Cluster`
  `openbao-database`, que l'étape 3 réappliquerait si `dist:render` n'est pas relancé après le renommage.
- _2026-07-31_ : retrait de la réserve sur l'auto-réparation : un test de login réel contre le backend
  d'authentification Kubernetes `rhodes.akn` (jeton de ServiceAccount neuf, aucune CA ni aucun JWT de reviewer jamais
  figé dans le stockage) a confirmé que le mécanisme fonctionne comme prévu.
- _2026-07-30_ : renvoi du basculement de `VAULT_ADDR` (étape 5) vers la nouvelle section de surcharge `/etc/hosts` du
  guide d'ensemble, pour atteindre le vrai nom d'hôte avant que le DNS local ne rattrape.
- _2026-07-29_ : remplacement de tout le mécanisme de token de secours (un token `sso-admin-policy` géré par Pulumi,
  d'abord prévu comme stack `rhodes-akn-recovery-token` dédiée pour le tenir hors du verrou `recovery` de
  `rhodes-akn-infra`) par le vrai root token : lui et ses parts de clé de récupération Shamir sont conservés dans le
  gestionnaire de secrets personnel de l'opérateur, ce qui rend inutile toute l'indirection par token géré par Pulumi.
  Étape 5 réduite à une seule voie (récupérer le root token, exporter `VAULT_TOKEN`) ; abandon de la séparation option
  A/B et de la dépendance à la disponibilité de Pocket-Id ; suppression des limites connues « aucune solution de repli
  si les deux voies échouent » et « aucune clé de récupération n'existe », devenues fausses.
- _2026-07-28_ : correction de l'`apply` de `database.externalsecret.yaml` de l'étape 1, qui atterrissait dans le
  mauvais namespace ; ajout de l'option `-n vault` manquante.
- _2026-07-26_ (suite de relecture) : introduction réduite à une phrase renvoyant au guide d'ensemble, qui dupliquait
  les prérequis. Tâche mise `dr:openbao:secrets` supprimée : deux commandes ne justifient pas un wrapper.
- _2026-07-26_ : création du namespace `vault` et appel à `pulumi up` sortis de l'étape 1 : ils ont lieu une seule fois,
  pour ce guide et pour celui de Pocket-Id, dans l'étape 3 du guide d'ensemble.
- _2026-07-25_ : sortie du mot de passe du rôle CNPG d'OpenBao et des identifiants de backup S3 de SOPS (le premier vers
  un `Generator` ESO local, les seconds vers un `Secret` géré directement par Pulumi) ; leur source n'a jamais été le
  vrai Vault, seule leur origine change. Étape 1 réordonnée en conséquence ; ESO doit être déployé d'abord.
- _2026-07-24_ : relecture : correction du nom d'hôte SSO, ajout des mentions de dépendance à la Gateway et au TLS, d'un
  chemin par port-forward pour l'option A et l'étape 4, ajout des tâches mise `openbao:*`, correction des marqueurs
  d'admonition.
- _2026-07-23_ : création initiale, avant tout besoin réel : exercice de reprise proactif avant la migration amiya.akn
  vers rhodes.akn. Étapes 5 et 6 non encore éprouvées sur une vraie recréation de cluster.

## Pour aller plus loin

- [Restaurer Rhodes](Restaurer-Rhodes.md) : la chaîne complète de reprise de `rhodes.akn`, dont ce guide est une étape.
- [Restaurer Pocket-Id](Restaurer-Pocket-Id.md) : la restauration de Pocket-Id, indépendante de celle d'OpenBao.
- [Plan de reprise après sinistre](Plan-de-Reprise-apres-Sinistre.md) : le plan d'ensemble et les priorités de reprise.
- [Procédure DB-20260723-00](../../procedures/databases/DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md) : la
  mécanique de restauration CNPG utilisée à l'étape 2.
- [ADR-002](../../decisions/002-openbao-secrets-topology.md),
  [ADR-003](../../decisions/003-openbao-path-naming-conventions.md) et
  [ADR-004](../../decisions/004-openbao-policy-naming-conventions.md) : les conventions de montages, de chemins et de
  politiques de cette instance, provisionnés par le composant
  [`@chezmoi.sh/pulumi-cluster-vault`](../../../catalog/pulumi/components/cluster-vault/README.md).
