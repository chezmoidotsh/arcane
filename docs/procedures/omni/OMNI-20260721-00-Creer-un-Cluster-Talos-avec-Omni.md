# OMNI-20260721-00 Créer un cluster Talos avec Omni

Cette procédure monte de bout en bout un nouveau cluster Talos Linux sur Proxmox VE : provisionnement par Omni (Sidero
Omni), amorçage du CNI, création de l'identité Proxmox du CCM et du CSI, déploiement de ces deux plugins, enregistrement
du cluster dans le GitOps du dépôt (comme hub ArgoCD ou comme spoke) et validation du réseau, du stockage et de
l'intégration cloud-provider. À la fin, le cluster est `Ready`, Cilium, le Proxmox CSI et le Proxmox CCM fonctionnent et
ont été vérifiés un par un, et ArgoCD gère le cluster.

> [!WARNING]\
> Procédure vérifiée contre le dépôt le 2026-10-11 ; ses commandes n'ont pas été rejouées sur Omni ni sur les clusters.

Les étapes sont ordonnées volontairement : le CNI vient en premier, car rien ne fonctionne sans réseau de Pods ; les
identifiants Proxmox, le CSI et le CCM suivent, car la plupart des charges de travail ont besoin du stockage et de la
topologie des nœuds ; l'enregistrement GitOps vient en dernier, une fois l'infrastructure propre du cluster
fonctionnelle et vérifiée. Cette procédure ne fait que consommer Omni pour provisionner un cluster aval : elle ne
modifie pas l'hébergement d'Omni, indépendant du rôle hub ou spoke du nouveau cluster dans ArgoCD (voir [Omni](#omni) et
[Topologie GitOps hub et spoke](#topologie-gitops-hub-et-spoke)).

## Cadre technique et conventions

### Omni

[Omni (Sidero Omni)](https://omni.siderolabs.com) est un plan de gestion déclaratif de clusters Talos : les templates de
cluster décrivent l'état voulu (versions de Kubernetes et de Talos, machine classes, CIDR, URL des manifests de
bootstrap), et Omni provisionne et réconcilie les VM Proxmox sur cet état.

Omni tourne dans un **LXC Proxmox autonome**
([NixOS, Omni, un fournisseur OIDC Dex colocalisé et Caddy](../../../projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni))
sur l'[hôte Proxmox `pve-01.pve.chezmoi.sh`](../../../projects/chezmoi.sh/docs/PROXMOX-VE.md). Il n'est une charge de
travail d'aucun cluster Kubernetes.

### Talos

[Talos Linux](https://www.talos.dev) est une distribution Linux immuable pilotée par API et conçue pour Kubernetes : ni
SSH, ni shell, ni gestionnaire de paquets. La configuration passe uniquement par des patchs de machine config (YAML)
appliqués via l'API Talos.

### Topologie GitOps hub et spoke

Le moteur GitOps du dépôt est ArgoCD, exécuté en une instance centrale qui gère tous les clusters du homelab (topologie
« hub et spoke », pas une installation par cluster). Un cluster **héberge lui-même** ArgoCD et joue le rôle de **hub** :
il s'enregistre comme cluster ArgoCD (un Secret `argocd.argoproj.io/secret-type: cluster`, créé par le chart Helm
d'ArgoCD) et gère ses propres charges de travail comme celles des autres. Tous les autres clusters sont des **spokes** :
ils s'enregistrent dans l'ArgoCD du hub avec `argocd cluster add` et n'ont pas de dossier `argocd/`.

| Rôle  | Cluster actuel | Particularité dans le dépôt                                                                                             |
| ----- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Hub   | `rhodes.akn`   | Porte `projects/rhodes.akn/src/argocd/` et `projects/rhodes.akn/src/bootstrap.applications.yaml` (Application `argocd`) |
| Spoke | `lungmen.akn`  | Aucun dossier `argocd/` ; enregistré avec `argocd cluster add` (voir `docs/guides/Initialiser-Lungmen.md`)              |

L'étape 11 bifurque donc selon le rôle du nouveau cluster : auto-hébergement d'ArgoCD pour un hub, `argocd cluster add`
pour un spoke. Le rôle se décide cluster par cluster (variable `GITOPS_ROLE` des [entrées requises](#entrées-requises))
; cette procédure ne le prescrit pas.

### Templates, machine classes et manifests de bootstrap

Omni gère les clusters Talos avec trois briques indépendantes :

- **Templates de cluster** (`*.clustertemplate.yaml`) : YAML déclaratif de l'état voulu (nom, versions de Kubernetes et
  de Talos, machine classes du plan de contrôle et des workers, CIDR de Pods et de Services, URL des manifests de
  bootstrap). Ce sont des **YAML multi-documents plats** dont chaque document porte seulement `kind` et `name` : il n'y
  a **ni `apiVersion`, ni `metadata`, ni `spec`**. Ce format est **incompatible avec kustomize** (qui exige `metadata`)
  : chaque template est une **copie complète et autonome**, modifiée sur place, jamais un overlay kustomize. Un cluster
  ne partage donc pas de template via un `kustomization.yaml`.
- **Machine classes** (ressources COSI) : définissent la forme des VM (vCPU, mémoire, disque) et leur placement Proxmox
  (bridges, VLAN, tags). Elles sont **indépendantes des templates** et s'appliquent séparément avec `omnictl apply`.
  Elles vivent dans `catalog/omni/machineclasses/`, partagées par tous les clusters.
- **Manifests de bootstrap** : référencés par SHA de commit dans le template, via des URL `raw.githubusercontent.com`.
  Cilium (le CNI), kubelet-serving-cert-approver et metric-server sont appliqués à l'amorçage. Le SHA épinglé **doit
  être accessible sur la branche `main` de GitHub** au moment de l'application, sinon le CNI n'est jamais installé, sans
  erreur visible (voir [Problèmes connus](#problèmes-connus)).

`omnictl` est installé par `mise` (`mise install`).

### Fichiers de référence

| Fichier                                   | Rôle                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `catalog/omni/clustertemplates/base.yaml` | Template de base à copier (ne passe volontairement pas la validation telle quelle). |
| `projects/*/src/infrastructure/omni/`     | Emplacement du template de chaque cluster.                                          |
| `catalog/omni/machineclasses/`            | Catalogue des machine classes : `c1.minimal`, `w1.medium`, `w1.large`, `w1.xlarge`. |

### Allocation des CIDR de Pod

Chaque cluster reçoit son propre `/19` de Pod dans le supernet `172.30.0.0/16`, sans recouvrement avec les autres :
c'est un prérequis de ClusterMesh. La table d'allocation fait foi, elle est dans
[`ipam.md`](../../reference/IPAM-Reference.md). Le prochain CIDR libre s'obtient en incrémentant l'identifiant de
cluster de cette table (identifiant 3 : `172.30.64.0/19`).

Le **CIDR de Services `172.31.0.0/19`** et le **clusterDNS `172.31.0.10`** sont **communs à tous les clusters** et ne se
changent pas : la section « Service CIDR » de la même page en donne la raison.

### Catalogue des machine classes

| Classe       | vCPU | Mémoire | Disque | Cartes réseau                                     | Usage            |
| ------------ | ---- | ------- | ------ | ------------------------------------------------- | ---------------- |
| `c1.minimal` | 4    | 4 Gio   | 32 Go  | `eth0` = vmbr1/VLAN 5, `eth1` = VNet SDN talosnet | Plan de contrôle |
| `w1.medium`  | 2    | 4 Gio   | 32 Go  | idem                                              | Workers          |
| `w1.large`   | 4    | 8 Gio   | 32 Go  | idem                                              | Workers          |
| `w1.xlarge`  | 8    | 16 Gio  | 32 Go  | idem                                              | Workers          |

Toutes les machine classes utilisent `cpuType: x86-64-v3`.

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `mise` (`mise install` exécuté),
`omnictl`, `kubectl`, `curl`, `argocd` (pour un spoke) et `cilium` (pour la liste de validation).

Les accès et états suivants sont également nécessaires :

- **SDN Proxmox opérationnel** : le VNet partagé `talosnet`, son sous-réseau et l'ACL `SDN.Use` de `omni@pve` existent,
  provisionnés par la configuration SDN de la stack Pulumi `stack/proxmox`
  (`projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts`, ACL dans `access/omni.ts`). Appliquer cette
  stack d'abord si ce n'est pas fait.
- **Authentification Omni** : `OMNICONFIG` renseigné par le flux de connexion d'Omni (`omnictl config new` ou
  `omnictl config add`).
- **Machine classes appliquées dans Omni** : ce sont des ressources COSI, hors template. Si Omni a été réinitialisé, les
  réappliquer (étape 1).
- **SHA épinglé accessible sur `main`** : voir l'étape 4.
- **Identifiant d'amorçage Proxmox délégué** : la stack `projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/`
  doit déjà être appliquée pour avoir créé `<cluster>-bootstrap@pve` (`access/rhodes-akn-bootstrap.ts`,
  `access/lungmen-akn-bootstrap.ts`) et l'avoir écrit dans le cluster sous la forme du Secret
  `kube-system/<cluster>-bootstrap-pve`. L'étape 9 s'en sert pour créer l'identité CCM/CSI du cluster. Un nouveau
  cluster a d'abord besoin de son propre `access/<cluster>-bootstrap.ts`.

## Entrées requises

Exporter ces variables une fois ; toutes les commandes suivantes se copient ensuite telles quelles.

```sh
export CLUSTER_NAME=<nom du cluster dans Omni>            # ex. rhodes-akn (choisi à l'étape 2)
export PROJECT_DIR=<dossier du projet du cluster>         # ex. projects/rhodes.akn
export TEMPLATE_FILE=<chemin du template du cluster>      # ex. projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml (créé à l'étape 3)
export KUBECONFIG_OUT=<chemin local du kubeconfig>        # ex. ~/.kube/config-rhodes-akn
export GITOPS_ROLE=<hub|spoke>                            # selon la topologie GitOps ; utilisé à l'étape 11
```

## Étape 1 — Appliquer les machine classes

Les machine classes sont des ressources COSI appliquées via Omni, indépendamment du template de cluster. Elles vivent
dans `catalog/omni/machineclasses/` et les tâches ci-dessous sont définies à la racine du dépôt : les lancer depuis
n'importe quel dossier du dépôt.

```sh
mise run omni:machineclass:diff     # simulation / aperçu
mise run omni:machineclass:apply    # applique toutes les machine classes à Omni
omni:drift:check --machineclasses   # code 1 si Omni diffère de Git (voir catalog/omni/README.md)
```

Cette étape n'est nécessaire que si les machine classes ont changé ou si Omni a été réinitialisé ou est vide ; sinon
elle ne change rien et peut être exécutée sans risque. `mise run omni:machineclass:list` liste les classes existantes.
L'authentification doit être faite avant : `omnictl config new` (ou `omnictl config add` si un contexte existe déjà)
renseigne `OMNICONFIG`.

## Étape 2 — Allouer l'identité du cluster

Choisir le prochain identifiant de cluster et le CIDR de Pod correspondant dans la
[table d'allocation](#allocation-des-cidr-de-pod). Avec `rhodes` (1) et `lungmen` (2) déjà pris, le prochain cluster a
l'identifiant 3 et le CIDR de Pod `172.30.64.0/19`.

Choisir un nom de cluster (par exemple `rhodes-akn`) et un dossier de projet (`projects/<cluster>.akn/`).

**Ne pas changer le CIDR de Services ni le clusterDNS.** `serviceSubnets` reste `172.31.0.0/19` et `clusterDNS` reste
`172.31.0.10`. Ce recouvrement entre clusters est sans effet sur ClusterMesh : Cilium résout les ClusterIP par eBPF sur
le nœud source, qui les remplace par l'IP d'un Pod backend avant que le paquet quitte le nœud, donc les ClusterIP ne
circulent jamais entre les clusters. Seuls les CIDR de Pod (`podSubnets`) doivent être uniques. Une valeur unique de
`clusterDNS` simplifie en plus les résolutions DNS personnalisées (par exemple un DNS qui résout vers Tailscale).

## Étape 3 — Créer le template de cluster

Copier le template de base dans le projet du cluster, puis modifier les champs sur place :

```sh
cp catalog/omni/clustertemplates/base.yaml $TEMPLATE_FILE
```

Champs à modifier par rapport à la base :

- `kind: Cluster` → `name:` : le nom du cluster (par exemple `rhodes-akn`).
- `kubernetes.version` et `talos.version` : versions retenues, dans la matrice de support Talos (voir l'en-tête de
  `base.yaml`).
- `podSubnets:` : le `/19` alloué (par exemple `172.30.64.0/19`). La base contient volontairement une valeur sentinelle
  qui n'est pas un CIDR : la validation échoue tant qu'elle n'est pas remplacée.
- `machine.kubelet.extraArgs.cloud-provider: external` : **à ajouter** (la base ne le contient pas ; voir l'étape 6).
- `controlPlane.machineClass.size:` : nombre de nœuds de plan de contrôle (en général `1` ou `3`).
- `workers.machineClass.size:` : nombre de workers.
- Vérifier que `serviceSubnets` reste `172.31.0.0/19` et `clusterDNS` reste `172.31.0.10`.

Les templates de `rhodes.akn` et `lungmen.akn` (`projects/*/src/infrastructure/omni/`) servent d'exemples de copie
modifiée.

> [!NOTE]\
> Le CNI est défini ici et non par GitOps, car Talos est immuable et piloté par API : aucun `kubectl apply` n'est
> possible tant que le cluster n'a pas de réseau de Pods, et ArgoCD lui-même a besoin d'un cluster fonctionnel pour
> synchroniser quoi que ce soit. Le mécanisme `cni.urls` / `extraManifests` de Talos et d'Omni (voir
> [Templates, machine classes et manifests de bootstrap](#templates-machine-classes-et-manifests-de-bootstrap)) est le
> seul moyen d'obtenir un CNI avant que le cluster n'en ait un : Cilium est donc appliqué à l'amorçage d'Omni (étapes 6
> et 8), et non par GitOps comme les autres composants.

## Étape 4 — Vérifier l'accessibilité du SHA

Avant l'amorçage, le SHA de commit épinglé doit exister sur la branche `main` de GitHub. Après tout squash-merge d'une
branche, contrôler que les URL de bootstrap du template répondent :

```sh
grep -oE 'https://raw\.githubusercontent\.com/[^ ]+' $TEMPLATE_FILE | sort -u | while read -r url; do
  echo "${url}"
  curl -sI "${url}" | head -1
done
# → HTTP/2 200 pour chaque URL (Cilium, kubelet-serving-cert-approver, metric-server)
```

Si une URL renvoie `404`, le SHA est inaccessible (la pointe de la branche n'a pas été conservée sur `main` après le
squash-merge). Il doit être réépinglé sur le SHA du commit de merge avant de continuer : voir
[Problèmes connus](#problèmes-connus).

> [!WARNING]\
> Appliquer un template dont le SHA épinglé renvoie 404 produit un cluster **sans CNI** : Cilium n'est jamais
> téléchargé, les Pods restent en `ContainerCreating` et l'échec est silencieux. Toujours vérifier l'accessibilité ici,
> avant l'étape 6.

## Étape 5 — Valider le template de cluster

Lancer la validation hors ligne pour confirmer que le template est bien formé :

```sh
omnictl cluster template validate -f $TEMPLATE_FILE
# → pas d'erreur
```

Chaque projet de cluster encapsule cette commande dans une tâche `mise` de son propre `.mise.toml`
(`projects/rhodes.akn/` et `projects/lungmen.akn/` en définissent une) :

```sh
mise run omni:clustertemplate:validate
```

Ajouter cette tâche au `.mise.toml` du nouveau projet si elle manque, en s'inspirant de ces deux projets. Le script
`omni:template:lint` vérifie en plus que `podSubnets`, `serviceSubnets` et `clusterDNS` de chaque template de cluster
respectent la plage de l'ADR-014 ; la CI l'exécute à chaque changement sous `projects/*/src/infrastructure/omni/`.

## Étape 6 — Appliquer le template de cluster

Une fois validé, appliquer le template à Omni. Cette étape est en ligne et demande une authentification :

```sh
omnictl cluster template sync -f $TEMPLATE_FILE
```

> [!IMPORTANT]\
> Utiliser `omnictl cluster template sync -f <fichier>`, **pas** `omnictl apply -f`. `apply` est la commande générique
> des ressources COSI (elle attend du YAML `metadata`/`spec`) et ne sait pas lire le DSL
> `kind: Cluster`/`ControlPlane`/`Workers` des templates : elle échoue avec
> `yaml: construct errors: ... expected 4 elements node, got N`. `sync` réconcilie avec une sémantique complète de
> création, de mise à jour et de **suppression** : pointée sur un dossier, elle traite chaque template du dossier et
> peut couvrir plusieurs clusters ; pointée sur un seul fichier (comme ci-dessus), elle ne touche que les ressources de
> ce cluster.

**Le patch de machine config `kubelet.extraArgs.cloud-provider: external` doit figurer dans le template appliqué à cette
étape.** Le Proxmox CCM (étape 10) en dépend entièrement : sans lui, il ignore l'initialisation des nœuds sans erreur ni
log. Si le drapeau manque et qu'un nœud s'est déjà enregistré, la correction exige de **supprimer et recréer le nœud**,
car le champ `providerID` de Kubernetes est immuable une fois défini : redémarrer le kubelet avec le bon drapeau ne
corrige pas un nœud déjà enregistré. Source : `docs/experiments/20260617-proxmox-csi-ccm/README.md`, section « 9.1 Known
Considerations ». Le template de base (`catalog/omni/clustertemplates/base.yaml`) ne contient **pas** ce patch : les
templates de `rhodes.akn` et de `lungmen.akn` l'ajoutent explicitement. Vérifier que la copie contient :

```yaml
machine:
  kubelet:
    extraArgs:
      cloud-provider: external
```

## Étape 7 — Suivre la convergence du cluster

Omni commence à provisionner les VM sur Proxmox et à amorcer Talos. Suivre la convergence :

```sh
omnictl cluster status $CLUSTER_NAME
omnictl machine status
```

La convergence prend en général de 5 à 15 minutes selon le démarrage des VM. Attendre que tous les nœuds atteignent
l'état `Ready` et que le plan de contrôle forme son quorum.

Si la convergence stagne au-delà de 15 minutes, consulter l'interface d'Omni pour les erreurs au niveau des machines.
Causes courantes : épuisement des ressources Proxmox, endpoints Talos injoignables ou machine classes manquantes (les
réappliquer à l'étape 1). Le skill `omni-talos-troubleshoot` (`.agents/skills/omni-talos-troubleshoot/SKILL.md`) guide
le diagnostic.

## Étape 8 — Récupérer le kubeconfig et vérifier le CNI

Quand le cluster est `Ready`, télécharger le kubeconfig et vérifier l'état des nœuds et des Pods :

```sh
export KUBECONFIG=$KUBECONFIG_OUT
omnictl kubeconfig --cluster $CLUSTER_NAME $KUBECONFIG

kubectl get nodes -o wide
kubectl get pods -A
# → tous les nœuds Ready
```

Ce kubeconfig utilise l'authentification OIDC d'Omni (interactive). Les procédures de mise à jour utilisent un
kubeconfig de service account, voir
[INF-20260525-00](../infrastructure/INF-20260525-00-Mettre-a-Jour-Talos-avec-Omni.md).

Vérifier que Cilium tourne :

```sh
kubectl get pods -n kube-system | grep cilium
# → Pods Running
```

Quand Cilium démarre en mode natif (remplacement de kube-proxy), la connectivité entre nœuds est interrompue environ 2
minutes ; voir
[Coupure de connectivité de 2 minutes pendant la reprise de kube-proxy par Cilium](#coupure-de-connectivité-de-2-minutes-pendant-la-reprise-de-kube-proxy-par-cilium).
Si aucun Pod Cilium n'apparaît, le SHA épinglé était inaccessible : voir [Problèmes connus](#problèmes-connus).

## Étape 9 — Créer l'identité Proxmox du CCM/CSI et le Secret Kubernetes

Le Proxmox CCM et le plugin Proxmox CSI (étape 10) partagent une identité Proxmox, créée par la stack Pulumi du cluster
(et non par celle de `chezmoi.sh`) à partir de l'identifiant délégué `<cluster>-bootstrap@pve` (voir les prérequis). La
même stack écrit la configuration obtenue dans le cluster sous le Secret `proxmox-system/proxmox-cloud-provider` (clé
`config.yaml`), que les deux charts référencent par `existingConfigSecret` :

| Cluster       | Programme Pulumi                                                  |
| ------------- | ----------------------------------------------------------------- |
| `rhodes.akn`  | `projects/rhodes.akn/src/infrastructure/pulumi/stack/proxmox.ts`  |
| `lungmen.akn` | `projects/lungmen.akn/src/infrastructure/pulumi/stack/proxmox.ts` |

Le composant sous-jacent est `catalog/pulumi/components/proxmox-cluster-identity` (voir son README). Le programme lit le
Secret d'amorçage dans `kube-system` : le kubeconfig de l'étape 8 doit donc être utilisable par le provider Kubernetes
de Pulumi.

Le namespace `proxmox-system` n'est pas créé par Pulumi : le créer avant de lancer la stack. Le DaemonSet de nœud de
`proxmox-csi-plugin` (étape 10) a besoin d'un accès privilégié et `hostPath` pour monter les périphériques bloc attachés
par Proxmox, que le niveau Pod Security « restricted » par défaut du cluster refuse : le namespace reçoit donc
l'application relâchée dès sa création, puisqu'aucune métadonnée de namespace gérée par ArgoCD n'existe encore.

```sh
kubectl apply --server-side -f - <<'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: proxmox-system
  labels:
    pod-security.kubernetes.io/enforce: privileged
    pod-security.kubernetes.io/enforce-version: v1.33
EOF
```

Lancer ensuite la stack avec les outils habituels du projet (`mise run pulumi:diff`, puis `mise run pulumi:apply`,
tâches définies dans le dossier `src/infrastructure/pulumi/` du projet).

La rotation n'est pas automatique à heure fixe : elle ne prend effet qu'à la prochaine application de la stack, car
aucun job du dépôt n'applique les stacks Pulumi à intervalle régulier.

## Étape 10 — Déployer le CSI et le CCM

Le Proxmox CCM (`proxmox-cloud-controller-manager`) et le plugin CSI (`proxmox-csi-plugin`) se déploient dans
`proxmox-system` à partir des manifests rendus dans `dist/` du projet (voir
l'[ADR-011](../../decisions/ADR-011-Motif-des-Manifestes-Rendus.md)), selon la convention habituelle
`src/infrastructure/kubernetes/<nom>/` du dépôt. Ils sont appliqués à la main
(`kubectl apply --server-side -f dist/...`), car aucun ArgoCD n'existe encore sur ce cluster à ce stade de l'amorçage.

Le namespace `proxmox-system` a été créé à l'étape 9, avec le niveau Pod Security relâché que demande le CSI.

`rhodes.akn` et `lungmen.akn` ont déjà la source du CCM et du CSI sous
`projects/<cluster>/src/infrastructure/kubernetes/proxmox/` (valeurs Helm des deux charts) et leur rendu sous
`projects/<cluster>/dist/infrastructure/kubernetes/proxmox/`. Pour un nouveau cluster, copier ce dossier depuis un
cluster existant, l'adapter, puis le rendre avec `dist:render projects/<cluster>/src/infrastructure/kubernetes/proxmox`.
Appliquer ensuite les manifests rendus (le Secret de l'étape 9 doit exister pour que les Pods démarrent) :

```sh
kubectl apply --server-side -f projects/<cluster>/dist/infrastructure/kubernetes/proxmox/
```

Vérifier que les contrôleurs et le driver CSI sont démarrés :

```sh
kubectl get pods -n proxmox-system
kubectl get csidriver csi.proxmox.sinextra.dev
kubectl get storageclass
# → Pods Running, CSIDriver présent, StorageClass proxmox-lvmthin-* listées
```

## Étape 11 — Enregistrer le cluster dans le GitOps (hub ou spoke)

Appliquer la branche décidée dans la [topologie GitOps hub et spoke](#topologie-gitops-hub-et-spoke) :

- **Hub** : auto-hébergement. Appliquer les manifests ArgoCD du cluster lui-même, sur le modèle de `rhodes.akn`
  (`projects/rhodes.akn/src/argocd/` et `projects/rhodes.akn/src/bootstrap.applications.yaml`).
- **Spoke** : enregistrement dans l'ArgoCD du hub.

  ```sh
  argocd cluster add $CLUSTER_NAME --name $CLUSTER_NAME
  ```

  Prérequis : le CLI ArgoCD est authentifié et le contexte kubeconfig du nouveau cluster est actif. Vérifier avec
  `argocd cluster list` et dans l'interface d'ArgoCD sous Settings → Clusters.

## Liste de validation

Confirmer que le CNI, le CSI et le CCM fonctionnent, et pas seulement que les Pods existent. Cette liste reprend les
critères de validation de `docs/experiments/20260617-proxmox-csi-ccm/scripts/validate.sh` et de
`docs/experiments/20260617-proxmox-csi-ccm/manifests/test-pvc.yaml` : déployer ce dernier (ou un PVC équivalent ciblant
une `StorageClass`) avant les contrôles CSI/CCM ci-dessous. Aucun script de validation dédié à cette procédure n'existe
; lancer les commandes à la main.

### CNI

```sh
cilium status --wait
kubectl get pods -n kube-system | grep cilium   # tous Running
```

### CCM et CSI

Critères V-001 à V-010, tirés de la table de validation de l'expérience :

| ID    | Critère                                    | Commande                                                                                        |
| ----- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| V-001 | Pods du CCM en cours dans `proxmox-system` | `kubectl -n proxmox-system get pods -l app.kubernetes.io/name=proxmox-cloud-controller-manager` |
| V-002 | Le nœud porte les labels de topologie      | `kubectl get nodes --show-labels \| grep topology`                                              |
| V-003 | Le nœud a un `providerID`                  | `kubectl get nodes -o jsonpath='{.items[*].spec.providerID}'`                                   |
| V-004 | `CSIDriver` enregistré                     | `kubectl get csidriver csi.proxmox.sinextra.dev`                                                |
| V-005 | Pods contrôleur et nœud du CSI en cours    | `kubectl -n proxmox-system get pods \| grep proxmox-csi`                                        |
| V-006 | `StorageClass` disponible                  | `kubectl get sc proxmox-lvmthin-ext4` (ou la classe définie pour ce cluster)                    |
| V-007 | PVC de test lié                            | `kubectl get pvc data-test-csi-0 \| grep Bound`                                                 |
| V-008 | Charge de test prête                       | `kubectl get sts test-csi \| grep 1/1`                                                          |
| V-009 | L'extension de volume fonctionne           | `kubectl patch pvc data-test-csi-0 -p '{"spec":{"resources":{"requests":{"storage":"2Gi"}}}}'`  |
| V-010 | Le volume survit au redémarrage du Pod     | Supprimer le Pod, vérifier que le StatefulSet le recrée lié au même PVC                         |

## Problèmes connus

Cette section décrit des problèmes réellement rencontrés en suivant cette procédure, pas des risques hypothétiques.

### L'application automatique du CNI peut échouer sans erreur

Si le SHA épinglé est inaccessible (HTTP 404), Cilium n'est jamais téléchargé et le cluster n'a aucun réseau : les Pods
restent en `ContainerCreating`. Contournement : vérifier l'accessibilité du SHA (étape 4) avant d'appliquer. Si l'échec
a déjà eu lieu, réépingler le SHA (voir le dernier problème de cette section) et réappliquer le template.

### Coupure de connectivité de 2 minutes pendant la reprise de kube-proxy par Cilium

Quand Cilium démarre en mode natif (remplacement de kube-proxy), la connectivité entre nœuds est interrompue environ 2
minutes pendant que Cilium remplace kube-proxy. Ce comportement est attendu et se résout seul ; ne pas intervenir.

### Les machine classes sont effacées lors d'une réinitialisation d'Omni

Si l'instance Omni est réinitialisée ou réinstallée, toutes les machine classes sont perdues. Les réappliquer
(`mise run omni:machineclass:apply`) avant que tout template de cluster puisse converger. Les templates de cluster, eux,
restent dans Git.

### Le SHA épinglé doit rester accessible après un squash-merge

Toujours s'assurer que le SHA épinglé est accessible sur `main` après un squash-merge. Un SHA présent seulement sur une
branche renvoie 404 une fois les commits de la branche supprimés par le ramasse-miettes de GitHub. Pour réépingler,
remplacer l'ancien SHA par celui du commit de fusion dans tous les templates, valider, puis appliquer le template du
cluster :

```sh
export OLD_SHA=<SHA actuellement épinglé>       # ex. 934e67a9b70724c834bc1ac7c0221551bb7772e9
export NEW_SHA=<SHA complet du commit de fusion> # git fetch origin && git rev-parse origin/main

# Relever le SHA actuellement épinglé (un seul SHA doit apparaître)
grep -ohE '[0-9a-f]{40}' projects/*/src/infrastructure/omni/*.clustertemplate.yaml catalog/omni/clustertemplates/base.yaml | sort -u

# Remplacer le SHA (avec le sed BSD de macOS : sed -i '')
sed -i "s/$OLD_SHA/$NEW_SHA/g" projects/*/src/infrastructure/omni/*.clustertemplate.yaml catalog/omni/clustertemplates/base.yaml

omnictl cluster template validate -f $TEMPLATE_FILE
omnictl cluster template sync -f $TEMPLATE_FILE
```

Contrôler d'abord que les URL des manifests répondent avec `NEW_SHA` (étape 4). La détection automatique de ce cas et
une commande de réépinglage sont suivies par l'issue [#1357](https://github.com/chezmoidotsh/arcane/issues/1357).

## Historique

- _2026-10-17_ : Migration vers le standard de documentation (issue #1257) : page traduite en français, structurée selon
  le gabarit de procédure, entrées en variables `export`. Corrections vérifiées contre le dépôt : le template de base ne
  contient pas `kubelet.extraArgs.cloud-provider: external` (seuls ceux de `rhodes.akn` et `lungmen.akn` l'ajoutent) ;
  `seed.application.yaml` n'est plus cité, le hub `rhodes.akn` s'amorce avec `projects/rhodes.akn/src/argocd/` et
  `bootstrap.applications.yaml` ; le critère V-001 utilise le label
  `app.kubernetes.io/name=proxmox-cloud-controller-manager` ; les URL Cilium sont lues dans le template ; les chemins
  `access/` sont précisés ; le namespace `proxmox-system` est créé avant le Secret avec `--server-side` ; le kubeconfig
  OIDC est distingué de celui des mises à jour. La table des CIDR de Pod renvoie à la référence IPAM, la raison du CIDR
  de Services commun est corrigée, et la procédure de réépinglage des SHA est supprimée au profit de sa commande dans
  les problèmes connus.
- _2026-07-22_ : Corrections factuelles (flux de connexion natif `omnictl config` d'Omni, syntaxe de
  `omnictl kubeconfig`, sémantique `apply` contre `sync`), suppression de références périmées (procédure SDN obsolète,
  runbook d'amorçage invalide, récit de migration hors sujet), table des fichiers de référence réduite, étapes
  réordonnées pour que l'application des machine classes soit l'étape 1, et fichier renommé de `OMNI-20260629-00` en
  `OMNI-20260721-00` pour refléter la date réelle de la refonte.
- _2026-07-20_ : Extension de la création d'un cluster Omni seule à une procédure complète d'amorçage : sections de
  contexte (Omni, Talos, topologie GitOps hub et spoke), création des identifiants Proxmox CCM/CSI, déploiement CSI/CCM
  depuis `dist/`, enregistrement GitOps hub ou spoke et liste de validation CNI/CSI/CCM.
- _2026-06-29_ : Création initiale, tirée du déroulé de création du cluster `lungmen.akn` : allocation d'identité,
  génération du template, accessibilité du SHA, machine classes, validation, application, convergence et récupération du
  kubeconfig.

## Pour aller plus loin

- [ADR-014 : topologie réseau du homelab](../../decisions/ADR-014-Topologie-Reseau.md) : définit le supernet des CIDR de
  Pod (`172.30.0.0/16`) et l'allocation d'un `/19` par cluster. La table de référence des CIDR de Pod par cluster est
  dans [Allocation IPAM](../../reference/IPAM-Reference.md).
- [ADR-011 : motif des manifests rendus](../../decisions/ADR-011-Motif-des-Manifestes-Rendus.md) : le motif de pré-rendu
  dans `dist/` utilisé à l'étape 10.
- [Expérience Proxmox CSI/CCM](../../experiments/20260617-proxmox-csi-ccm/README.md) : architecture, ordre de
  déploiement, rôles et tokens Proxmox, contrainte du drapeau cloud-provider (étape 6) et critères V-001 à V-010.
- [Documentation d'Omni](https://omni.sidero.dev/) : référence d'`omnictl` et des templates de cluster.
