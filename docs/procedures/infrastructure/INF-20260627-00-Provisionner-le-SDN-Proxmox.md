# INF-20260627-00 Provisionner le SDN Proxmox

Cette procédure provisionne le SDN de Proxmox VE qui porte la conception Talos à double interface réseau (ADR-014) : une
zone `pvenet` de type `simple`, un VNet partagé `talosnet` avec son sous-réseau (passerelle, SNAT, DHCP), et le
privilège `SDN.Use` accordé à l'utilisateur `omni@pve` pour que le provider d'infrastructure Omni puisse y attacher les
cartes réseau des VM Talos. Le résultat est un réseau de gestion des nœuds (`eth1`, `talosnet`) isolé en L2 et partagé
par tous les clusters Talos/Omni (`lungmen.akn`, `rhodes.akn`, le sandbox et les clusters à venir). Les annonces ARP des
LoadBalancers Cilium L2 restent sur `eth0` (`vmbr1`, VLAN 5) et ne sont pas concernées.

Vérifiée contre le dépôt le 2026-10-11 ; les commandes n'ont pas été rejouées sur Proxmox pour cette migration.
L'ancienne version a été appliquée sur PVE 9.2.3 le 2026-06-28.

Depuis le 2026-07-28, la zone, le VNet, le sous-réseau, l'ACL et l'application du SDN sont déclarés dans Pulumi
([`sdn.ts`](../../../projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts)) : les commandes `pvesh create`
et `pveum acl modify` de la version initiale ne sont plus à exécuter à la main. Il reste à faire à la main la
préparation de l'hôte (étape 1), qui précède le `pulumi up`, et le contrôle du résultat sur le nœud (étape 3). La
procédure est additive : elle crée des objets SDN et des ACL, sans modifier les bridges existants, les VM en cours
d'exécution ni l'ACL de `vmbr1`.

> [!NOTE]\
> **Pourquoi un seul VNet partagé ?** La conception initiale prévoyait un VNet par cluster. Les `patches[]` d'un cluster
> template Omni sont des patchs de configuration machine Talos et ne peuvent pas surcharger le `providerdata` d'une
> `MachineClass` (où se trouve `additional_nics[].bridge`) ; la référence `machineClass` n'expose que `name` et `size`
> ([siderolabs/omni#2593](https://github.com/siderolabs/omni/issues/2593)). Un VNet par cluster imposerait un jeu de
> `MachineClass` par cluster, d'où un unique `talosnet`. L'isolation du trafic LoadBalancer externe vient des pools
> `/29` par cluster sur le VLAN 5 (`eth0`), pas du VNet. Le détail est dans la note de révision du 2026-06-27 de
> l'[ADR-014](../../decisions/014-network-topology.md).

## Cadre technique et conventions

- **Plan d'adressage de référence** : les noms de VNet, sous-réseaux, passerelles et options viennent de
  [`ipam.md`](../../network/ipam.md) (section « Proxmox SDN — talosnet VNet »). En cas d'écart avec cette page,
  `ipam.md` fait foi.
- **Contraintes de nommage PVE 9** : les noms de zone et de VNet sont limités à 8 caractères alphanumériques, sans
  tiret. D'où `pvenet` et `talosnet` au lieu de `localnetwork` et `vnet-talos`. La zone s'est d'abord appelée `localnet`
  avant d'être renommée `pvenet`, pour éviter la confusion avec le chemin d'ACL `localnetwork`, préexistant.
- **Zone `simple` et non `vxlan`** : PVE 9 exige `--peers` ou `--fabric` à la création d'une zone VXLAN, ce qui est
  impossible sur un homelab à un seul nœud. Le passage à `vxlan` est décrit à la fin de cette page.
- **Changements SDN mis en attente** : sous PVE 9, toutes les ressources SDN sont sous `/cluster/sdn/` (et non `/sdn/`
  comme sous PVE 8) et ne sont actives qu'après application, comme un index Git. Pulumi déclenche l'application avec la
  ressource `SdnApplier` ; la commande équivalente sur le nœud est `pvesh set /cluster/sdn`.
- **DHCP géré par l'IPAM de PVE** : le service `dnsmasq@pvenet` sert le DHCP de la zone. La configuration générée
  contient `dhcp-ignore=tag:!known` et une plage `static`, ce qui ressemble à un blocage de l'attribution dynamique ; en
  pratique, quand une carte réseau de VM ou de LXC est configurée en `ip=dhcp` sur le VNet, PVE alloue une IP dans le
  pool, écrit l'entrée `MAC,IP` dans `ethers` et recharge dnsmasq avant le premier DHCP DISCOVER du client. Aucune
  réservation manuelle n'est nécessaire.

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `ssh`, `mise` (`mise install`
exécuté), `pulumi`.

Les accès suivants sont également nécessaires :

- accès SSH `root` à `pve-01.pve.chezmoi.sh` (par clé) ;
- droits pour exécuter `mise run pulumi:diff` et `mise run pulumi:apply` sur la stack Proxmox (voir le
  [README de la stack](../../../projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/README.md), notamment la
  section sur les identifiants) ;
- PVE 8.x ou plus récent avec le plugin SDN activé (Datacenter → SDN visible dans l'interface) ; la version de référence
  est PVE 9.

Les objets suivants doivent exister (créés par Pulumi dans
[`access/omni.ts`](../../../projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/access/omni.ts) et
[`pools.ts`](../../../projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/pools.ts), ou à défaut selon le
[README du provider Omni](../../../projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni-infra-provider-proxmox/README.md#proxmox-user-and-role-setup))
: l'utilisateur `omni@pve`, le pool `talos` et l'ACL de `/sdn/zones/localnetwork/vmbr1`. Cette procédure étend cette ACL
sans la recréer.

Lire aussi l'[ADR-014](../../decisions/014-network-topology.md) et la table SDN d'[`ipam.md`](../../network/ipam.md)
pour comprendre la conception à double interface (`eth0` = Cilium L2 sur le VLAN 5, `eth1` = trafic des nœuds sur le
VNet SDN).

## Entrées requises

Toutes les valeurs sont fixées par le plan d'adressage ; aucun choix n'est à faire à chaque exécution.

| Entrée          | Valeur                                    | Où elle est définie                                                                                             |
| --------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Zone            | `pvenet` (type `simple`)                  | `pvenetZone` dans `sdn.ts`                                                                                      |
| VNet            | `talosnet`                                | `talosnetVnet` dans `sdn.ts`                                                                                    |
| Sous-réseau     | `10.128.0.0/24`, passerelle `10.128.0.1`  | `talosnetSubnet` dans `sdn.ts`, [`ipam.md`](../../network/ipam.md)                                              |
| Plage DHCP      | `10.128.0.10` à `10.128.0.250`            | `talosnetSubnet.dhcpRange`                                                                                      |
| DNS distribué   | `10.128.0.3` (talosnet-dns, BIND)         | `talosnetSubnet.dhcpDnsServer`                                                                                  |
| SNAT            | activé                                    | `talosnetSubnet.snat`                                                                                           |
| Nœud            | `pve-01.pve.chezmoi.sh` (IP `10.0.0.11`)  | [`ipam.md`](../../network/ipam.md)                                                                              |
| Utilisateur PVE | `omni@pve`, rôle `PVESDNUser` (`SDN.Use`) | `omniSdnTalosnetAcl` dans `sdn.ts`                                                                              |
| MTU             | `1450` sur `eth1` de chaque nœud Talos    | `catalog/omni/clustertemplates/base.yaml` ; non défini sur la zone ni sur le VNet (le défaut de PVE s'applique) |

## Étape 1 — Préparer l'hôte Proxmox (manuel)

Pulumi ne gère ni les paquets ni les fichiers système de l'hôte : le dépôt ne contient aucun rôle Ansible ni code qui
installe `dnsmasq` ou configure `source-directory` sur `pve-01`. Ces deux prérequis se vérifient à la main avant le
premier `pulumi up`.

```sh
ssh root@pve-01.pve.chezmoi.sh

# Le DHCP du SDN exige dnsmasq ; le service nu est désactivé car le SDN
# utilise des instances dnsmasq@<zone>
apt-get install -y dnsmasq
systemctl disable dnsmasq.service
# → "Removed ... dnsmasq.service" ou aucune sortie si déjà désactivé

# ifupdown2 ne lit /etc/network/interfaces.d/sdn que si le fichier principal inclut ce répertoire
grep "source-directory" /etc/network/interfaces
# → source-directory /etc/network/interfaces.d/
```

Si la directive `source-directory` est absente, l'ajouter (PVE préserve les directives `source` et `source-directory`) :

```sh
sed -i '/^auto lo/i source-directory /etc/network/interfaces.d/\n' /etc/network/interfaces
grep "source-directory" /etc/network/interfaces
# → source-directory /etc/network/interfaces.d/
```

## Étape 2 — Provisionner la zone, le VNet, le sous-réseau et l'ACL (Pulumi)

Cette étape est automatisée. [`sdn.ts`](../../../projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts)
déclare ce que la version initiale créait avec `pvesh` et `pveum` :

| Ressource Pulumi               | Ce qu'elle crée                                                                                       | Commande manuelle remplacée                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pvenetZone` (`SdnZoneSimple`) | Zone `pvenet`, `ipam: pve`, `dhcp: dnsmasq`                                                           | `pvesh create /cluster/sdn/zones`, puis `pvesh set ... --dhcp dnsmasq`            |
| `talosnetVnet` (`SdnVnet`)     | VNet `talosnet` dans la zone `pvenet`                                                                 | `pvesh create /cluster/sdn/vnets`                                                 |
| `talosnetSubnet` (`SdnSubnet`) | Sous-réseau `10.128.0.0/24`, passerelle `10.128.0.1`, `snat: true`, plage DHCP, DNS DHCP `10.128.0.3` | `pvesh create /cluster/sdn/vnets/talosnet/subnets`                                |
| `omniSdnTalosnetAcl` (`Acl`)   | `PVESDNUser` pour `omni@pve` sur `/sdn/zones/pvenet/talosnet`                                         | `pveum acl modify /sdn/zones/pvenet/talosnet --users omni@pve --roles PVESDNUser` |
| `sdnApplier` (`SdnApplier`)    | Application du SDN, à chaque `pulumi up` qui touche l'état SDN                                        | `pvesh set /cluster/sdn`                                                          |

L'ACL de `vmbr1` (plan `eth0`, Cilium L2) est déclarée à part dans
[`access/omni.ts`](../../../projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/access/omni.ts)
(`omniSdnVmbr1Acl`) : elle est conservée, l'ACL du VNet s'y ajoute.

```sh
cd projects/chezmoi.sh/src/infrastructure/pulumi
mise run pulumi:diff     # Prévisualiser : un premier passage crée les 5 ressources ci-dessus
mise run pulumi:apply    # Appliquer (confirmation demandée)
# → les ressources pve-sdn-*, pve-acl-omni-sdn-talosnet et pve-sdn-applier sont créées ou inchangées
```

Sur `pve-01`, les objets créés avant l'arrivée de Pulumi ont été importés plutôt que recréés, voir
[Gérer l'état Pulumi et importer des ressources](INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md).

> [!IMPORTANT]\
> Ne pas retirer `snat: true` du sous-réseau. Sans SNAT, les nœuds Talos (qui n'ont pas d'IP sur le VLAN 5) n'atteignent
> pas l'API Proxmox sur `pve-01:8006`, et `proxmox-csi-plugin` ne peut plus attacher ni détacher de volumes. C'est une
> exigence de l'ADR-014.

## Étape 3 — Vérifier l'état sur le nœud (manuel)

Contrôler que la configuration est active sur l'hôte, ce que Pulumi ne vérifie pas.

```sh
# Zone, VNet, sous-réseau, ACL
pvesh get /cluster/sdn/zones/pvenet
# → type = simple, ipam = pve, dhcp = dnsmasq
pvesh get /cluster/sdn/vnets/talosnet
# → zone = pvenet
pvesh get /cluster/sdn/vnets/talosnet/subnets
# → 10.128.0.0/24, passerelle 10.128.0.1, snat = 1, plage DHCP 10.128.0.10-10.128.0.250
pvesh get /access/acl | grep 'sdn/zones'
# → /sdn/zones/localnetwork/vmbr1 (plan eth0) et /sdn/zones/pvenet/talosnet (plan eth1),
#   tous deux omni@pve / PVESDNUser

# Bridge actif et passerelle portée par le nœud
ip -br link show talosnet
# → talosnet  UP  (UNKNOWN est normal pour un bridge sans port)
ip addr show talosnet | grep "inet "
# → inet 10.128.0.1/24

# DHCP
systemctl is-active dnsmasq@pvenet
# → active

# SNAT : règle de traduction présente
iptables -t nat -L POSTROUTING -n | grep 10.128.0
# → une seule règle SNAT pour 10.128.0.0/24 vers 10.0.0.11
```

Depuis une VM dont `eth1` est sur le VNet, confirmer l'accès à l'API Proxmox à travers la passerelle SNAT (exigence de
CSI) :

```sh
curl -k https://10.0.0.11:8006/api2/json/version
# → JSON avec "version" et "release" : SNAT et accès à l'API confirmés
```

Après le démarrage d'une VM ou d'un LXC en `ip=dhcp` sur `talosnet`, vérifier que le bail est apparu :

```sh
cat /var/lib/misc/dnsmasq.pvenet.leases   # baux MAC <-> IP en cours
cat /etc/dnsmasq.d/pvenet/ethers          # réservations MAC -> IP générées par l'IPAM
```

Pour figer une IP sur une MAC (nœud qui doit garder la même adresse quel que soit l'ordre d'allocation), enregistrer une
réservation explicite :
`pvesh create /cluster/sdn/vnets/talosnet/ips --ip 10.128.0.XX --mac AA:BB:CC:DD:EE:FF --zone pvenet --subnet 10.128.0.0/24`
(remplacer `10.128.0.XX` et l'adresse MAC). L'interface propose la même action : Datacenter → SDN → `pvenet` →
`talosnet` → sous-réseau → IP Management.

## Vérifications rapides

- **Zone** : `pvesh get /cluster/sdn/zones` — `pvenet`, type `simple`, ipam `pve`, dhcp `dnsmasq`.
- **VNet** : `pvesh get /cluster/sdn/vnets` — `talosnet`, zone `pvenet`.
- **Sous-réseau** : `pvesh get /cluster/sdn/vnets/talosnet/subnets` — `10.128.0.0/24`, passerelle `10.128.0.1`,
  `snat=1`, plage DHCP `10.128.0.10` à `10.128.0.250`.
- **ACL** : `pvesh get /access/acl | grep sdn` — `SDN.Use` pour `omni@pve` sur `vmbr1` et sur `talosnet`.
- **Bridge** : `ip -br link show talosnet` — `UP` (ou `UNKNOWN`).
- **Passerelle** : `ip addr show talosnet | grep inet` — `10.128.0.1/24`.
- **SNAT** : `iptables -t nat -L POSTROUTING -n | grep 10.128.0` — une règle vers `10.0.0.11`.
- **DHCP** : `systemctl is-active dnsmasq@pvenet` — `active`.
- **Bail** (après le premier démarrage d'un invité sur `talosnet`) : `cat /var/lib/misc/dnsmasq.pvenet.leases` — une
  ligne `MAC IP nom` par invité connecté.
- **SNAT depuis un invité** : `curl -k https://10.0.0.11:8006/api2/json/version` — JSON de version.

## Problèmes connus

### Le bridge ne monte pas après l'application du SDN

Si `ip -br link show talosnet` ne renvoie rien après l'application :

```sh
# 1. Vérifier la directive source-directory (voir l'étape 1)
grep "source-directory" /etc/network/interfaces

# 2. Lire la configuration d'interface générée par le SDN
cat /etc/network/interfaces.d/sdn

# 3. Réappliquer
pvesh set /cluster/sdn

# 4. Si le bridge reste absent, le monter directement
ifup talosnet

# 5. Chercher les erreurs
journalctl -u 'pve*' -n 50 --no-pager
```

### Erreur 403 à l'attachement d'une carte réseau

Le provider n'a pas `SDN.Use` sur le VNet. Contrôler l'ACL (déclarée par `omniSdnTalosnetAcl`) :

```sh
pvesh get /access/acl | grep talosnet
```

Si elle manque, relancer `mise run pulumi:apply` ; en dernier recours, appliquer la commande manuelle
`pveum acl modify /sdn/zones/pvenet/talosnet --users omni@pve --roles PVESDNUser`, puis réimporter la ressource.

### CSI n'atteint pas l'API Proxmox

`snat: true` doit être défini sur le sous-réseau (`talosnetSubnet`) et le SDN appliqué. Vérifier :

```sh
iptables -t nat -L POSTROUTING -n | grep 10.128.0
# → une règle SNAT vers 10.0.0.11
```

Sans règle, SNAT n'est pas actif : contrôler l'indicateur `snat` du sous-réseau et réappliquer.

### `dnsmasq@pvenet` ne démarre pas

Si `systemctl status dnsmasq@pvenet` affiche « Address already in use », le service `dnsmasq.service` nu entre en
conflit avec l'instance de la zone :

```sh
systemctl stop dnsmasq.service
systemctl disable dnsmasq.service
systemctl start dnsmasq@pvenet
systemctl is-active dnsmasq@pvenet
# → active
```

### Un nœud n'obtient pas d'adresse DHCP

Le DHCP de PVE 9 n'attribue que des adresses réservées (`dhcp-ignore=tag:!known`) : une MAC non enregistrée est ignorée
sans message. Contrôler :

```sh
cat /etc/dnsmasq.d/pvenet/ethers          # réservations MAC -> IP
cat /var/lib/misc/dnsmasq.pvenet.leases   # baux actifs
```

Si la MAC du nœud est absente de `ethers`, enregistrer une réservation via l'IPAM de PVE (voir la note de l'étape 3).

### Règles SNAT en double après un cycle ifdown/ifup

Si `iptables -t nat -L POSTROUTING -n | grep 10.128.0` affiche deux règles identiques, en supprimer une :

```sh
iptables -t nat -D POSTROUTING -s 10.128.0.0/24 -o vmbr0 -j SNAT --to-source 10.0.0.11
# À répéter pour chaque copie en trop, puis vérifier qu'une seule règle subsiste
```

## Migrer de simple à vxlan quand un second nœud Proxmox rejoint le cluster

Quand un second nœud PVE (`pve-02`) rejoint le cluster, la zone `pvenet` doit passer de `simple` à `vxlan`. Les VM en
cours d'exécution ne sont pas interrompues : la migration est une opération au niveau de la zone, qui ne change que
l'encapsulation ; les bridges, sous-réseaux et baux DHCP existants sont conservés.

Depuis la codification Pulumi, la zone est déclarée par `pvenetZone` (`SdnZoneSimple`) dans `sdn.ts`. Le dépôt ne
documente pas la migration côté Pulumi : changer le type de zone dans le code peut recréer la zone au lieu de la
modifier en place, ce qui est à contrôler avec `mise run pulumi:diff` avant toute application.

> [!WARNING]\
> Cette section est un plan de conception, pas une procédure testée. Valider chaque étape avec le
> [wiki PVE SDN](https://pve.proxmox.com/wiki/Software-Defined_Network) avant de l'exécuter sur un nœud de production,
> en particulier : (1) si une zone VXLAN avec `--peers` peut être créée en place sous PVE 9, ou si la zone doit être
> supprimée puis recréée (les VNet seraient alors à migrer séparément) ; (2) si SNAT et DHCP (`dhcp: dnsmasq`) sont pris
> en charge sur les zones de type `vxlan` (la documentation PVE ne les décrit que pour les zones `simple`) ; (3) l'IP de
> tunnel VXLAN de chaque nœud (typiquement l'IP de gestion, `10.0.0.11` pour `pve-01` et `10.0.0.12` pour `pve-02`).

```sh
# Sur le nœud unique actuel (avant l'arrivée de pve-02) :
# 1. Noter la configuration actuelle de la zone
pvesh get /cluster/sdn/zones/pvenet

# Après l'arrivée de pve-02 dans le cluster PVE :

# 2. Passer la zone en vxlan avec les deux IP de nœud comme pairs
#    (ou supprimer puis recréer la zone si le changement de type en place n'est pas pris en charge)
pvesh set /cluster/sdn/zones/pvenet \
  --type vxlan \
  --peers 10.0.0.11,10.0.0.12

# 3. Vérifier que VNet, sous-réseau, DHCP et SNAT sont conservés
pvesh get /cluster/sdn/vnets/talosnet/subnets

# 4. Appliquer
pvesh set /cluster/sdn

# 5. Vérifier le bridge sur les deux nœuds
ssh root@pve-01.pve.chezmoi.sh ip -br link show talosnet
ssh root@pve-02.pve.chezmoi.sh ip -br link show talosnet
```

Les cartes réseau des VM Talos (`eth1` vers `talosnet`) et l'ACL Omni (`/sdn/zones/pvenet/talosnet`) ne changent pas :
seul le type d'encapsulation de la zone change. Le MTU `1450` de `eth1` est déjà dimensionné pour les 50 octets
d'encapsulation VXLAN (`catalog/omni/clustertemplates/base.yaml`).

## Historique

- _2026-10-11_ : Migration vers le standard de documentation (issue #1257) : page traduite en français, structure
  alignée sur le gabarit de procédure, liens relatifs corrigés. Réécriture autour de Pulumi, vérifiée contre le dépôt :
  les étapes de création `pvesh`/`pveum` et d'application sont remplacées par `mise run pulumi:apply` (tableau des
  ressources de `sdn.ts`) ; restent manuelles la préparation de l'hôte (`dnsmasq`, `source-directory`, dont le dépôt ne
  contient aucune automatisation) et la vérification sur le nœud. Ajout du DNS distribué par DHCP (`dhcpDnsServer` =
  `10.128.0.3`), absent de la version initiale. Le MTU `1450` est précisé : il n'est pas défini sur la zone ni sur le
  VNet mais sur `eth1` dans les cluster templates Omni. Le prérequis « le pool et l'utilisateur sont créés par le
  provider Omni » est complété par leur déclaration Pulumi (`access/omni.ts`, `pools.ts`).
- _2026-07-28_ : Zone, VNet, sous-réseau, ACL et application du SDN codifiés dans Pulumi (`stack/proxmox/sdn.ts`), selon
  l'[ADR-014](../../decisions/014-network-topology.md).
- _2026-06-28_ : Appliquée sur PVE 9.2.3. Écarts PVE 9 : API SDN sous `/cluster/sdn/` ; noms de zone et de VNet limités
  à 8 caractères alphanumériques (`vnet-talos` devient `talosnet`) ; zone VXLAN impossible sans `--peers` ou `--fabric`,
  repli sur `simple` ; indicateur `--dhcp dnsmasq` explicite ; paquet `dnsmasq` à installer et `dnsmasq.service` nu à
  désactiver ; directive `source-directory` nécessaire pour que le bridge SDN survive au redémarrage ; DHCP fonctionnel
  via l'IPAM de PVE. Ajout de la section de migration vers VXLAN. Zone renommée `localnet` en `pvenet` (service
  `dnsmasq@pvenet`, chemins `/etc/dnsmasq.d/pvenet/`, ACL `/sdn/zones/pvenet/talosnet`) ; règles SNAT en double
  nettoyées (4 vers 1) et répertoire `/etc/dnsmasq.d/localnet/` supprimé.
- _2026-06-27_ : Création initiale (zone, VNet, sous-réseau avec passerelle, SNAT et DHCP, MTU 1450, ACL `omni@pve`,
  application). Révision le même jour : un seul VNet partagé `vnet-talos` (`10.128.0.0/24`) à la place de trois VNet par
  cluster.

## Pour aller plus loin

- [ADR-014 Topologie réseau](../../decisions/014-network-topology.md) : la décision de conception à double interface et
  la justification du VNet unique.
- [IPAM](../../network/ipam.md) : plan d'adressage de référence, dont la section « Proxmox SDN — talosnet VNet ».
- [Gérer l'état Pulumi et importer des ressources](INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md) :
  importer des objets Proxmox existants dans l'état Pulumi.
- [Désactiver le suivi de connexion des pools LB](INF-20260730-00-Desactiver-le-Suivi-de-Connexion-des-Pools-LB.md) :
  correctif conntrack lié au trafic des VIP sur `talosnet`.
- [Migrer les nœuds Talos du VLAN 2 au VLAN 5](../../archives/MIGR-20260628-00-Migrer-les-Noeuds-Talos-du-VLAN-2-au-VLAN-5.md)
  : archive de la migration VLAN qui a précédé le SDN.
