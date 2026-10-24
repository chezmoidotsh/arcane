# Expérimentation 2026-06-17 Proxmox CSI Et CCM

Étude de faisabilité (EXP-2026-005, [issue #1028](https://github.com/chezmoidotsh/arcane/issues/1028)) du déploiement de
[proxmox-csi-plugin](https://github.com/sergelogvinov/proxmox-csi-plugin) et de
[proxmox-cloud-controller-manager](https://github.com/sergelogvinov/proxmox-cloud-controller-manager) sur un cluster
Kubernetes Talos qui tourne dans des VM Proxmox. Conclusion : adopté, les deux composants fonctionnent, sauf les
snapshots de volumes qui exigent `root@pam`.

Versions testées : CSI v0.18.1 (chart 0.5.7), CCM v0.13.1 (chart 0.2.28).

> [!NOTE]\
> **État au 2026-10-11 : conclusion appliquée, avec des versions plus récentes.** `lungmen.akn` et `rhodes.akn` ont
> chacun un répertoire `proxmox/` sous `src/infrastructure/kubernetes/` qui déploie le CSI et le CCM. Sur `lungmen.akn`,
> `kustomization.yaml` épingle les charts `proxmox-csi-plugin` 0.5.9 et `proxmox-cloud-controller-manager` 0.2.29, et
> `dist/infrastructure/kubernetes/proxmox/` contient les `StorageClass` `proxmox-lvmthin-ext4`,
> `proxmox-lvmthin-ext4-retain` et `proxmox-lvmthin-xfs`. Aucun déploiement Longhorn n'existe dans `projects/` (la
> correspondance `longhorn: proxmox-lvmthin-ext4` de
> `projects/lungmen.akn/src/infrastructure/kubernetes/velero/change-storage-class.configmap.yaml` en reste la trace).

## Question

Un provisionneur de stockage local (par exemple `local-path-provisioner`) lie un PVC au système de fichiers d'un seul
nœud, ce qui pose trois problèmes :

- **Perte de données au changement de nœud** : réduire, migrer ou réinstaller une VM impose de déplacer les données à la
  main.
- **Gestion manuelle des volumes** : redimensionner un volume passe par l'interface Proxmox, sans workflow natif
  Kubernetes.
- **Pas de mise à l'échelle dynamique** : ajouter un nœud demande de configurer le stockage et la topologie côté
  Proxmox.

Stocker les volumes côté hyperviseur avec un plugin CSI doit les résoudre : les volumes sont créés, redimensionnés et
supprimés depuis Kubernetes, survivent à la reconstruction d'une VM et se rattachent à toute VM du même nœud Proxmox.

Exigences posées :

- créer, modifier, redimensionner et supprimer des volumes dynamiquement depuis Kubernetes ;
- obtenir des snapshots de volumes, si possible sans `root@pam` ; à défaut, Velero ou un autre mécanisme de sauvegarde
  externe les remplace.

## Montage

### Composants

Le plugin CSI fournit le provisionnement dynamique de volumes bloc stockés côté Proxmox. Le CCM n'est déployé que pour
fournir les labels de topologie et le `providerID` dont le CSI a besoin pour placer les volumes : Cilium gère tout le
réseau, donc seuls les contrôleurs `cloud-node` et `cloud-node-lifecycle` tournent.

| Composant      | Rôle                                                                                                             | Exécution                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------- |
| CSI Controller | Provisioner, Attacher et Resizer (Deployment)                                                                    | Control plane             |
| CSI Node       | Plugin `kubelet` : monte et attache les volumes aux Pods                                                         | Tous les nœuds            |
| CSI Driver     | Ressource `CSIDriver` `csi.proxmox.sinextra.dev`                                                                 | Cluster                   |
| CCM            | `cloud-node` (labels, `providerID`, adresses) et `cloud-node-lifecycle` (supprime le nœud quand la VM disparaît) | Deployment, `kube-system` |

Les volumes sont des disques bloc attachés à la VM par le contrôleur SCSI Proxmox ; la VM les voit sous
`/dev/disk/by-id/...`. Les contrôleurs `route` et `service` du CCM ne sont pas activés. Backends de stockage pris en
charge : `dir`, `lvm`, `lvmthin`, `zfspool`, `nfs`, `rbd` (Ceph).

Après initialisation par le CCM, le nœud porte les labels et le `providerID` suivants :

```yaml
metadata:
  labels:
    topology.kubernetes.io/region: homelab
    topology.kubernetes.io/zone: pve
    node.kubernetes.io/instance-type: 2VCPU-4GB
    topology.proxmox.sinextra.dev/region: homelab
    topology.proxmox.sinextra.dev/zone: pve
spec:
  providerID: proxmox://homelab/100
status:
  addresses:
    - address: 10.0.0.50
      type: InternalIP
    - address: talos-node
      type: Hostname
```

| Label                                  | Signification                            | Source                |
| -------------------------------------- | ---------------------------------------- | --------------------- |
| `topology.kubernetes.io/region`        | Nom du cluster Proxmox                   | CCM (`config.region`) |
| `topology.kubernetes.io/zone`          | Nom d'hôte du nœud Proxmox               | CCM (API Proxmox)     |
| `topology.proxmox.sinextra.dev/region` | Identique à la région (label alternatif) | CCM                   |
| `topology.proxmox.sinextra.dev/zone`   | Identique à la zone (label alternatif)   | CCM                   |

Le `kubelet` doit démarrer avec `--cloud-provider=external`. Sur Talos, la machine config le porte :

```yaml
machine:
  kubelet:
    extraArgs:
      cloud-provider: external
```

### Environnement de test

| Composant           | Valeur                                             |
| ------------------- | -------------------------------------------------- |
| Proxmox VE          | Nœud unique, en cluster avec lui-même              |
| Kubernetes          | Talos Linux, nœud unique (control plane et worker) |
| Backend de stockage | LVM-thin (`nvme-lvm`) sur Proxmox                  |
| CNI                 | Cilium                                             |

### Intégration prévue avec Arcane

- la `StorageClass` vient des values Helm (`storageClass`), sans manifeste séparé ;
- les secrets vivent dans OpenBao, synchronisés par External Secrets Operator ;
- un ApplicationSet ArgoCD pointe vers les `manifests/` de l'expérience ;
- le CCM se déploie par ArgoCD ou par `cluster.inlineManifests` de Talos.

### Ordre de déploiement

1. Rôles, utilisateurs et tokens d'API Proxmox.
2. Mise à jour de la machine config Talos (`kubelet.extraArgs.cloud-provider=external`).
3. CCM, avant le CSI pour que les nœuds soient labellisés.
4. Plugin CSI, qui lit les labels de topologie posés par le CCM.

### Rôles et tokens Proxmox

Le CCM et le CSI s'authentifient chacun avec un token d'API dédié, rattaché à un utilisateur du realm `@pve` aux
privilèges limités. Le pool `talos` contient déjà les VM et les stockages associés (voir
[`omni-infra-provider-proxmox`](../../projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni-infra-provider-proxmox/))
: les ACL s'appuient dessus. Commandes à lancer sur l'hôte Proxmox :

```sh
# Rôle CCM : lecture seule de la config des VM, du guest-agent et de l'état des nœuds
pveum role add KubernetesCCM -privs "VM.Audit VM.GuestAgent.Audit Sys.Audit"

# Utilisateur CCM : accès aux VM du pool talos, Sys.Audit sur le nœud (topologie et cycle de vie)
pveum user add kubernetes-ccm@pve
pveum acl modify /pool/talos --users kubernetes-ccm@pve --roles KubernetesCCM
pveum acl modify /nodes/pve --users kubernetes-ccm@pve --roles KubernetesCCM

# Token CCM : le secret n'est affiché qu'une fois
pveum user token add kubernetes-ccm@pve ccm -privsep 0

# Rôle CSI
pveum role add KubernetesCSI -privs \
  "VM.Audit VM.Config.Disk Datastore.Allocate Datastore.AllocateSpace Datastore.Audit Sys.Audit"

# Utilisateur CSI : pool talos, plus l'accès cluster pour /cluster/resources (capacité)
pveum user add kubernetes-csi@pve
pveum acl modify /pool/talos --users kubernetes-csi@pve --roles KubernetesCSI
pveum acl modify / --users kubernetes-csi@pve --roles KubernetesCSI

# Token CSI : le secret n'est affiché qu'une fois
pveum user token add kubernetes-csi@pve csi -privsep 0
```

> [!WARNING]\
> Toutes les VM qui utilisent des volumes CSI doivent appartenir au pool `talos` : l'ACL est limitée à `/pool/talos` et
> une VM extérieure échoue au provisionnement avec un 403 Proxmox. À l'inverse, aucune VM non Kubernetes ne doit entrer
> dans ce pool.

| Composant | Privilège                 | Chemin ACL    | Raison                                                  |
| --------- | ------------------------- | ------------- | ------------------------------------------------------- |
| CCM       | `VM.Audit`                | `/pool/talos` | Lire la config de la VM (hostname, VMID, instance-type) |
| CCM       | `VM.GuestAgent.Audit`     | `/pool/talos` | Lire les adresses IP remontées par le guest-agent       |
| CCM       | `Sys.Audit`               | `/nodes/pve`  | Lire l'état du nœud (topologie et cycle de vie)         |
| CSI       | `VM.Audit`                | `/pool/talos` | Localiser la VM par nom ou UUID                         |
| CSI       | `VM.Config.Disk`          | `/pool/talos` | Attacher et détacher les disques SCSI                   |
| CSI       | `Datastore.Allocate`      | `/pool/talos` | Allouer les images disque sur le backend                |
| CSI       | `Datastore.AllocateSpace` | `/pool/talos` | Réserver l'espace des nouveaux volumes                  |
| CSI       | `Datastore.Audit`         | `/pool/talos` | Lister les stockages et la capacité libre               |
| CSI       | `Sys.Audit`               | `/`           | Lister les ressources du cluster (capacité)             |

### Déploiement

Les values Helm sont dans [`ccm-helmvalues.yaml`](20260617-proxmox-csi-ccm/manifests/ccm-helmvalues.yaml) et
[`csi-helmvalues.yaml`](20260617-proxmox-csi-ccm/manifests/csi-helmvalues.yaml) ;
[`test-pvc.yaml`](20260617-proxmox-csi-ccm/manifests/test-pvc.yaml) est un StatefulSet PostgreSQL avec son PVC, qui
valide le provisionnement, les I/O et le redémarrage du Pod. Le secret de chaque token se passe en `--set`, jamais dans
un fichier.

```sh
helm upgrade -i -n kube-system \
  -f manifests/ccm-helmvalues.yaml \
  --set config.clusters[0].token_secret="<ccm-token-secret>" \
  proxmox-cloud-controller-manager \
  oci://ghcr.io/sergelogvinov/charts/proxmox-cloud-controller-manager

helm upgrade -i -n kube-system \
  -f manifests/csi-helmvalues.yaml \
  --set config.clusters[0].token_secret="<csi-token-secret>" \
  proxmox-csi-plugin \
  oci://ghcr.io/sergelogvinov/charts/proxmox-csi-plugin
```

### Critères de validation

[`scripts/validate.sh`](20260617-proxmox-csi-ccm/scripts/validate.sh) exécute les contrôles V-001 à V-010 et affiche
`PASS` ou `FAIL` pour chacun.

| ID    | Critère                                          | Commande                                                                                       |
| ----- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| V-001 | Pods du CCM en cours d'exécution                 | `kubectl -n kube-system get pods -l app=proxmox-cloud-controller-manager`                      |
| V-002 | Le nœud porte les labels de topologie            | `kubectl get nodes --show-labels` \| grep topology                                             |
| V-003 | Le nœud porte un `providerID`                    | `kubectl get nodes -o jsonpath='{.items[*].spec.providerID}'`                                  |
| V-004 | `CSIDriver` enregistré                           | `kubectl get csidriver csi.proxmox.sinextra.dev`                                               |
| V-005 | Pods CSI controller et node en cours d'exécution | `kubectl -n kube-system get pods` \| grep proxmox-csi                                          |
| V-006 | `StorageClass` disponible                        | `kubectl get sc proxmox-lvmthin-ext4`                                                          |
| V-007 | PVC du StatefulSet lié                           | `kubectl get pvc data-test-csi-0` \| grep Bound                                                |
| V-008 | PostgreSQL prêt dans le StatefulSet              | `kubectl get sts test-csi` \| grep 1/1                                                         |
| V-009 | Extension de volume                              | `kubectl patch pvc data-test-csi-0 -p '{"spec":{"resources":{"requests":{"storage":"2Gi"}}}}'` |
| V-010 | Le volume survit au redémarrage du Pod           | Supprimer le Pod : le StatefulSet le recrée avec le même PVC                                   |

## Résultats

La faisabilité est confirmée : le plugin CSI et le CCM fonctionnent sur Talos et Proxmox.

| Point                                                                                    | Résultat                          |
| ---------------------------------------------------------------------------------------- | --------------------------------- |
| Provisionnement dynamique, redimensionnement, redémarrage de Pod avec données conservées | Fonctionne                        |
| Labels de topologie, `providerID`, plusieurs `StorageClass`                              | Fonctionne                        |
| Snapshots de volumes                                                                     | Ne fonctionne pas sans `root@pam` |

Les snapshots sont une fonctionnalité expérimentale qui réclame les identifiants `root@pam`, inacceptable pour une
installation sans root : la sauvegarde passe par un outil externe (Velero ou les sauvegardes natives de Proxmox).

Points d'attention relevés :

- **Topologie à nœud unique** : avec le mode de liaison `WaitForFirstConsumer`, les Pods ne se planifient que sur le
  nœud labellisé, sans conséquence sur un cluster à un nœud.
- **`kubelet --cloud-provider=external`** : obligatoire. Sans lui, le CCM ignore l'initialisation des nœuds. Si le flag
  est ajouté après l'enregistrement d'un nœud, la ressource `Node` doit être supprimée puis recréée, car le `providerID`
  est immuable.
- **Limite de disques** : VirtIO SCSI single accepte 256 périphériques par contrôleur (LUN 0 à 255). Le disque de boot
  occupe le LUN 0, ce qui laisse environ 254 PVC par VM.
- **Compatibilité Talos** : le plugin CSI node exige l'accès de l'hôte à `/dev/` et `/var/lib/kubelet`. Le rootfs de
  Talos est immuable, mais les chemins par défaut du chart Helm conviennent.
- **Réseau** : les contrôleurs `route` et `service` du CCM sont désactivés ; Cilium Gateway API et Cilium LBP assurent
  tout le réseau.

## Conclusion

Adopté. Le plugin CSI Proxmox remplace valablement un provisionneur interne au cluster comme Longhorn sur les clusters
sur Proxmox : il supprime la charge d'un stockage distribué dans Kubernetes en s'appuyant directement sur les backends
de Proxmox. Le CCM n'est nécessaire que pour les labels de topologie du CSI et reste un composant passif, d'une
complexité minime.

Suites prévues par l'issue #1028 :

- remplacer Longhorn par proxmox-csi-plugin sur les clusters sur Proxmox ;
- définir une `StorageClass` par type de charge (ext4 en général, xfs avec `directsync` pour les applications sensibles
  aux performances) ;
- évaluer Velero avec le snapshotter CSI Proxmox comme stratégie de sauvegarde.

## Pour aller plus loin

- [`projects/lungmen.akn/src/infrastructure/kubernetes/proxmox/`](../../projects/lungmen.akn/src/infrastructure/kubernetes/proxmox/kustomization.yaml)
  : le déploiement du CSI et du CCM issu de cette expérience.
- [ADR-014 Séparer le trafic des nœuds Talos du VLAN Homelab](../decisions/ADR-014-Separer-le-Trafic-des-Noeuds-Talos-du-VLAN-Homelab.md)
  : la topologie Proxmox sur laquelle tournent les VM Talos.
- [Plugin CSI](https://github.com/sergelogvinov/proxmox-csi-plugin/blob/main/docs/options.md) : les options de
  `StorageClass`.
- [Installation du CCM](https://github.com/sergelogvinov/proxmox-cloud-controller-manager/blob/main/docs/install.md) :
  la documentation amont.
