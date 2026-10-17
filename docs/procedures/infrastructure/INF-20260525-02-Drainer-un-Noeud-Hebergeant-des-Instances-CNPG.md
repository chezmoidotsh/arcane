# INF-20260525-02 Drainer un noeud hébergeant des instances CNPG

Un nœud est drainé pendant une mise à jour de Talos pilotée par Omni (voir
[INF-20260525-00](./INF-20260525-00-Mettre-a-Jour-Talos-avec-Omni.md)) et lors de tout `kubectl drain` manuel. Cette
procédure décrit ce qui arrive aux Pods CloudNative-PG (CNPG) du nœud et vérifie, avant le drain, qu'aucun cluster
mono-instance ne le bloque.

> [!WARNING] Procédure vérifiée contre le dépôt le 2026-10-11 ; ses commandes n'ont pas été rejouées sur les clusters.
> Le comportement de CNPG pendant un drain (PodDisruptionBudget, bascule du primaire) décrit ci-dessous vient de CNPG et
> n'est pas prouvé par le dépôt.

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `kubectl`, `mise` (`mise install`
exécuté).

Les accès suivants sont également nécessaires :

- accès `kubectl` en lecture aux `Cluster` CNPG et aux `PodDisruptionBudget` du cluster à drainer ;
- accès au dépôt pour corriger `src/` et exécuter `dist:render` si un cluster doit être modifié.

## Entrées requises

Exporter ces variables une fois ; toutes les commandes suivantes se copient ensuite telles quelles.

```sh
export CLUSTER_NAME=<cluster CNPG multi-instance à contrôler>    # ex. apps-secured-20260530 (relevé à l'étape 1)
export NAMESPACE=<namespace de ce cluster>                       # ex. databases
```

## Comportement d'un drain

| Forme du cluster                             | PDB (`<cluster>-primary`) | Comportement du drain                                                                             |
| -------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| `instances: 1`, `enablePDB: false`           | aucun                     | L'unique instance est évincée puis recréée sur son PVC : **courte indisponibilité de la base**.   |
| `instances: 1`, `enablePDB` absent ou `true` | `minAvailable: 1`         | Le drain **se bloque** (0 interruption autorisée) jusqu'à intervention humaine. Ne pas le lancer. |
| `instances > 1`, PDB conservé                | protège le primaire       | Le primaire est basculé d'abord, puis les réplicas sont évincés un par un.                        |
| `instances > 1`, `enablePDB: false`          | aucun                     | Rien ne protège le primaire : l'éviction peut le toucher sans bascule préalable.                  |

Convention du dépôt : tout cluster `instances: 1` déclare `enablePDB: false`, explicitement dans les manifestes
`Cluster` bruts et par défaut dans le chart `mutualized-cnpg-databases`
(`catalog/helm/mutualized-cnpg-databases/templates/cluster.yaml`). La règle OPA
[REL001](../../../catalog/opa/rules/REL001-single-instance-cnpg-disable-pdb.md) la fait respecter en CI : un `Cluster`
mono-instance est refusé sauf si `spec.enablePDB` vaut explicitement `false`.

Un cluster mono-instance accepte donc une interruption pendant la mise à jour d'un nœud, sans perte de données : le PVC
(Proxmox CSI, découplé de la VM) est rattaché de nouveau quand le Pod est replanifié. Sur `rhodes.akn`, qui est la
production, les clusters `openbao-database` et `grafana-database` sont mono-instance : OpenBao et Grafana perdent leur
base pendant le redémarrage du Pod.

État des clusters CNPG du dépôt, vérifié le 2026-10-11 dans `projects/*/src` :

| Cluster              | Projet        | `instances` | `enablePDB` | Source                                                                             |
| -------------------- | ------------- | ----------- | ----------- | ---------------------------------------------------------------------------------- |
| `openbao-database`   | `rhodes.akn`  | 1           | `false`     | `projects/rhodes.akn/src/apps/vault/cnpg.cluster.yaml`                             |
| `grafana-database`   | `rhodes.akn`  | 1           | `false`     | `projects/rhodes.akn/src/infrastructure/kubernetes/o11y/grafana.cnpg.cluster.yaml` |
| `pocket-id-20260530` | `rhodes.akn`  | 2           | `false`     | `projects/rhodes.akn/src/apps/pocket-id/cnpg.cluster.yaml`                         |
| `apps`               | `lungmen.akn` | 1           | `false`     | `projects/lungmen.akn/src/apps/databases/postgres-apps.helmvalues.yaml`            |
| `apps-secured`       | `lungmen.akn` | 2           | `true`      | `projects/lungmen.akn/src/apps/databases/postgres-apps-secured.helmvalues.yaml`    |

## Étape 1 — Contrôler les PDB avant la mise à jour

Un cluster mono-instance qui porte un PDB `-primary` bloque le drain : la vérification se fait avant de toucher au nœud.

```sh
kubectl get pdb -A | grep -- '-primary'
kubectl get clusters.postgresql.cnpg.io -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,INST:.spec.instances,PDB:.spec.enablePDB
# → aucun cluster INST=1 ne doit apparaître avec un PDB "-primary"
```

Tout cluster `INST=1` accompagné d'un PDB `-primary` se corrige dans `src/` (`enablePDB: false`, puis `dist:render`). Ne
pas modifier le `Cluster` en direct : la resynchronisation automatique d'ArgoCD (`selfHeal`) annule la modification, et
`nodeMaintenanceWindow` est obsolète.

## Étape 2 — Drainer ou mettre à jour le nœud

Drainer le nœud, ou lancer la mise à jour décrite dans
[INF-20260525-00](./INF-20260525-00-Mettre-a-Jour-Talos-avec-Omni.md), puis attendre que les clusters CNPG reviennent à
l'état sain.

```sh
kubectl get clusters.postgresql.cnpg.io -A
# → "Cluster in healthy state" pour chaque cluster
```

## Étape 3 — Vérifier le primaire des clusters multi-instances

Après le drain, contrôler l'état et le primaire de chaque cluster multi-instance.

```sh
kubectl get cluster $CLUSTER_NAME -n $NAMESPACE
# → "Cluster in healthy state", avec un primaire désigné
```

## Vérifications rapides

- **PDB** : `kubectl get pdb -A | grep -- '-primary'` — aucun sur un cluster `INST=1`.
- **Clusters CNPG** : `kubectl get clusters.postgresql.cnpg.io -A` — tous en `Cluster in healthy state`.
- **Primaire** : `kubectl get cluster $CLUSTER_NAME -n $NAMESPACE` — un primaire désigné sur chaque cluster
  multi-instance.

## Historique

- _2026-10-17_ : Reprise après revue : l'état de vérification est un callout `WARNING`, la section Entrées requises
  (variables `export`) et les vérifications rapides sont ajoutées.
- _2026-10-11_ : Ajout du cas `instances > 1` avec `enablePDB: false` et de l'inventaire des clusters CNPG :
  `pocket-id-20260530` (`rhodes.akn`) compte 2 instances sans PDB
  (`projects/rhodes.akn/src/apps/pocket-id/cnpg.cluster.yaml`), ce qui contredit l'idée que seuls les clusters
  mono-instance désactivent le PDB. Règle OPA REL001 citée : elle refuse un `Cluster` mono-instance dont `enablePDB`
  n'est pas explicitement `false` (`catalog/opa/policies/REL001:cloudnative-pg.rego`).
- _2026-10-11_ : Migration vers le standard de documentation (issue #1257) : page traduite en français, structure
  alignée sur le gabarit de procédure, lien vers la procédure INF-20260525-00 renommée.
- _2026-10-08_ : Création initiale.

## Pour aller plus loin

- [Mettre à jour Talos avec Omni](./INF-20260525-00-Mettre-a-Jour-Talos-avec-Omni.md) : la mise à jour qui déclenche les
  drains de nœuds.
- [Règle REL001](../../../catalog/opa/rules/REL001-single-instance-cnpg-disable-pdb.md) : la règle OPA qui impose
  `enablePDB: false` aux clusters CNPG mono-instance.
