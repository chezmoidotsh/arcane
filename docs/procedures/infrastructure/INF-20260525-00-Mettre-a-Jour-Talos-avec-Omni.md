# INF-20260525-00 Mettre à jour Talos avec Omni

Cette procédure met à jour la version de Talos Linux d'un cluster piloté par Sidero Omni (`rhodes.akn`, `lungmen.akn`)
en modifiant `talos.version` dans le cluster template du dépôt, puis en appliquant le template avec `omnictl`. Omni se
charge de la mise à jour des nœuds ; la procédure couvre les vérifications avant, la surveillance de la convergence, les
contrôles après et le retour arrière.

Réécrite le 2026-10-11 pour Omni à partir du dépôt ; les commandes n'ont pas été rejouées sur Omni ni sur les clusters.
L'ancienne version décrivait un `talosctl upgrade` sur le cluster mono-nœud `amiya.akn`, qui n'existe plus. Le
comportement d'Omni cité ci-dessous vient de la documentation officielle (voir
[Pour aller plus loin](#pour-aller-plus-loin)), consultée le 2026-10-11 ; ce qui n'y figure pas est signalé « à
confirmer sur Omni ».

## Cadre technique et conventions

- **La version est dans le template** : chaque cluster déclare `talos.version` dans
  `projects/<cluster>/src/infrastructure/omni/<cluster>.clustertemplate.yaml`, avec le préfixe `v` (obligatoire pour
  `omnictl cluster template validate`). Le template est la source de vérité : une modification faite à la main dans
  l'interface d'Omni n'est pas suivie dans Git.
- **Un template par cluster, sans overlay** : les templates sont des copies complètes de
  `catalog/omni/clustertemplates/base.yaml`, éditées sur place. Mettre à jour Talos sur plusieurs clusters demande donc
  de modifier chaque fichier.
- **`sync`, pas `apply`** : `omnictl cluster template sync -f <fichier>` est la seule commande qui lit ce format.
  Pointée sur un fichier unique, elle ne touche qu'un cluster ; pointée sur un répertoire, elle traite tous les
  templates qu'il contient, suppressions comprises.
- **Un seul minor à la fois** : le tableau de compatibilité de `catalog/omni/clustertemplates/base.yaml` indique de ne
  jamais sauter de version mineure de Talos (par exemple `v1.13.x` vers `v1.14.x` avant `v1.15.x`). Un saut de patch
  dans un même minor est admis.
- **Ordre et stratégie de mise à jour** : selon la documentation d'Omni, les nœuds control plane sont mis à jour en
  premier, un par un, après vérification de la santé d'etcd ; chaque nœud est drainé et cordonné, mis à jour, puis
  ré-ouvert au scheduling. Pour les workers, la stratégie par défaut est un déploiement progressif (rolling) nœud par
  nœud, réglable par `maxParallelism`. Les deux clusters du dépôt fixent `updateStrategy.rolling.maxParallelism: 1` sur
  le pool `workers` : un seul worker redémarre à la fois, et son voisin doit porter toute la charge pendant ce temps
  (voir l'en-tête des templates).

| Cluster       | Template                                                                    | Control plane | Workers (`w1.large`) |
| ------------- | --------------------------------------------------------------------------- | ------------- | -------------------- |
| `rhodes.akn`  | `projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml`   | 1             | 2                    |
| `lungmen.akn` | `projects/lungmen.akn/src/infrastructure/omni/lungmen.clustertemplate.yaml` | 1             | 3                    |

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `omnictl` (installé par
`mise install`), `kubectl`.

Les accès suivants sont également nécessaires :

- `OMNICONFIG` renseigné par la connexion à Omni (`omnictl config new` ou `omnictl config add`, ou
  `mise run bao:login:admin` dans `chezmoi.sh` pour le rôle admin) ;
- un kubeconfig du cluster (`omnictl kubeconfig`), voir l'étape 1 ;
- une version cible de Talos compatible avec la version de Kubernetes déclarée dans le même template : le tableau de
  `catalog/omni/clustertemplates/base.yaml` donne `v1.14.x` pour Kubernetes `v1.32.x` à `v1.37.x` (plage rapportée par
  Omni 1.12) ; la matrice officielle fait foi ;
- les workloads sensibles identifiés : sur `rhodes.akn`, un nœud drainé interrompt brièvement OpenBao et Grafana (voir
  l'étape 3).

## Entrées requises

- `CLUSTER_NAME` : nom du cluster dans Omni, par exemple `rhodes-akn`.
- `TEMPLATE_FILE` : chemin du cluster template, par exemple
  `projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml`.
- `TARGET_VERSION` : version cible de Talos avec préfixe `v`, par exemple `v1.14.2`.

Les marqueurs sont écrits entre chevrons (`<CLUSTER_NAME>`) dans les commandes.

## Étape 1 — Vérifier l'état du cluster et le chemin de mise à jour

Confirmer que le cluster est sain avant de lancer la mise à jour, relever la version actuelle et sauvegarder le
template.

```sh
# Santé globale du cluster dans Omni
omnictl cluster status <CLUSTER_NAME>
# → tous les machine sets Ready, aucune machine en Reconfiguring ou Config Outdated

# Version de Talos actuellement déclarée
grep -A1 '^talos:' <TEMPLATE_FILE>
# → version: vX.Y.Z

# Vue Kubernetes
omnictl kubeconfig -c <CLUSTER_NAME> --service-account --user admin -f /tmp/<CLUSTER_NAME>-kubeconfig
export KUBECONFIG=/tmp/<CLUSTER_NAME>-kubeconfig
kubectl get nodes -o wide
# → tous les nœuds Ready
```

Les commandes `omnictl` mettent couramment 60 à 120 secondes à répondre : ce délai est normal.

Si le cluster n'est pas `Ready`, ne pas poursuivre : diagnostiquer d'abord avec le skill
[omni-talos-troubleshoot](../../../.agents/skills/omni-talos-troubleshoot/SKILL.md).

Vérifier ensuite le chemin de mise à jour :

- la version cible n'est pas plus d'un minor au-dessus de la version actuelle ;
- la version de Kubernetes du template (`kubernetes.version`) reste dans la plage prise en charge par la version cible ;
- si le saut franchit un minor, le faire en deux passages (cette procédure répétée) ; si la version de Kubernetes doit
  aussi monter, suivre [Mettre à jour Kubernetes avec Omni](./INF-20260525-01-Mettre-a-Jour-Kubernetes-avec-Omni.md)
  dans l'ordre qu'impose la matrice de compatibilité.

> [!IMPORTANT] Les `systemExtensions` du template (`qemu-guest-agent`, `iscsi-tools`, `util-linux-tools`) doivent
> exister pour la version cible. Omni construit l'image d'installation (Image Factory) à partir de la liste du template
> ; l'absence d'une extension pour la version cible n'est pas décrite dans le dépôt et reste à confirmer sur Omni.
> Relire les notes de version de Talos pour détecter une extension retirée ou renommée.

## Étape 2 — Préparer les nœuds hébergeant des instances CNPG

Le drain d'un nœud est effectué par Omni pour chaque nœud mis à jour. Le comportement des clusters CloudNative-PG lors
d'un drain dépend de leur nombre d'instances et de leur PDB.

```sh
kubectl get pdb -A | grep -- '-primary'
# → aucun PDB sur un cluster CNPG à une seule instance
kubectl get clusters.postgresql.cnpg.io -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,INST:.spec.instances,PDB:.spec.enablePDB
```

Appliquer les vérifications et les conséquences décrites dans
[Drainer un nœud hébergeant des instances CNPG](./INF-20260525-02-Drainer-un-Noeud-Hebergeant-des-Instances-CNPG.md). Un
cluster CNPG à une instance avec PDB bloque le drain et donc la mise à jour du nœud.

## Étape 3 — Modifier la version de Talos dans le template

Remplacer `talos.version` par la version cible, sans toucher aux autres champs, et ne mettre à jour qu'un cluster à la
fois.

```yaml
talos:
  version: <TARGET_VERSION> # préfixe v obligatoire
```

Valider le template hors ligne, sans connexion à Omni :

```sh
omnictl cluster template validate -f <TEMPLATE_FILE>
# → pas d'erreur
```

Pour `lungmen.akn`, la tâche `mise run omni:clustertemplate:validate` (depuis `projects/lungmen.akn/`) exécute cette
validation.

Contrôler que le diff Git ne contient que la ligne `version` attendue :

```sh
git --no-pager diff -- <TEMPLATE_FILE>
```

> [!WARNING] Les URL de manifests de bootstrap (`cni.urls`, `extraManifests`) du template sont épinglées sur un commit.
> Ne pas les modifier pendant une mise à jour de Talos : le manifeste Cilium d'un cluster en service doit rester celui
> qui a créé son installer Job (voir l'en-tête de `catalog/omni/clustertemplates/base.yaml`).

## Étape 4 — Appliquer le template

Cette étape est en ligne et déclenche la mise à jour des nœuds.

```sh
omnictl cluster template sync -f <TEMPLATE_FILE>
# → Omni affiche les ressources modifiées (le Cluster, avec la nouvelle version de Talos)
```

> [!IMPORTANT] Utiliser `sync -f <fichier>` sur un fichier unique, jamais `omnictl apply -f` (ne comprend pas ce format)
> ni `sync` sur un répertoire (traite tous les templates, suppressions comprises). Faire valider le diff et la version
> cible avant `sync` : l'application déclenche aussitôt le redémarrage progressif des nœuds.

Selon le comportement décrit par la documentation d'Omni, les nœuds control plane sont mis à jour en premier, puis les
workers un par un (`maxParallelism: 1`). Pendant le redémarrage d'un nœud, ses workloads sont indisponibles tant qu'ils
ne sont pas reprogrammés. La durée totale n'est pas documentée dans le dépôt : à confirmer sur Omni.

## Étape 5 — Surveiller la convergence

```sh
# Suivre l'avancement machine par machine
omnictl cluster status <CLUSTER_NAME>
omnictl machine status
# → les machines passent en mise à jour une à la fois, puis reviennent Ready

# Vue Kubernetes
kubectl get nodes -o wide
# → un nœud peut apparaître SchedulingDisabled puis Ready à son tour
```

Relancer `omnictl cluster status` à intervalle régulier. Une machine dont la phase, l'identifiant et les diagnostics ne
changent pas entre deux relevés est bloquée et non en cours de convergence : consulter son champ `diagnostics`
(`omnictl get machinestatus <machine-id> -o yaml`) et suivre
[omni-talos-troubleshoot](../../../.agents/skills/omni-talos-troubleshoot/SKILL.md). Le dépôt ne donne pas de durée
normale pour une mise à jour de Talos ; le seuil de 15 minutes de la création d'un cluster ne s'y applique pas telle
quelle (à confirmer sur Omni).

## Étape 6 — Vérifier après la mise à jour

```sh
# Tous les nœuds sur la nouvelle version
omnictl cluster status <CLUSTER_NAME>
kubectl get nodes -o wide
# → colonne OS-IMAGE : Talos (<TARGET_VERSION>) sur chaque nœud, STATUS Ready

# Composants système
kubectl get pods -n kube-system
# → Running ou Completed, aucun CrashLoopBackOff

# Pods hors Running
kubectl get pods -A | grep -v -e Running -e Completed
# → vide, ou limité à des transitoires attendus
```

Contrôler ensuite les composants qui dépendent des nœuds :

- Cilium : `kubectl get pods -n kube-system | grep cilium`, tous `Running` ;
- certificats kubelet : `kubectl get csr`, aucun `Pending` durable (le `kubelet-serving-cert-approver` approuve les
  certificats de service) ;
- bases de données CNPG : `kubectl get clusters.postgresql.cnpg.io -A`, tous en `Cluster in healthy state` ;
- sur `rhodes.akn`, OpenBao et Pocket-Id à nouveau joignables.

## Exemple complet : mise à jour de `rhodes-akn` de `v1.14.1` vers `v1.14.2`

Exemple de forme, non rejoué : `v1.14.1` est la version déclarée aujourd'hui dans `rhodes.clustertemplate.yaml` ; la
version `v1.14.2` est un exemple de patch dans le même minor, à remplacer par une version réellement publiée.

```sh
omnictl cluster status rhodes-akn
# édition de projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml : talos.version: v1.14.2
omnictl cluster template validate -f projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml
omnictl cluster template sync -f projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml
omnictl cluster status rhodes-akn
```

## Vérifications rapides

- **État du cluster** : `omnictl cluster status <CLUSTER_NAME>` — tous les machine sets `Ready`.
- **Version de Talos** : `kubectl get nodes -o wide` — `OS-IMAGE` indique `<TARGET_VERSION>` sur chaque nœud.
- **Nœuds** : `kubectl get nodes` — tous `Ready`, aucun `SchedulingDisabled` résiduel.
- **Pods système** : `kubectl get pods -n kube-system` — `Running` ou `Completed`.
- **Template commité** : la version de `talos.version` dans Git correspond à celle appliquée, pour que le prochain
  `sync` ne rétrograde pas le cluster.

## Retour arrière

Deux cas se distinguent.

**Pendant la mise à jour** : selon la documentation d'Omni, Talos utilise un schéma de partitions A/B, donc annuler une
mise à jour ramène le nœud à la version précédente tant qu'il répond encore. La façon d'annuler depuis `omnictl` n'est
pas décrite dans le dépôt : à confirmer sur Omni (la documentation décrit l'interface web).

**Après la mise à jour** : rétablir la version précédente dans le template, valider et re-synchroniser.

```sh
# Remettre la version précédente de talos.version dans <TEMPLATE_FILE>
omnictl cluster template validate -f <TEMPLATE_FILE>
omnictl cluster template sync -f <TEMPLATE_FILE>
```

Cette descente est une nouvelle mise à jour, soumise aux mêmes contraintes. La prise en charge d'un retour à un minor
inférieur par Omni n'est pas documentée dans le dépôt : à confirmer sur Omni avant de s'y fier. Ne pas attendre : plus
les workloads tournent longtemps sur la nouvelle version, moins le retour est sûr.

## Historique

- _2026-10-11_ : Réécriture pour Omni à partir du dépôt, sans rejouer les commandes. Remplacement de `talosctl upgrade`
  sur le cluster mono-nœud `amiya.akn` (supprimé du dépôt) par la modification de `talos.version` dans le cluster
  template, la validation et l'application avec `omnictl cluster template`. Suppression du pré-téléchargement de
  l'image, de la mise à jour mono-nœud en deux redémarrages (`--stage`), de la mise à jour du patch-config de bootstrap
  et de la mention de `udev` de Talos v1.9. Conservés : pré-vérifications, contrôle des extensions, nœuds CNPG,
  vérifications et retour arrière.
- _2026-10-11_ : Migration vers le standard de documentation (issue #1257) : page traduite en français et structurée
  selon le gabarit de procédure.
- _2026-05-25_ : Adaptation pour utiliser `--context` plutôt que `--nodes` ; ajout de l'étape de mise à jour du
  patch-config de bootstrap ; départ à la version v1.12.
- _2026-05-25_ : Création initiale.

## Pour aller plus loin

- [Mettre à jour Kubernetes avec Omni](./INF-20260525-01-Mettre-a-Jour-Kubernetes-avec-Omni.md) : la mise à jour de
  Kubernetes, à coordonner avec celle de Talos.
- [Drainer un nœud hébergeant des instances CNPG](./INF-20260525-02-Drainer-un-Noeud-Hebergeant-des-Instances-CNPG.md) :
  effet du drain sur les bases CloudNative-PG.
- [Créer un cluster Talos avec Omni](../omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md) : application du
  template avec `omnictl cluster template` et surveillance de la convergence.
- [Réépingler les SHA après un squash merge](../omni/OMNI-20260629-03-Reepingler-les-SHA-apres-un-Squash-Merge.md) : si
  les manifests épinglés du template deviennent injoignables.
- [Mise à jour d'un cluster dans Omni](https://docs.siderolabs.com/omni/cluster-management/upgrading-clusters) :
  documentation officielle d'Omni sur l'ordre des nœuds, le drain et l'annulation, consultée le 2026-10-11.
