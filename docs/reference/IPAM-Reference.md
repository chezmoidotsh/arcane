# IPAM Reference

Source de vérité de tout l'adressage IP du homelab : VLAN, VNet SDN, CIDR Kubernetes, pools LoadBalancer Cilium et
règles de pare-feu qui bornent ce que chaque plage peut joindre. Cette page est mise à jour avant d'ajouter un cluster,
un service ou une IP statique. La topologie physique est dans [Réseau Reference](Reseau-Reference.md).

Vérifiée contre le dépôt le 2026-10-11 ; l'état réel de Proxmox, de l'UDM Pro et des clusters n'a pas été revérifié.

## VLANs

| VLAN | Nom        | Sous-réseau       | DHCP                           | Usage                          | Remarques                                            |
| ---- | ---------- | ----------------- | ------------------------------ | ------------------------------ | ---------------------------------------------------- |
| 1    | Backbone   | 10.10.10.0/24     | Oui                            | Équipements réseau uniquement  | Gestion de l'UDM Pro et des switches ; sans internet |
| 2    | Home       | 192.168.10.0/25   | Oui, sans réservation statique | Appareils de la maison         |                                                      |
| 3    | Home Guest | 192.168.10.128/25 | Oui                            | WiFi invités                   | Internet uniquement ; isolation L2 complète          |
| 4    | IoT        | 192.168.3.0/25    | Oui (HASS statique, prévu)     | Appareils IoT                  | Sans internet (sauf HASS) ; IoT vers HASS uniquement |
| 5    | Homelab    | 10.0.0.0/22       | Désactivé : tout est statique  | PVE, LXC, LB Talos, tunnel SDN | Plan d'adressage ci-dessous                          |

### VLAN Placement Guide

| Type d'appareil                                         | VLAN                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| Équipements réseau (UDM Pro, switches, points d'accès)  | 1 (Backbone)                                               |
| Appareils personnels (portables, téléphones, tablettes) | 2 (Home)                                                   |
| NAS                                                     | 5 (Homelab)                                                |
| Invités, matériel non fiable                            | 3 (Home Guest)                                             |
| Appareils IoT, capteurs, caméras, ampoules              | 4 (IoT)                                                    |
| Home Assistant                                          | 4 (IoT), avec exception internet et accès depuis le VLAN 2 |
| Hôte Proxmox, conteneurs LXC                            | 5 (Homelab)                                                |
| VM Talos (IP de nœud sur `eth1`)                        | VNet SDN (interne, pas un VLAN physique)                   |
| Services Kubernetes (IP LB Cilium)                      | 5 (Homelab), `10.0.0.64/26`                                |

Raisons du découpage :

| VLAN         | Raison                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 1 (Backbone) | Séparation stricte de la gestion réseau : un appareil compromis de la maison n'atteint pas les interfaces d'administration       |
| 2 (Home)     | Réseau résidentiel standard, séparé de l'IoT et de l'infrastructure                                                              |
| 3 (Guest)    | Non fiable par définition ; isolation complète, y compris entre invités                                                          |
| 4 (IoT)      | La plupart des appareils IoT ont une sécurité faible ; seul HASS fait le pont d'intégration                                      |
| 5 (Homelab)  | Toute l'infrastructure sur un VLAN : pas de saut inter-VLAN entre clusters et NAS ; VLAN 2 vers VLAN 5 est le seul accès entrant |

### FAQ

| Question                                                        | Réponse                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Où placer le NAS ?                                              | VLAN 5, avec les clusters qui consomment son stockage (Immich, Jellyfin, Paperless), pour éviter les montages inter-VLAN. Les appareils de la maison l'atteignent par la règle VLAN 2 vers VLAN 5.                            |
| Comment découvrir les partages SMB du VLAN 5 depuis le VLAN 2 ? | mDNS et NetBIOS ne traversent pas les VLAN. Options par ordre de préférence : relais mDNS de l'UDM Pro entre les VLAN 2 et 5 (recommandé), entrée DNS statique pour le NAS, double interface sur le NAS (en dernier recours). |
| Et un appareil IoT qui a besoin d'internet ?                    | Le VLAN 4 n'a pas d'internet par défaut. Exception par appareil dans le pare-feu de l'UDM Pro (adresse MAC ou IP statique). HASS est la seule exception au niveau du VLAN.                                                    |

> [!NOTE]\
> La découverte SMB de Windows utilise aussi WSD, que le relais mDNS de l'UDM Pro ne relaie pas. Les clients Windows
> peuvent nécessiter une entrée DNS statique ou un proxy WSD.

## VLAN 5 Address Plan

Tout l'adressage actif tient dans `10.0.0.0/24`. Les trois autres blocs `/24` sont réservés.

### Sub-ranges

| Bloc            | Plage       | Usage                                                                   |
| --------------- | ----------- | ----------------------------------------------------------------------- |
| `10.0.0.0/26`   | .1 à .62    | Hôte PVE et LXC centraux (zone de gestion)                              |
| `10.0.0.64/26`  | .64 à .127  | Pools LoadBalancer Cilium (8 clusters × `/29`, 8 IP utilisables chacun) |
| `10.0.0.128/25` | .129 à .254 | Réservé                                                                 |
| `10.0.1.0/24`   | n/a         | Libre                                                                   |
| `10.0.2.0/24`   | n/a         | Libre                                                                   |
| `10.0.3.0/24`   | n/a         | Libre                                                                   |

### Static Assignments — Management Zone

Convention dans `10.0.0.0/26` : `.1` passerelle, `.10` à `.19` hyperviseur, `.20` à `.29` LXC système, `.30` à `.62`
autres appareils.

| IP        | Hôte                            | DNS                                                        | Remarques                                                                                                                                                     |
| --------- | ------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10.0.0.1  | Passerelle (UDM Pro)            |                                                            |                                                                                                                                                               |
| 10.0.0.10 | pve-01 IPMI                     |                                                            | Gestion à distance du BMC                                                                                                                                     |
| 10.0.0.11 | pve-01 OS                       | pve-01.pve.chezmoi.sh                                      | IP de gestion de l'hyperviseur                                                                                                                                |
| 10.0.0.21 | LXC omni                        | omni.chezmoi.sh, api.omni.chezmoi.sh, kube.omni.chezmoi.sh | UI/API Omni, API Machine SideroLink, proxy de l'API Kubernetes. Double interface : `10.128.0.2` sur talosnet (`eth1`)                                         |
| 10.0.0.22 | LXC o11y                        | data.o11y.chezmoi.sh                                       | Stack Victoria (métriques, logs, traces). `o11y.chezmoi.sh` pointe vers Grafana sur rhodes.akn (#1159). Double interface : `10.128.0.5` sur talosnet (`eth1`) |
| 10.0.0.23 | LXC oci-registry                | oci.chezmoi.sh                                             | Zot : cache OCI pull-through et images internes. Double interface : `10.128.0.4` sur talosnet (`eth1`)                                                        |
| 10.0.0.24 | LXC pve-exporter                |                                                            | Interface unique (VLAN 5)                                                                                                                                     |
| 10.0.0.25 | LXC omni-infra-provider-proxmox |                                                            | Interface unique (VLAN 5)                                                                                                                                     |
| 10.0.0.26 | LXC talosnet-dns                | ns.chezmoi.sh                                              | BIND. Double interface : `10.128.0.3` sur talosnet (`eth1`) sert le DNS ; l'adresse VLAN 5 n'est pas utilisée pour cela                                       |
| 10.0.0.30 | NAS                             | nas.chezmoi.sh                                             | Interface principale. Aussi sur talosnet (`10.128.0.6`)                                                                                                       |
| 10.0.0.31 | NAS (applications)              |                                                            | IP dédiée aux applications (Garage, etc.)                                                                                                                     |

Le wildcard `*.omni.chezmoi.sh` pointe vers la gateway Pangolin publique (`195.201.114.83`, kazimierz.akn) : il se
résout hors du VLAN 5 et n'est lié à aucune IP de ce tableau.

Résolveurs DNS : la gateway UDM Pro (`10.0.0.1`) ne répond pas aux requêtes DNS du VLAN 5 et aucun relais DNS interne
n'est documenté. Les LXC à IP statique utilisent des résolveurs publics (`1.1.1.1`, `9.9.9.9`) via
`catalog.staticNetwork.nameservers` (`catalog/nix/modules/lxc-static-network/`).

### Cilium LoadBalancer Pools

Chaque cluster exécute deux `CiliumLoadBalancerIPPool`, nommés `external` et `internal`. Cette section couvre les pools
`external` (VLAN 5, joignables depuis le réseau de la maison) ; les pools `internal` sont dans
[Internal LoadBalancer Pools (talosnet)](#internal-loadbalancer-pools-talosnet).

| Pool       | Sélection des Services                                              | Règle                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `external` | Par défaut : tout Service ou Gateway qui n'opte pas pour `internal` | Exclut explicitement `internal` (`io.cilium/lb-ipam-pool NotIn [internal]`), sinon les deux pools se disputent les mêmes Services : l'arbitrage de Cilium LB-IPAM ne tient pas compte des labels |
| `internal` | Opt-in via `io.cilium/lb-ipam-pool: internal`                       | Voir la section talosnet                                                                                                                                                                         |

Implémentation de référence : `projects/rhodes.akn/src/infrastructure/kubernetes/cilium/external.ippool.yaml`.

Chaque cluster reçoit un bloc `/29` dont les 8 adresses sont utilisables : ce sont des pools L2 plats annoncés par
Cilium, pas des sous-réseaux routés, donc les adresses réseau et broadcast du bloc ne sont pas réservées. Le `/26`
contient exactement 8 × `/29`. L'ordre suit la création des clusters ; le bac à sable prend le dernier emplacement.

| Bloc            | IP utilisables | Cluster                                 |
| --------------- | -------------- | --------------------------------------- |
| `10.0.0.64/29`  | .64 à .71      | rhodes.akn                              |
| `10.0.0.72/29`  | .72 à .79      | lungmen.akn                             |
| `10.0.0.80/29`  | .80 à .87      | non attribué                            |
| `10.0.0.88/29`  | .88 à .95      | non attribué                            |
| `10.0.0.96/29`  | .96 à .103     | non attribué                            |
| `10.0.0.104/29` | .104 à .111    | non attribué                            |
| `10.0.0.112/29` | .112 à .119    | lungmen-legacy                          |
| `10.0.0.120/29` | .120 à .127    | sandbox / dernier cluster de production |

`lungmen-legacy` (emplacement 7) est une réservation de comptabilité, expliquée dans la note du tableau des
[Pod CIDRs](#pod-cidrs--unique-per-cluster-clustermesh-prerequisite) : aucune IP réelle n'est consommée, le pont
talosnet n'a besoin d'aucun pool LoadBalancer.

Pour désactiver le suivi de connexion (conntrack) sur ces pools, voir
[Désactiver le suivi de connexion des pools LB](../procedures/infrastructure/INF-20260730-00-Desactiver-le-Suivi-de-Connexion-des-Pools-LB.md).

## Proxmox SDN — talosnet VNet

Réseau interne de nœud à nœud pour les clusters Talos, provisionné dans la zone SDN `pvenet`, non routé sur les VLAN
physiques. Codifié dans Pulumi : `projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts` (`pvenetZone`,
`talosnetVnet`, `talosnetSubnet`). La procédure
[Provisionner le SDN Proxmox](../procedures/infrastructure/INF-20260627-00-Provisionner-le-SDN-Proxmox.md) garde la
justification de conception et le chemin de migration vers `vxlan`.

| Paramètre      | Valeur                                                                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zone           | `pvenet`, type `simple` (pas `vxlan`) ; IPAM `pve`, DHCP `dnsmasq`                                                                                                                                                   |
| Plage parente  | `10.128.0.0/16` ; un seul `/24` est alloué                                                                                                                                                                           |
| VNet           | `talosnet` (8 caractères alphanumériques maximum sur PVE 9) ; sous-réseau `10.128.0.0/24`                                                                                                                            |
| Gateway        | `10.128.0.1` (le nœud PVE joue le routeur L3)                                                                                                                                                                        |
| DHCP           | dnsmasq, bail stable par MAC, plage `10.128.0.10` à `10.128.0.250`                                                                                                                                                   |
| DNS (option 6) | `10.128.0.3` (talosnet-dns, BIND), IP littérale via `dhcpDnsServer` ; permet aux clients talosnet de résoudre les noms split-horizon                                                                                 |
| SNAT           | Activé : les nœuds atteignent `pve-01.pve.chezmoi.sh:8006` (requis par proxmox-csi-plugin)                                                                                                                           |
| MTU            | Non défini sur la zone ni le VNet (défaut PVE) ; `1450` fixé sur `eth1` de chaque nœud par `catalog/omni/clustertemplates/base.yaml`, dimensionné pour une migration future vers `vxlan` (50 octets d'encapsulation) |
| ACL            | `SDN.Use` (rôle `PVESDNUser`) accordé à `omni@pve` sur le VNet (`omniSdnTalosnetAcl`) ; le même rôle sur `localnetwork/vmbr1` (plan VLAN 5 / `eth0`) est dans `stack/proxmox/access/omni.ts`                         |

Un VNet unique est partagé par tous les clusters : les `MachineClass` Omni sont des objets COSI partagés et non
kustomizables, et les `patches[]` d'un template de cluster ne peuvent pas surcharger leur `providerdata` (où se trouve
`additional_nics[].bridge`). Le trafic LoadBalancer externe reste isolé par cluster par les pools du VLAN 5. Détail dans
l'[ADR-014](../decisions/ADR-014-Topologie-Reseau.md).

### Adresses de talosnet

| Adresse                 | Usage                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| `10.128.0.1`            | Gateway (nœud PVE)                                                               |
| `10.128.0.2`            | LXC omni (`eth1`)                                                                |
| `10.128.0.3`            | LXC talosnet-dns (`eth1`), serveur DNS du DHCP                                   |
| `10.128.0.4`            | LXC oci-registry (`eth1`)                                                        |
| `10.128.0.5`            | LXC o11y (`eth1`)                                                                |
| `10.128.0.6`            | NAS                                                                              |
| `10.128.0.7` à `.9`     | Réservées                                                                        |
| `10.128.0.10` à `.250`  | Plage DHCP des nœuds Talos                                                       |
| `10.128.0.240` à `.254` | Pools `internal` (chevauchent la fin de la plage DHCP, voir la section suivante) |

### Internal LoadBalancer Pools (talosnet)

`talosnet` n'a aucune route depuis un VLAN physique : seuls les nœuds Talos et les hôtes explicitement rattachés au VNet
l'atteignent. Chaque cluster peut exposer un second pool, `internal`, réellement interne (les pools `external` sont
joignables depuis la maison par la règle VLAN 2 vers VLAN 5). Il porte un `serviceSelector` (opt-in uniquement).

Le DNS split-horizon rend ce pool utile : talosnet-dns (BIND, `10.128.0.3`) laisse external-dns (RFC2136) publier le
même nom `*.chezmoi.sh` qu'un cluster expose déjà à l'extérieur (par exemple `vault.chezmoi.sh`), pointé vers l'IP
interne. Voir `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/talosnet-dns/modules/bind.nix`.

Chaque cluster reçoit un bloc de 2 IP, dans le même ordre que les pools `external`. Le bac à sable est exclu : cluster
jetable sans charge de travail interne.

| Bloc                    | IP utilisables | Cluster                          |
| ----------------------- | -------------- | -------------------------------- |
| `10.128.0.240` à `.241` | 2              | rhodes.akn                       |
| `10.128.0.242` à `.243` | 2              | lungmen.akn                      |
| `10.128.0.244` à `.245` | 2              | non attribué                     |
| `10.128.0.246` à `.247` | 2              | non attribué                     |
| `10.128.0.248` à `.249` | 2              | non attribué                     |
| `10.128.0.250` à `.251` | 2              | non attribué                     |
| `10.128.0.252` à `.253` | 2              | lungmen-legacy                   |
| `10.128.0.254`          | 1              | spare                            |
| `10.128.0.2` à `.9`     | 8              | réservées (hors `.240` à `.254`) |

`lungmen-legacy` (emplacement 7) est la même réservation de comptabilité que pour les pools `external`. Un fichier
`internal.ippool.yaml` existe pour `rhodes.akn` (`10.128.0.240` à `.241`) et `lungmen.akn` (`10.128.0.242` à `.243`).

## Kubernetes CIDRs

Alloués exclusivement dans `172.16.0.0/12`, sans plage `10.x` ni `192.168.x`, pour éviter tout conflit avec les VLAN
physiques, les sous-réseaux SDN et les pools LB.

| Bloc            | Rôle                                                                         |
| --------------- | ---------------------------------------------------------------------------- |
| `172.16.0.0/12` | Contient exactement 8 blocs `/15`                                            |
| `172.30.0.0/15` | Dernier bloc : espace Kubernetes, découpé en deux `/16`                      |
| `172.30.0.0/16` | CIDR de pods (8 clusters × `/19` = 8 192 IP chacun ; unique par cluster)     |
| `172.31.0.0/16` | Réservé ; le premier `/19` (`172.31.0.0/19`) est le CIDR de Services partagé |

### Service CIDR — shared across all clusters (ClusterMesh-ready)

Tous les clusters partagent un CIDR de Services unique : `172.31.0.0/19`, avec kube-dns en `172.31.0.10` partout. Ce
choix est compatible ClusterMesh : Cilium fait la répartition de charge des Services sur le nœud source par eBPF, donc
la ClusterIP est réécrite en IP de Pod backend avant de quitter le nœud. Les ClusterIP ne traversent jamais le lien
inter-clusters, et un recouvrement des CIDR de Services est sans effet. Le reste de `172.31.0.0/16` est réservé.

### Pod CIDRs — unique per cluster (ClusterMesh prerequisite)

Les CIDR de pods ne doivent pas se recouvrir entre clusters : c'est une exigence ClusterMesh. Chaque cluster alloue
depuis son propre `/19` dans `172.30.0.0/16` (un `/16` contient exactement 8 × `/19`).

| Cluster        | cluster.name   | cluster.id | Pod CIDR          | Service CIDR    | kube-dns    |
| -------------- | -------------- | ---------- | ----------------- | --------------- | ----------- |
| rhodes.akn     | rhodes-akn     | 1          | `172.30.0.0/19`   | `172.31.0.0/19` | 172.31.0.10 |
| lungmen.akn    | lungmen-akn    | 2          | `172.30.32.0/19`  | `172.31.0.0/19` | 172.31.0.10 |
| cluster 3      | non attribué   | 3          | `172.30.64.0/19`  | `172.31.0.0/19` | 172.31.0.10 |
| cluster 4      | non attribué   | 4          | `172.30.96.0/19`  | `172.31.0.0/19` | 172.31.0.10 |
| cluster 5      | non attribué   | 5          | `172.30.128.0/19` | `172.31.0.0/19` | 172.31.0.10 |
| cluster 6      | non attribué   | 6          | `172.30.160.0/19` | `172.31.0.0/19` | 172.31.0.10 |
| lungmen-legacy | lungmen-legacy | 7          | `172.30.192.0/19` | `172.31.0.0/19` | 172.31.0.10 |
| sandbox        | sandbox        | 8          | `172.30.224.0/19` | `172.31.0.0/19` | 172.31.0.10 |

> [!NOTE]\
> `lungmen-legacy` (emplacement 7) est une réservation de comptabilité, pas un changement de CIDR de pods en production.
> D'après l'ancienne version de cette page, le cluster lungmen.akn en service garde son CIDR de pods `10.244.0.0/16`
> (hérité, antérieur à Omni) ; la ligne réserve l'identifiant 7 et `172.30.192.0/19` pendant la durée du pont `talosnet`
> temporaire décrit dans [MIGR-20260801-00](../archives/MIGR-20260801-00-Relier-Lungmen-au-Reseau-Talosnet.md), pour
> qu'aucun autre cluster ne prenne cet emplacement. L'emplacement 2 (`lungmen.akn`) reste réservé au vrai cluster recréé
> sous #1072. La ligne est à supprimer à la fin du pont.

### ClusterMesh prerequisites

| Prérequis                                   | État    | Remarques                                                                                                                 |
| ------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| CIDR de pods uniques par cluster            | Fait    | 8 × `/19` dans `172.30.0.0/16`, sans recouvrement                                                                         |
| CIDR de Services partagé entre clusters     | Fait    | `172.31.0.0/19`, compatible ClusterMesh (répartition au niveau source par eBPF)                                           |
| `ipv4NativeRoutingCIDR` = supernet de pods  | Fait    | `172.30.0.0/16` : Cilium ne fait pas de SNAT pour le trafic de pods inter-clusters                                        |
| `routingMode=native` + kubeProxyReplacement | Fait    | Routage natif, sans overlay, kube-proxy désactivé                                                                         |
| `cluster.name` unique par cluster           | À faire | Alloué ci-dessus. À définir dans la configuration Cilium de chaque cluster (pas dans le manifeste d'installation partagé) |
| `cluster.id` unique par cluster (1 à 255)   | À faire | Alloué ci-dessus. Intégré aux identités de sécurité : défini à l'installation, quasi immuable                             |
| `clustermesh-apiserver` joignable           | À faire | Exposition du plan de contrôle par LoadBalancer (TCP 2379). Mécanisme à définir (SDN `talosnet` ou pool LB du VLAN 5)     |
| `cilium-ca` partagée entre clusters         | À faire | Requise pour la vérification mTLS des identités entre clusters                                                            |

Les manifestes d'installation Cilium partagés (`catalog/talos/manifests/cilium/1.19.5-native.yaml`, `1.20.0-native.yaml`
et `1.20.2-native.yaml`, référencés par URL depuis les templates de cluster) ne peuvent pas porter de valeurs par
cluster. `cluster.name` et `cluster.id` sont donc à appliquer après l'installation (par exemple
`cilium config set cluster-name rhodes-akn` et `cilium config set cluster-id 1`, ou un overlay de valeurs Helm géré par
ArgoCD). Le mécanisme exact sera arrêté à l'activation de ClusterMesh.

`ipv4NativeRoutingCIDR` vaut `172.30.0.0/16` (supernet des pods) dans les trois manifestes. Cilium ne fait pas de SNAT
vers une IP de Pod de ce supernet, ce qui est indispensable à la connectivité Pod à Pod inter-clusters. Le CIDR de
Services en est volontairement exclu : les Services sont résolus par eBPF sur le nœud source, pas routés nativement.

### Conflict check

Aucun recouvrement avec les plages existantes :

| Plage existante   | Source            |
| ----------------- | ----------------- |
| 10.0.0.0/22       | VLAN 5 (Homelab)  |
| 10.0.0.64/26      | Pools LB Cilium   |
| 10.10.10.0/24     | VLAN 1 (Backbone) |
| 10.128.0.0/16     | SDN (`talosnet`)  |
| 192.168.10.0/25   | VLAN 2 (Home)     |
| 192.168.10.128/25 | VLAN 3 (Guest)    |
| 192.168.3.0/25    | VLAN 4 (IoT)      |

## OCI Cloud — kazimierz.akn

kazimierz.akn (Oracle Cloud Infrastructure Free Tier) est hors de la topologie L3 du homelab : aucune route vers un
VLAN, un VNet SDN ou un CIDR Kubernetes ci-dessus. Il n'est joignable que par WireGuard (tunnels Pangolin/Newt), jamais
par routage natif. Son espace d'adresses peut donc recouvrir le bloc `172.16.0.0/12` réservé à Kubernetes ; ce
recouvrement n'est sûr que tant qu'OCI reste accessible uniquement par tunnel, et il est à revoir si un chemin de
routage natif (par exemple un futur pair ClusterMesh) est ajouté.

| Ressource                     | CIDR            | Usage                                                            |
| ----------------------------- | --------------- | ---------------------------------------------------------------- |
| VCN `kazimierz-akn-vcn`       | `172.16.0.0/26` | VCN OCI de kazimierz.akn (dual-stack : IPv4 et GUA Oracle `/56`) |
| Subnet `kazimierz-akn-subnet` | `172.16.0.0/28` | Instance gateway Pangolin                                        |

Provisionné par Pulumi : `projects/kazimierz.akn/src/infrastructure/pulumi/stack/oci/network.ts`. Le `/56` IPv6 du VCN
est attribué par Oracle à la création ; le `/64` du subnet se lit sur le VCN réel après provisionnement.

Overlay de l'organisation Pangolin (adressage WireGuard applicatif hébergé sur kazimierz, pas une ressource OCI) :

| Ressource                                    | CIDR            | Usage                                  |
| -------------------------------------------- | --------------- | -------------------------------------- |
| Sous-réseau de l'org Pangolin `chezmoi-sh`   | `172.16.1.0/24` | Overlay WireGuard des sites Newt       |
| Sous-réseau utilitaire de l'org `chezmoi-sh` | `172.16.2.0/24` | Sous-réseau utilitaire Pangolin/Gerbil |

Provisionné par Pulumi : `projects/kazimierz.akn/src/infrastructure/pulumi/stack/pangolin/org.ts`. Valeurs fixées à la
création de l'organisation, non modifiables ensuite. Même raisonnement que pour le VCN : tunnel uniquement, jamais
routé.

## Firewall Rules

### UDM Pro — Inter-VLAN

Tout chemin inter-VLAN non listé est refusé implicitement. Les règles s'appliquent au niveau VLAN uniquement (pas de
règle par port sur l'UDM Pro).

| VLAN           | Internet             | Inter-VLAN                 | Remarques                                                                                                   |
| -------------- | -------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1 (Backbone)   | Non                  | Gestion uniquement         | Équipements réseau uniquement ; pas d'internet requis                                                       |
| 2 (Home)       | Oui                  | Vers VLAN 5 (Homelab)      | Isolation internet par appareil possible (par exemple une TV en mode invité)                                |
| 3 (Home Guest) | Oui                  | Aucun : isolation complète | Les appareils ne se joignent pas entre eux et n'atteignent aucun VLAN local                                 |
| 4 (IoT)        | Non (exception HASS) | Vers HASS uniquement       | Pas d'internet par défaut ; HASS a internet ; VLAN 2 vers HASS autorisé ; exceptions par appareil possibles |
| 5 (Homelab)    | Oui                  | Aucune sortante vers Home  | Le VLAN 2 atteint le VLAN 5 ; le VLAN 5 n'initie rien vers le VLAN 2                                        |

### Proxmox — Per-LXC (NIC-level)

Politique : inbound refusé par défaut (default-drop). Les règles se définissent par protocole et port, sans liste
blanche d'IP par hôte : les restrictions par VLAN ou sous-réseau s'appliquent quand la source est stable (par exemple
pve-exporter limité au VLAN 5), ce qui évite la maintenance par IP quand les adresses changent à une reconstruction.

| LXC                           | Inbound autorisé                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `pve-exporter`                | TCP 9221 (scrape Prometheus) depuis le VLAN 5 uniquement                                        |
| `omni-infra-provider-proxmox` | Port de callback de l'API Proxmox et tunnel WireGuard Omni (selon la documentation du provider) |
| `omni`                        | HTTPS (443), WireGuard (tunnel Omni), UI d'administration                                       |
| `o11y`                        | Prometheus remote-write, HTTPS Grafana/Loki, ingestion Vector                                   |
| `oci-registry`                | HTTPS (pull et push du registre)                                                                |
| Tous les LXC                  | Outbound : sans restriction via la gateway du VLAN 5                                            |

Les listes de ports exactes sont arrêtées au déploiement ; le principe est d'ouvrir le minimum nécessaire au service et
de refuser le reste en entrée.

### Groupe de sécurité Proxmox `talos`

Référence de base des VM Talos gérées par Omni, déclarée dans
`projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/firewall.ts`. Une VM l'utilise en déclarant `GROUP talos`
dans son `.fw` (étape manuelle).

| Règle (entrant) | Protocole | Port  | Source     | Usage                                      |
| --------------- | --------- | ----- | ---------- | ------------------------------------------ |
| ACCEPT          | ICMP      | n/a   | `+rfc1918` | Diagnostic                                 |
| ACCEPT          | TCP       | 50000 | `+rfc1918` | `apid` : API Talos (`talosctl`, Omni)      |
| ACCEPT          | TCP       | 50001 | `+rfc1918` | `trustd` : jonction et confiance des nœuds |

## Historique

- _2026-10-11_ : migration vers le standard de documentation, en français ; page déplacée de `docs/network/ipam.md`.
  Aucune valeur (CIDR, VLAN, identifiant de cluster, pool) n'est modifiée. Les titres de section cités par le code («
  Cilium LoadBalancer Pools », « Internal LoadBalancer Pools (talosnet) », « OCI Cloud — kazimierz.akn », « Firewall
  Rules ») sont conservés tels quels.
- _2026-10-11_ : l'ancien lien `README.md` désignait la vue d'ensemble réseau, maintenant
  [Réseau Reference](Reseau-Reference.md). Les anciens liens vers
  [INF-20260627-00](../procedures/infrastructure/INF-20260627-00-Provisionner-le-SDN-Proxmox.md) et
  [MIGR-20260801-00](../archives/MIGR-20260801-00-Relier-Lungmen-au-Reseau-Talosnet.md) pointent vers les fichiers
  migrés.
- _2026-10-11_ : valeurs confirmées par le dépôt : pools `external` (`10.0.0.64/29` rhodes, `10.0.0.72/29` lungmen) et
  `internal` (`10.128.0.240`-`.241` rhodes, `.242`-`.243` lungmen) dans
  `projects/*/src/infrastructure/kubernetes/cilium/` ; `sdn.ts` (zone `simple`, `10.128.0.0/24`, gateway `.1`, DHCP
  `.10`-`.250`, DNS `.3`, SNAT) ; pod CIDR `172.30.0.0/19` (rhodes) et `172.30.32.0/19` (lungmen) et Service CIDR
  `172.31.0.0/19` dans les templates Omni ; `172.16.1.0/24` et `172.16.2.0/24` dans `pangolin/org.ts` ; VCN
  `172.16.0.0/26` et subnet `172.16.0.0/28` dans `oci/network.ts` ; `mtu: 1450` sur `eth1` dans `base.yaml` ;
  `network_firewall: false` dans `w1.medium.yaml`.
- _2026-10-11_ : adresses des LXC `.21` à `.26` et leurs adresses `eth1` (`10.128.0.2` à `.5`) confirmées par les
  `configuration.nix` de `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/`. `10.128.0.6` (NAS) est confirmée par
  `talosnet-dns/modules/bind.nix`.
- _2026-10-11_ : écart sans changement de valeur : l'ancienne page citait seulement `1.19.5-native.yaml` pour Cilium ;
  le dépôt contient trois manifestes (`1.19.5`, `1.20.0`, `1.20.2`), utilisés respectivement par rhodes, lungmen et
  `base.yaml`, tous avec `ipv4NativeRoutingCIDR=172.30.0.0/16`. `cluster-name` et `cluster-id` ne sont définis dans
  aucun d'eux.
- _2026-10-11_ : écart signalé : la note `lungmen-legacy` de l'ancienne page affirme que le lungmen.akn en service garde
  `10.244.0.0/16`, alors que `lungmen.clustertemplate.yaml` définit `podSubnets` à `172.30.32.0/19` et que `base.yaml`
  marque cet emplacement « ALREADY IN USE ». Non tranché : l'état réel du cluster n'a pas été vérifié ; la note est
  conservée avec son attribution à l'ancienne version.
- _2026-10-11_ : écart signalé : `10.128.0.2` à `.9` était décrit comme réservé ; `.2` à `.6` sont utilisées (LXC omni,
  talosnet-dns, oci-registry, o11y, NAS). La section « Adresses de talosnet » les liste ; le tableau des pools
  `internal` garde sa ligne d'origine. Les pools `internal` (`.240` à `.254`) chevauchent la fin de la plage DHCP
  (`.250`) : la page d'origine annonçait des plages « hors DHCP » alors que `sdn.ts` fixe la fin du DHCP à `.250`.
  Valeurs inchangées.
- _2026-10-11_ : écart hors de cette page :
  `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/oci-registry/modules/log-shipper.nix` épingle `10.0.0.252` pour
  `o11y.chezmoi.sh`, adresse absente de ce plan.
- _2026-10-11_ : non vérifiable dans le dépôt, repris de l'ancienne version : DHCP et VLAN de l'UDM Pro, adresses `.10`,
  `.11`, `.30` et `.31`, règles inter-VLAN, ports par LXC (la section dit qu'ils sont arrêtés au déploiement).
- _2026-10-11_ : emoji de l'ancien tableau « ClusterMesh prerequisites » remplacés par des mots (Fait, À faire) ; le
  groupe de sécurité `talos` (`firewall.ts`) est ajouté, il n'était pas dans l'ancienne page.

## Pour aller plus loin

- [Réseau Reference](Reseau-Reference.md) : topologie physique, double interface des nœuds Talos et SDN.
- [Passerelles Et DNS Reference](Passerelles-et-DNS-Reference.md) : Gateways `internal` et `external` et DNS associé.
- [ADR-014 Topologie réseau](../decisions/ADR-014-Topologie-Reseau.md) : pourquoi le réseau est conçu ainsi.
- [Provisionner le SDN Proxmox](../procedures/infrastructure/INF-20260627-00-Provisionner-le-SDN-Proxmox.md) : création
  de la zone et du VNet.
- [Créer un cluster Talos avec Omni](../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md) : où ces
  CIDR sont appliqués à un nouveau cluster.
