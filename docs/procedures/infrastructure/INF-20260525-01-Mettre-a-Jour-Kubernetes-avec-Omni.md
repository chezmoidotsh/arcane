# INF-20260525-01 Mettre à jour Kubernetes avec Omni

Cette procédure met à jour la version de Kubernetes d'un cluster Talos géré par Omni (`rhodes.akn`, `lungmen.akn`) en
modifiant `kubernetes.version` dans son cluster template, puis en synchronisant le template avec `omnictl`. Elle met en
avant la vérification préalable des feature gates et des flags retirés dans la version cible, à l'origine de l'incident
Kubernetes 1.35, et la compatibilité avec la version de Talos.

La version de Kubernetes est fixée dans le template (`projects/*/src/infrastructure/omni/*.clustertemplate.yaml`) et
Omni réalise la mise à jour.

> [!WARNING]\
> Procédure réécrite le 2026-10-11 pour Omni à partir du dépôt : ses commandes n'ont pas été rejouées sur Omni ni sur
> les clusters. Les points marqués « à confirmer sur Omni » ne sont établis ni par le dépôt ni par la documentation
> officielle consultée.

## Cadre technique et conventions

- **Une seule source de vérité** : `kubernetes.version` du document `kind: Cluster` du template, avec le préfixe `v`
  (par exemple `v1.37.1`, valeur présente dans `rhodes.clustertemplate.yaml` et `lungmen.clustertemplate.yaml` à la date
  de rédaction). Aucune commande `talosctl upgrade-k8s` ni `kubectl` ne modifie la version.
- **`cluster template sync`, jamais `omnictl apply`** : `apply` ne sait pas lire le format des templates. Le détail est
  dans [Créer un cluster Talos avec Omni](../omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md).
- **Un seul cluster par synchronisation** : toujours pointer `-f` vers le fichier du cluster, pas vers un répertoire,
  car `sync` crée, modifie et supprime les ressources pour que l'état d'Omni corresponde aux templates lus.
- **Les patches vivent dans le template** : les feature gates sont déclarés dans les patches `machine-common`
  (`machine.kubelet.extraConfig.featureGates`) et `cluster-common` (`cluster.apiServer.extraArgs.feature-gates`) du
  template.

## Prérequis

Avant de commencer, vérifier que `omnictl` et `kubectl` sont installés (`mise install`).

Les accès suivants sont également nécessaires :

- `OMNICONFIG` renseigné par la connexion à Omni (`omnictl config new` ou `omnictl config add`, ou
  `mise run bao:login:admin` dans `chezmoi.sh` pour le rôle admin) ;
- droits d'écriture sur le dépôt, pour modifier le template et ouvrir une pull request ;
- une sauvegarde etcd récente et réussie du cluster. La documentation d'Omni la désigne comme voie de reprise principale
  si une mise à jour laisse le cluster irrécupérable. Le template de `rhodes.akn` déclare
  `features.backupConfiguration.interval: 6h` ; la présence de la sauvegarde dans Omni est à contrôler avant de
  commencer ;
- version de Talos compatible avec la version cible de Kubernetes, selon la
  [matrice de support de Talos](https://www.talos.dev/v1.14/introduction/support-matrix/). Si Talos doit d'abord être
  mis à jour, suivre [Mettre à jour Talos avec Omni](./INF-20260525-00-Mettre-a-Jour-Talos-avec-Omni.md) avant cette
  procédure.

> [!IMPORTANT]\
> Monter d'une seule version mineure de Kubernetes à la fois (par exemple `v1.36.x` vers `v1.37.x`). C'est la règle de
> Kubernetes pour les mises à jour ; la documentation d'Omni consultée ne l'impose pas explicitement. Pour franchir deux
> versions mineures, exécuter la procédure deux fois.

## Entrées requises

Exporter ces variables une fois ; toutes les commandes suivantes se copient ensuite telles quelles.

```sh
export CLUSTER_NAME=<nom du cluster dans Omni>               # ex. rhodes-akn
export TEMPLATE_FILE=<chemin du template du cluster>         # ex. projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml
export TARGET_K8S_VERSION=<version cible de Kubernetes>      # ex. v1.37.2 (préfixe v obligatoire, format v1.XX.Y)
```

Dans les extraits YAML de l'étape 3, remplacer les marqueurs `<…>` par ces valeurs.

## Étape 1 — Vérifier l'état actuel

Relever la version déclarée dans Git, celle que le cluster exécute et la santé du cluster avant toute modification.

```sh
# Version déclarée dans le template
grep -n -A1 '^kubernetes:' $TEMPLATE_FILE
# → version: v1.XX.Y

# Santé du cluster dans Omni
omnictl cluster status $CLUSTER_NAME
# → cluster et machines à l'état Ready, sans opération en cours

# Version de Kubernetes réellement exécutée
omnictl kubeconfig -c $CLUSTER_NAME --service-account --user admin -f /tmp/$CLUSTER_NAME-kubeconfig
KUBECONFIG=/tmp/$CLUSTER_NAME-kubeconfig kubectl get nodes -o wide
# → tous les nœuds Ready, colonne VERSION identique à la version du template
```

Même kubeconfig de service account que dans [INF-20260525-00](./INF-20260525-00-Mettre-a-Jour-Talos-avec-Omni.md) : il
évite la connexion OIDC interactive, son jeton vaut 8760 h par défaut et le fichier de `/tmp` est à supprimer une fois
la mise à jour terminée.

Ne pas continuer si le cluster n'est pas sain : une mise à jour sur un cluster déjà dégradé complique le diagnostic.
Voir [le skill omni-talos-troubleshoot](../../../.agents/skills/omni-talos-troubleshoot/SKILL.md).

## Étape 2 — Vérifier les feature gates et les flags retirés

> [!NOTE]\
> Cette étape est la protection contre l'incident du 2026-05-26 : un feature gate retiré de Kubernetes 1.35, resté dans
> les patches, a fait paniquer `kube-apiserver` et `kubelet` (`unrecognized feature gate`) et coupé l'API pendant
> environ 45 minutes. Les contrôles de compatibilité ne remplacent pas cette lecture manuelle : l'incident a montré que
> le contrôle des flags de l'outil de mise à jour de l'époque ne couvrait pas les `extraArgs`, `extraConfig` et feature
> gates injectés par les patches.

Lister d'abord tout ce que le template injecte :

```sh
grep -n -i -B1 -A3 'featureGates\|feature-gates\|extraArgs\|extraConfig' $TEMPLATE_FILE
# → pour rhodes-akn : UserNamespacesSupport et ImageVolume (kubelet et kube-apiserver), plus
#   rotate-server-certificates et cloud-provider dans kubelet.extraArgs
```

Pour chaque gate et chaque flag listé, chercher son nom dans les notes de version de Kubernetes pour la version
`$TARGET_K8S_VERSION` ([CHANGELOG](https://github.com/kubernetes/kubernetes/blob/master/CHANGELOG/)) et dans la
[liste des feature gates](https://kubernetes.io/docs/reference/command-line-tools-reference/feature-gates/). Un gate
retiré ou passé en GA (donc supprimé de la liste des gates configurables) dans la version cible doit être retiré du
template avant la mise à jour, dans le même commit.

Ensuite, demander à Omni de vérifier la compatibilité de la version cible :

```sh
omnictl cluster kubernetes upgrade-pre-checks $CLUSTER_NAME --to $TARGET_K8S_VERSION
# → la commande vérifie la compatibilité de version et les API dépréciées (documentation d'omnictl)
```

> [!WARNING]\
> `upgrade-pre-checks` est décrite par la documentation d'Omni comme une vérification de la compatibilité de version et
> des API dépréciées. Que cette commande inspecte aussi les feature gates des patches n'est pas établi : à confirmer sur
> Omni. En attendant, la lecture manuelle ci-dessus reste obligatoire.

## Étape 3 — Modifier le template

Changer `kubernetes.version` et les éventuels gates retirés à l'étape 2, sur une branche dédiée.

```yaml
kind: Cluster
name: <CLUSTER_NAME>
kubernetes:
  version: <TARGET_K8S_VERSION> # préfixe v obligatoire
```

Le `v` est requis : le template de référence le note pour `talos.version` (`v-prefix mandatory for omnictl validate`) et
`kubernetes.version` suit le même format dans les deux templates du dépôt.

## Étape 4 — Valider et comparer

Valider le template hors ligne, puis comparer l'état d'Omni avec le template modifié.

```sh
omnictl cluster template validate -f $TEMPLATE_FILE
# → validation sans erreur

omnictl cluster template diff -f $TEMPLATE_FILE
# → seule la ligne kubernetes.version (et les gates retirés à l'étape 2) doit différer
```

Un écart sur d'autres champs signale une dérive entre Git et Omni ; la corriger ou la comprendre avant d'aller plus
loin. Le script `omni:drift:check --templates` fait la même comparaison pour tous les templates (voir
[`catalog/omni/README.md`](../../../catalog/omni/README.md)).

## Étape 5 — Appliquer le template

Fusionner le changement sur `main` par pull request, puis appliquer le template. Vérifier que les URL épinglées par SHA
du template (CNI, `extraManifests`) restent joignables sur `main` ; sinon réépingler d'abord le SHA (section « Problèmes
connus » de [OMNI-20260721-00](../omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md)).

```sh
# Prévisualiser sans rien modifier
omnictl cluster template sync -f $TEMPLATE_FILE --dry-run
# → seul le Cluster $CLUSTER_NAME est mis à jour

omnictl cluster template sync -f $TEMPLATE_FILE
```

Omni conduit ensuite la mise à jour. D'après sa documentation, les images des nouveaux composants sont préchargées sur
tous les nœuds, les nouvelles définitions de static Pods sont rendues et reprises par `kubelet`, le DaemonSet
`kube-proxy` reçoit la nouvelle image et `kubelet` est mis à jour sur chaque nœud. Sur `rhodes.akn` et `lungmen.akn`,
`kube-proxy` est désactivé (`cluster.proxy.disabled: true`, Cilium le remplace). Le caractère rolling de cette mise à
jour et le redémarrage éventuel des Pods applicatifs sont à confirmer sur Omni.

## Étape 6 — Surveiller la convergence

```sh
omnictl cluster template status -f $TEMPLATE_FILE --wait 30m
# → le cluster converge vers l'état Ready

omnictl cluster status $CLUSTER_NAME
```

Si un nœud semble bloqué, attendre avant d'agir : la documentation d'Omni indique que certaines opérations prennent plus
de temps que prévu selon le matériel. Contrôler l'état de la machine dans Omni
(`omnictl get machinestatus <machine-id> -o yaml`, champ `diagnostics`), puis suivre
[le skill omni-talos-troubleshoot](../../../.agents/skills/omni-talos-troubleshoot/SKILL.md).

Si `kube-apiserver` est injoignable (`connection refused` sur le port 6443), diagnostiquer par l'API Talos, qui reste
disponible : `talosctl containers -k` et `talosctl logs -k` (voir
[.agents/knowledge/talos.md](../../../.agents/knowledge/talos.md)). Une erreur `unrecognized feature gate` désigne la
cause de l'incident 1.35.

> [!WARNING]\
> Ne pas supprimer de machine hors d'Omni, ne pas lancer `kubectl delete node` sur un nœud de control plane et ne pas
> ajouter de nœud de control plane pendant un problème de quorum : la documentation d'Omni déconseille ces actions
> pendant une mise à jour bloquée.

## Étape 7 — Vérifier après la mise à jour

```sh
KUBECONFIG=/tmp/$CLUSTER_NAME-kubeconfig kubectl get nodes -o wide
# → tous les nœuds Ready, VERSION = $TARGET_K8S_VERSION

KUBECONFIG=/tmp/$CLUSTER_NAME-kubeconfig kubectl version
# → Server Version = $TARGET_K8S_VERSION

KUBECONFIG=/tmp/$CLUSTER_NAME-kubeconfig kubectl get pods -A
# → aucun Pod en CrashLoopBackOff ou Error
```

## Exemple complet : mise à jour de `rhodes-akn` de `v1.37.1` vers `v1.37.2`

Exemple de forme, non rejoué : `v1.37.1` est la version déclarée aujourd'hui dans `rhodes.clustertemplate.yaml` ; la
version `v1.37.2` est un exemple de patch dans le même minor, à remplacer par une version réellement publiée.

```sh
omnictl cluster status rhodes-akn
omnictl cluster kubernetes upgrade-pre-checks rhodes-akn --to v1.37.2

# édition de projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml : kubernetes.version: v1.37.2
omnictl cluster template validate -f projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml
omnictl cluster template diff -f projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml

omnictl cluster template sync -f projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml
omnictl cluster template status -f projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml --wait 30m
```

## Vérifications rapides

- **Version du template** : `grep -n -A1 '^kubernetes:' $TEMPLATE_FILE` — la version cible, fusionnée sur `main`.
- **Absence de dérive** : `omnictl cluster template diff -f $TEMPLATE_FILE` — aucun écart.
- **Santé du cluster** : `omnictl cluster status $CLUSTER_NAME` — cluster et machines `Ready`.
- **Version des nœuds** : `kubectl get nodes` — colonne `VERSION` égale à la version cible.
- **Pods** :
  `kubectl get pods -A -o json | jq -r '.items[] | select(.status.phase != "Succeeded") | select(.status.phase != "Running" or any(.status.containerStatuses[]?; .ready | not)) | "\(.metadata.namespace)/\(.metadata.name)"'`
  — aucune ligne.

## Retour arrière

> [!WARNING]\
> Le retour arrière n'a jamais été nécessaire sur ces clusters : cette section n'est pas documentée de bout en bout. Ce
> qui suit vient de la documentation d'Omni et reste à compléter au premier besoin réel.

Le retour à une version mineure antérieure n'est pas documenté par Omni : la documentation consultée ne décrit aucune
rétrogradation de Kubernetes. Réécrire l'ancienne valeur dans `kubernetes.version` puis relancer `cluster template sync`
n'est donc pas une voie établie : à confirmer sur Omni avant de s'y fier, car Kubernetes ne garantit pas non plus la
rétrogradation d'un `kube-apiserver`.

Les voies de reprise établies sont les suivantes :

- **Cause identifiée dans le template** (par exemple un gate retiré) : corriger le template (retirer le gate fautif),
  valider, puis relancer `omnictl cluster template sync -f $TEMPLATE_FILE`. La reprise d'une mise à jour interrompue par
  ce moyen est à confirmer sur Omni. La correction par `talosctl patch machineconfig`, qui ne supprime jamais de clé,
  est inefficace et ne doit pas être tentée : voir
  [l'incident](../../incidents/2026-05-26-lungmen-k8s-1.35-removed-featuregate.md).
- **Cluster irrécupérable** : restaurer depuis la sauvegarde etcd. La procédure de restauration n'est pas documentée
  dans le dépôt : se reporter à la
  [documentation d'Omni](https://docs.siderolabs.com/omni/cluster-management/upgrading-clusters).

## Historique

- _2026-10-17_ : Migration vers le standard de documentation (issue #1257) et réécriture pour Omni. La version de
  Kubernetes est fixée dans `kubernetes.version` du cluster template et appliquée par `omnictl cluster template sync` ;
  le contenu propre à `talosctl upgrade-k8s` sur le cluster mono-nœud `amiya.akn` (six phases, dry-run, exemple 1.34.2
  vers 1.35.0) est retiré. Sont conservés le contrôle des feature gates et flags retirés, la compatibilité avec Talos et
  les vérifications après mise à jour, avec un contrôle générique des pods et un avertissement sur le retour arrière.
  Les commandes n'ont pas été rejouées sur Omni ni sur les clusters.
- _2026-05-26_ : Ajout du contrôle préalable des feature gates (étape 1) et de l'avertissement sur la fusion stratégique
  (étape 5), à la suite de l'incident
  [Kubernetes 1.35 : feature gate retiré](../../incidents/2026-05-26-lungmen-k8s-1.35-removed-featuregate.md).
- _2026-05-25_ : Utilisation de `--context` à la place de `--nodes` ; départ de la version 1.34.
- _2026-05-25_ : Création initiale.

## Pour aller plus loin

- [Mettre à jour Talos avec Omni](./INF-20260525-00-Mettre-a-Jour-Talos-avec-Omni.md) : mise à jour de Talos, à faire
  d'abord si la version cible de Kubernetes l'exige.
- [Créer un cluster Talos avec Omni](../omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md) : format des
  templates, validation et application avec `omnictl`.
- [Incident Kubernetes 1.35 : feature gate retiré](../../incidents/2026-05-26-lungmen-k8s-1.35-removed-featuregate.md) :
  l'incident à l'origine du contrôle de l'étape 2.
- [Upgrading Clusters (documentation d'Omni, consultée le 2026-10-11)](https://docs.siderolabs.com/omni/cluster-management/upgrading-clusters)
  : déroulement d'une mise à jour et résolution d'une mise à jour bloquée.
