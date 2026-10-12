---
status: "accepted"
date: 2026-07-30
decision-makers: ["Alexandre"]
assisted-by: ["claude-sonnet-4-6", "glm-5.2", "claude-sonnet-5"]
informed: []
template-version: "2.0.0"
---

# ADR-014 Séparer le trafic des nœuds Talos du VLAN Homelab

## Contexte et problème

Le homelab repose sur un seul hyperviseur Proxmox (`pve-01`), relié directement à une passerelle UDM Pro par deux cartes
réseau physiques (sans commutateur intermédiaire). L'UDM Pro gère cinq VLAN : Backbone (VLAN 1), Home (VLAN 2), Home
Guest (VLAN 3), IoT (VLAN 4) et Homelab (VLAN 5, `10.0.0.0/22`). L'hôte Proxmox expose deux bridges aux VM et aux LXC :
`vmbr0` (administration de PVE, VLAN 5 uniquement) et `vmbr1` (trunk compatible VLAN pour toutes les VM et tous les
LXC).

Lors du provisionnement du premier cluster Talos (`lungmen.akn`), chaque VM a reçu une seule carte réseau sur `vmbr1`
(VLAN 5). Cela fonctionnait pour un cluster unique : les IP des nœuds, le trafic kubelet, etcd et les annonces ARP des
LoadBalancer L2 de Cilium partageaient le même segment L2. À l'exception du gratuitous ARP de Cilium pour `10.0.0.64/29`
(la tranche LB de lungmen dans le pool `/26`), le trafic restait confiné au VLAN 5 et invisible des appareils de la
maison.

La planification d'un second cluster de production (`rhodes.akn`), suivie dans
[#1038](https://github.com/chezmoidotsh/arcane/issues/1038), a révélé un problème structurel de cette conception. Avec
le modèle à une seule carte, le trafic de nœud de chaque cluster (kubelet, etcd, trafic interne du CNI) partagerait le
même domaine de broadcast L2 du VLAN 5 : rien au niveau réseau ne sépare les ports kubelet et etcd d'un cluster des
nœuds de l'autre, et une inondation ARP accidentelle sur `lungmen.akn` pourrait perturber la connectivité des nœuds de
`rhodes.akn`.

Par ailleurs, les annonces L2 de Cilium (gratuitous ARP, réponses ARP non sollicitées) doivent rester sur le segment
partagé du VLAN 5 pour que les appareils de la maison et la table de routage de l'UDM Pro apprennent les IP des
services. Le trafic d'administration des nœuds (API kubelet, communication des pairs etcd, overlay interne) n'a en
revanche pas besoin de se trouver sur ce segment, et les mélanger crée du bruit et une surface d'exposition qui
croissent avec chaque nouveau cluster.

La question stratégique à laquelle cet ADR répond est la suivante : **comment isoler en L2 le trafic de nœud entre
clusters sans modifier la configuration de l'UDM Pro à chaque nouveau cluster, tout en gardant les annonces LoadBalancer
L2 de Cilium sur le VLAN Homelab partagé où les appareils de la maison les atteignent ?**

## Facteurs de décision

### Exigences fonctionnelles

- Les nœuds Talos doivent atteindre l'API Proxmox (`pve-01:8006`) pour que `proxmox-csi-plugin` attache et détache
  correctement les volumes.
- Les annonces ARP des LoadBalancer L2 de Cilium doivent rester sur le VLAN 5, pour que l'UDM Pro et les appareils du
  réseau de la maison apprennent les IP des services Kubernetes sans configuration de routage supplémentaire.
- Le trafic de nœud de chaque cluster (kubelet, etcd, inter-nœuds) doit être isolé en L2 de celui des autres clusters.
- Les IP de nœud attribuées par DHCP doivent être stables d'un redémarrage à l'autre (baux stables par MAC).
- L'ajout d'un nouveau cluster ne doit exiger aucune modification de l'UDM Pro ni du câblage physique.

### Exigences non fonctionnelles

- **Simplicité d'exploitation** : un seul mainteneur ; la conception réseau doit rester compréhensible et déboguable
  sans expertise réseau spécialisée.
- **Surcoût VXLAN acceptable** : un en-tête de 50 octets sur un lien de 1 Gbit/s, avec une bande passante inter-nœuds de
  homelab généralement inférieure à 100 Mbit/s, est négligeable.
- **Déclaratif et versionné** : règles GitOps n°1 et n°2 ; la topologie réseau doit être capturée dans le code (ce
  document et [IPAM](../reference/IPAM-Reference.md)), pas seulement dans l'état d'une interface graphique.

### Contraintes

- **La configuration de l'UDM Pro passe uniquement par l'interface graphique** : le provider Terraform UniFi est fragile
  face aux mises à jour du contrôleur, donc chaque changement sur l'UDM Pro est une opération manuelle. Ajouter un VLAN
  par cluster imposerait une intervention dans l'interface de l'UDM Pro à chaque provisionnement.
- **Un seul nœud Proxmox** : aucune topologie SDN multi-nœud à envisager ; tout le trafic VXLAN reste sur le même hôte
  physique (de fait, en boucle locale), donc la latence est négligeable.
- **Proxmox SDN est disponible** : PVE 8.x fournit le SDN avec le support des zones VXLAN ; aucun logiciel
  supplémentaire n'est requis.

## Options envisagées

### Option 1 : VM Talos à une seule carte sur le VLAN 5 (V1)

> **Statut : REJETÉE**

Chaque VM Talos reçoit une seule carte sur `vmbr1`, étiquetée VLAN 5. La VM reçoit une IP statique dans la zone
d'administration (`10.0.0.0/26`), et tout le trafic (administration des nœuds, overlay Cilium et annonces L2) passe par
le même segment L2. C'est la configuration en place lorsque `lungmen.akn` était le seul cluster, remplacée par l'option
3 à l'arrivée du second.

- `+` Aucune configuration supplémentaire : pas de SDN, pas de seconde carte, pas de serveur DHCP.
- `+` Aucun surcoût VXLAN.
- `+` Entièrement transparente sur le réseau : tout le trafic est visible sur le VLAN 5 pour le débogage.
- `-` Tous les clusters partagent le même domaine de broadcast L2, sans isolation inter-clusters.
- `-` Une erreur de configuration du CNI sur un cluster peut atteindre en L2 les ports de nœud des autres clusters.
- `-` Le domaine de broadcast ARP croît linéairement avec le nombre de clusters, ce qui augmente le bruit sur le VLAN 5.
- `-` Les annonces L2 de Cilium et le trafic kubelet/etcd ne peuvent pas être séparés : tout passe par la même
  interface, ce qui accroît la surface d'attaque des ports d'administration des nœuds.

### Option 2 : VM Talos à double carte avec Proxmox SDN VXLAN (V2)

> **Statut : REJETÉE**

Chaque VM Talos reçoit deux cartes :

- `eth0` → `vmbr1` (trunk VLAN 5, aucune IP de nœud) : uniquement les réponses ARP des annonces L2 de Cilium ; la VM
  répond à l'ARP pour les IP du pool LB mais ne porte aucun trafic kubelet.
- `eth1` → un VNet SDN partagé, encapsulé en VXLAN, DHCP avec baux stables par MAC : tout le trafic d'administration des
  nœuds (API kubelet, etcd, overlay de pods inter-nœuds).

Une seule zone `vxlan` de Proxmox SDN porterait un VNet partagé (`10.128.0.0/24`) utilisé par **tous** les clusters
Talos/Omni, comme dans l'option 3. La seule différence avec l'option 3 est l'encapsulation : `vxlan` fait transiter le
domaine L2 du VNet par IP, de sorte qu'il peut s'étendre sur plusieurs hôtes Proxmox. C'est précisément pourquoi il
constituait la cible d'origine : un futur homelab multi-nœud en a besoin pour que le VNet du plan de nœud continue de
fonctionner quand les VM des clusters sont réparties sur plusieurs hôtes physiques.

**Pourquoi la rejeter aujourd'hui, précisément :** l'API SDN de PVE 9 refuse de créer une zone `vxlan` sans `--peers` ou
`--fabric`, qui exigent tous deux de nommer l'adresse d'au moins un autre nœud Proxmox, alors que le homelab n'a que
`pve-01`. Ce n'est ni une préférence molle ni un arbitrage coût/bénéfice : l'appel d'API de création de la zone échoue
catégoriquement. `vxlan` ne peut pas être choisi sur ce matériel aujourd'hui, sans exception. La
[procédure INF-20260627-00](../procedures/infrastructure/INF-20260627-00-Provisionner-le-SDN-Proxmox.md#migrer-de-simple-à-vxlan-quand-un-second-nœud-proxmox-rejoint-le-cluster)
décrit la migration à exécuter quand un second nœud arrive et que cette option redevient viable.

- `+` Le domaine L2 du VNet peut s'étendre sur plusieurs hôtes Proxmox, ce qui devient indispensable dès qu'il y a plus
  d'un nœud.
- `+` L'encapsulation en tunnel apporte une vraie frontière d'isolation au niveau du fil, et pas seulement un bridge
  privé local à l'hôte.
- `-` **Impossible à créer sur un cluster Proxmox à un seul nœud** : contrainte dure de la plateforme, pas un arbitrage.
- `-` Ajoute 50 octets de surcoût VXLAN par paquet ; acceptable à la bande passante d'un homelab, mais pertinent pour
  les charges de stockage à haut débit.
- `-` Un second chemin réseau (SDN) à configurer et à déboguer, en plus des VLAN physiques.

### Option 3 : VM Talos à double carte avec un VNet Proxmox SDN en zone `simple` (V2)

> **Statut : ACCEPTÉE**

Identique à la séparation `eth0`/`eth1` de l'option 2 ; seul le type de zone SDN change. Une seule zone **`simple`** de
Proxmox SDN porte un VNet partagé, `talosnet` (`10.128.0.0/24`, zone `pvenet`), utilisé par **tous** les clusters
Talos/Omni. Une zone `simple` est un bridge privé local à l'hôte, sans encapsulation : elle n'exige ni `--peers` ni
`--fabric`, et peut donc être créée sur un seul nœud Proxmox, ce qui est précisément la contrainte qui a écarté
l'option 2. Le SNAT sur la gateway du VNet (`10.128.0.1`, PVE jouant le routeur L3) permet aux nœuds d'atteindre
`pve-01:8006` (requis par `proxmox-csi-plugin`). L'UDM Pro n'a besoin d'aucune modification : le VLAN 5 existe déjà et
porte les annonces LB de Cilium depuis `eth0`.

Le compromis que cette option accepte est la portée : le bridge d'une zone `simple` est local à l'hôte et ne s'étend
donc pas à un second nœud Proxmox. C'est acceptable aujourd'hui (homelab à un seul nœud) et c'est la raison de migrer
vers l'option 2 (`vxlan`) le jour où un second nœud est ajouté : cette option ne remplace pas durablement l'option 2,
elle est ce que le matériel actuel permet. La zone, le VNet et le sous-réseau sont codifiés dans Pulumi
(`projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts`), ce qui a remplacé les étapes manuelles
`pvesh`/`pveum` que la
[procédure INF-20260627-00](../procedures/infrastructure/INF-20260627-00-Provisionner-le-SDN-Proxmox.md) documentait à
l'origine. PVE 9 limite aussi les noms de VNet à 8 caractères alphanumériques : le `vnet-talos` prévu initialement
s'appelle donc `talosnet`.

**Révision (2026-06-27) : les VNet par cluster fusionnés dans `talosnet`.** La conception d'origine (quelle que soit
l'option) prévoyait un VNet par cluster (`vnet-lungmen`, `vnet-rhodes`, `vnet-sandbox`) taillé dans `10.128.0.0/16`,
chacun assurant l'isolation L2 du trafic du plan de nœud entre clusters. Pendant la mise en œuvre, une contrainte
stricte d'Omni est apparue : les `patches[]` d'un template de cluster sont uniquement des patches strategic-merge de la
configuration machine Talos, et **ne peuvent pas surcharger le `providerdata` d'une `MachineClass`** (par exemple
`additional_nics[].bridge`). La référence `machineClass` d'un template de cluster n'expose que `name` et `size` ; le
bridge auquel une carte se rattache vit dans le `providerdata` de la `MachineClass`, et les `MachineClass` sont des
ressources typées COSI partagées (`metadata.type`/`metadata.id`) qu'on ne peut pas patcher par cluster avec kustomize
([référence des templates de cluster Omni](https://docs.siderolabs.com/omni/reference/cluster-templates) ; confirmation
d'un mainteneur dans [siderolabs/omni#2593](https://github.com/siderolabs/omni/issues/2593)). Des VNet par cluster
exigeraient donc un jeu de `MachineClass` distinct par cluster. Plutôt que de multiplier les `MachineClass`, un seul
`talosnet` partagé (`10.128.0.0/24`) est adopté pour tous les clusters Talos. **Compromis :** l'isolation L2 par cluster
du trafic de nœud (`eth1`) est sacrifiée au profit d'un catalogue de `MachineClass` partagé et simple, conformément au
principe KISS. L'isolation inter-clusters du trafic LoadBalancer _externe_ est conservée grâce aux pools LB du VLAN 5
propres à chaque cluster (`10.0.0.64/26`), qui restent des tranches `/29` distinctes par cluster sur `eth0`.

- `+` **Réellement créable sur un seul nœud Proxmox** : ni `--peers` ni `--fabric`, aucun second hôte requis.
- `+` **Plan de nœud séparé du VLAN Homelab** : tout le trafic de nœud des clusters (kubelet, etcd, inter-nœuds) est
  confiné au `talosnet` partagé et tenu hors du VLAN 5, réservé aux seules annonces LB de Cilium.
- `+` **Aucune modification de l'UDM Pro par nouveau cluster** : ajouter un cluster réutilise le `talosnet` partagé et
  le catalogue de `MachineClass` (IaC, sans interface graphique) ; l'UDM Pro n'est pas touché.
- `+` **Séparation nette du trafic** : annonces L2 de Cilium sur `eth0` (VLAN 5, visibles de l'UDM Pro) et
  administration des nœuds sur `eth1` (VNet SDN, invisible des VLAN physiques). Le bruit de broadcast ARP sur le VLAN 5
  se limite aux annonces des pools LB.
- `+` Le SNAT sur la gateway du VNet donne accès à l'API Proxmox sans exposer les IP de nœud au segment du VLAN 5.
- `+` Aucun surcoût d'encapsulation : une zone `simple` ne tunnelise rien.
- `-` **Un seul nœud, par construction** : le bridge ne s'étend pas à un second hôte Proxmox ; en ajouter un impose de
  migrer vers l'option 2 (`vxlan`), et non un simple ajustement de configuration.
- `-` Proxmox SDN ajoute de la surface d'exploitation : un second chemin réseau à configurer et à déboguer.
- `-` Les IP de nœud (DHCP du dnsmasq du SDN) ne sont pas visibles sur le VLAN 5 : il faut passer par `kubectl` ou Omni
  pour trouver les adresses des nœuds lors du débogage.

## Décision retenue

**Option retenue : « option 3, VM Talos à double carte avec un VNet Proxmox SDN en zone `simple` ».** (L'option 2, la
même conception sur `vxlan`, est la cible une fois qu'un second nœud Proxmox existe ; voir la raison de son rejet.)

L'intérêt d'isolation de la conception à double carte avec VNet partagé est décisif dès plus d'un cluster : un domaine
L2 partagé unique (option 1) signifie que le trafic de nœud de n'importe quel cluster est joignable par les charges de
travail de n'importe quel autre cluster au niveau réseau. Les options 2 et 3 éliminent cette surface sans intervention
sur l'UDM Pro. Entre 2 et 3, le choix n'est pas vraiment un arbitrage : l'option 2 ne peut pas être créée sur le nœud
Proxmox unique actuel, donc l'option 3 est la seule sur la table tant que cela ne change pas.

La surface d'exploitation du SDN est un compromis accepté. Le SDN est géré de façon déclarative dans Pulumi
(`stack/proxmox/sdn.ts`) et documenté dans [IPAM](../reference/IPAM-Reference.md). Le provider d'infrastructure Omni
gère automatiquement le rattachement au VNet lors du provisionnement des VM.

**Isolation L2 sans dépendance à l'UDM Pro.** La contrainte fondamentale est que la configuration de l'UDM Pro passe par
l'interface graphique et ne peut pas être automatisée en sécurité. Un VLAN UDM Pro par cluster couplerait chaque
provisionnement de cluster à une opération manuelle sur l'UDM Pro, exactement le type d'état non documentable et non
reproductible que les règles GitOps n°1 et n°2 existent pour éliminer. Les options 2 et 3 poussent l'isolation dans la
couche Proxmox SDN, qui est pilotée par API et peut s'exprimer en IaC.

**Séparation nette des plans L2.** La conception à double carte crée deux plans de trafic distincts : le plan d'annonce
(`eth0`, VLAN 5) et le plan d'administration (`eth1`, VNet SDN). Cette séparation fait que le domaine de broadcast
physique du VLAN 5 ne voit que le gratuitous ARP de Cilium pour les IP du pool LB, et non les poignées de main kubelet,
les élections etcd ni l'établissement des tunnels de pods inter-nœuds. Le rayon d'impact d'une erreur de configuration
du CNI dans le plan de nœud est borné à `talosnet` (`10.128.0.0/24`) ; l'isolation inter-clusters du trafic de service
_externe_ est conservée par les pools LB du VLAN 5 propres à chaque cluster.

**Accès à l'API Proxmox par SNAT.** `proxmox-csi-plugin` exige que les nœuds appellent l'API Proxmox (`pve-01:8006`).
Avec la conception SDN, les nœuds n'ont aucune IP directe sur le VLAN 5 : la gateway du VNet fournit donc un SNAT qui
donne à chaque nœud une IP source routable pour cet appel. C'est une exception ciblée qui n'expose pas les ports
d'administration des nœuds au VLAN 5.

---

## Conséquences

### Positives

- (+) Le trafic de nœud des clusters (kubelet/etcd) reste hors du VLAN 5, sur le `talosnet` partagé ; les broadcasts ARP
  du VLAN 5 se limitent aux annonces LB de Cilium.
- (+) Ajouter un cluster réutilise le `talosnet` existant et le catalogue de `MachineClass` partagé : pas de nouveau
  VNet, pas de nouvelle `MachineClass`, aucune modification de l'UDM Pro.
- (+) Le domaine de broadcast ARP du VLAN 5 ne porte que les annonces LB de Cilium, pas le trafic de nœud des clusters.
- (+) Les IP de nœud sont stables d'un redémarrage à l'autre (baux DHCP stables par MAC du dnsmasq du SDN).
- (+) La topologie réseau est entièrement documentée et reproductible (cet ADR et
  [IPAM](../reference/IPAM-Reference.md)).
- (+) Tous les clusters partagent un seul manifeste d'installation de Cilium : le supernet de CIDR de pods
  `172.30.0.0/16` est défini comme `ipv4NativeRoutingCIDR` (`catalog/talos/manifests/cilium/`). C'est un **prérequis de
  ClusterMesh** : Cilium ne fait pas de SNAT pour les destinations du supernet, de sorte que le trafic de pods
  inter-clusters conserve son identité source. Chaque cluster alloue toujours son propre `/19` sans recouvrement dans ce
  `/16` ; le paramètre `ipv4NativeRoutingCIDR` indique seulement à Cilium de ne pas masquer le trafic à destination de
  toute adresse de la plage élargie.
- (+) **CIDR de services unifié pour tous les clusters** : tous les clusters partagent `172.31.0.0/19` (kube-dns
  `172.31.0.10` partout) au lieu de `/19` propres à chaque cluster. C'est compatible avec ClusterMesh : Cilium résout
  les ClusterIP sur le nœud source par eBPF, si bien qu'elles ne traversent jamais le lien inter-clusters. Les CIDR de
  pods restent uniques par cluster (obligatoire). Voir le tableau des prérequis ClusterMesh dans
  [IPAM](../reference/IPAM-Reference.md).

### Négatives

- (-) Tous les clusters Talos partagent `talosnet` : le trafic de nœud (`eth1`) n'est **pas** isolé en L2 par cluster
  (selon la révision du 2026-06-27). L'isolation des services externes reste assurée par les pools LB du VLAN 5 propres
  à chaque cluster.
- (-) Une fois migré vers `vxlan` (option 2) : 50 octets de surcoût par paquet, négligeables à la bande passante d'un
  homelab mais pertinents pour les charges à forte intensité de stockage sur des PVC adossés au NAS.
- (-) Les IP de nœud ne sont pas visibles sur le VLAN 5 ; le débogage exige `kubectl get nodes -o wide` ou la console
  Omni plutôt qu'un simple scan `arp` sur le VLAN 5.
- (-) Le dnsmasq du Proxmox SDN doit tourner pour provisionner de nouveaux nœuds ; un redémarrage de dnsmasq n'affecte
  pas les nœuds déjà en marche (les baux stables sont persistants).
- (-) Un service terminé en espace utilisateur sur `eth0` (par exemple l'Envoy embarqué de la Gateway API) exige une
  exception conntrack au niveau de l'hôte `pve-01` pour être joignable par de vrais clients externes ; voir l'entrée du
  2026-07-30 de l'évolution de la décision et la
  [procédure INF-20260730-00](../procedures/infrastructure/INF-20260730-00-Desactiver-le-Suivi-de-Connexion-des-Pools-LB.md).

### Neutres

- (\~) L'isolation actuelle est un bridge local à l'hôte, pas un tunnel sur le fil (voir le compromis à nœud unique de
  l'option 3) ; cela change une fois la migration vers `vxlan` (option 2) faite.
- (\~) `10.0.0.10` est l'adresse IPMI de `pve-01` ; `10.0.0.11` est l'IP d'administration de l'OS. La paire `.10`/`.11`
  est intentionnelle (BMC et OS hôte sur des adresses consécutives).

---

## Évolution de la décision

- **2026-07-30** : **Lacune opérationnelle constatée : de vrais clients externes n'atteignaient pas la VIP Gateway d'un
  cluster.** Découverte en déboguant la Gateway externe de `rhodes.akn`. Les annonces L2 de Cilium ne pilotent que l'ARP
  de la VIP, pas l'interface que le noyau choisit pour une réponse générée par un processus en espace utilisateur
  (l'Envoy embarqué de la Gateway API, sur `127.0.0.1`), ce qu'appuient
  [cilium/cilium#40521](https://github.com/cilium/cilium/issues/40521) et
  [cilium/cilium#43819](https://github.com/cilium/cilium/issues/43819). Cette réponse suit l'unique route par défaut du
  nœud (`eth1`/`talosnet`) et `pve-01` la transmet correctement vers le VLAN 5 au niveau du routage, mais le pare-feu de
  `pve-01` l'abandonne : PVE affecte une zone conntrack dédiée (`CT --zone 1`) au trafic entrant par un shim de bridge
  de pare-feu par invité (`fwbr+`) ; la réponse n'en traverse jamais (elle arrive par `talosnet`/`vmbr0`), donc, du
  point de vue de cette zone qui ne correspond pas, c'est un SYN-ACK orphelin non suivi, abandonné par la règle fixe et
  non configurable `ctstate INVALID` de `PVEFW-FORWARD`. Corrigé par une exception `NOTRACK` dans la table `raw` pour le
  CIDR du pool LB concerné, rendue persistante par un hook idempotent dans `/etc/network/if-up.d/` (qui survit à
  `ifreload -a`, déclenché par chaque future application du SDN). Cela ne change ni la décision ni les compromis de cet
  ADR : `eth0` sans IP n'a jamais été le problème, et le correctif vit entièrement sur `pve-01`, hors de la
  configuration de Talos et de Cilium. Cause racine complète et correctif :
  [procédure INF-20260730-00](../procedures/infrastructure/INF-20260730-00-Desactiver-le-Suivi-de-Connexion-des-Pools-LB.md).
- **2026-07-28** : **Codifié dans Pulumi** : la zone, le VNet, le sous-réseau et l'ACL que INF-20260627-00 provisionnait
  à la main sont désormais déclarés dans `projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts`, ce qui
  remplace la recette manuelle `pvesh create`/`pveum acl modify` pour les futures recréations de cluster. Même zone
  `simple`, même adressage `talosnet` : aucun changement de conception, seulement le passage de l'état tel qu'appliqué
  vers l'IaC.
- **2026-06-29** : **Unification du CIDR de services (préparation à ClusterMesh)** : passage de CIDR de services propres
  à chaque cluster (un `/19` par cluster dans `172.31.0.0/16`) à un unique CIDR de services partagé `172.31.0.0/19` pour
  tous les clusters. Avec l'équilibrage de charge de services par eBPF de Cilium, les ClusterIP sont résolues sur le
  nœud source et n'apparaissent jamais sur le lien inter-clusters, de sorte que des CIDR de services qui se recouvrent
  sont transparents pour ClusterMesh. Cela simplifie les templates de cluster (CIDR de services et kube-dns deviennent
  des valeurs par défaut, plus des surcharges par cluster). Les CIDR de pods restent propres à chaque cluster (prérequis
  ClusterMesh obligatoire). Ajout d'un tableau d'allocation `cluster.name`/`cluster.id` pour l'activation future de
  ClusterMesh.
- **2026-06-28** : **Contraintes de la plateforme PVE 9 à l'application** : la création de la zone `vxlan` a échoué, car
  PVE 9 exige `--peers`/`--fabric` à la création, ce qui suppose un second nœud Proxmox qui n'existe pas. Appliqué à la
  place comme zone `simple` (nommée `pvenet`) : aucune encapsulation VXLAN n'est réellement en vigueur aujourd'hui, elle
  ne le sera qu'une fois un second nœud arrivé et la zone migrée (procédure documentée dans INF-20260627-00). Renommage
  aussi de `vnet-talos` en `talosnet` : PVE 9 limite les noms de VNet à 8 caractères alphanumériques, traits d'union
  compris. Cela ne change ni la décision elle-même (un VNet SDN partagé pour isoler le plan de nœud du VLAN 5) ni ses
  compromis, seulement le mécanisme d'encapsulation et le nom des objets. (Scindée rétroactivement en option 2, `vxlan`,
  rejetée, et option 3, `simple`, acceptée ; voir l'entrée du 2026-07-28.)
- **2026-06-27 (révision)** : **VNet par cluster fusionnés en un seul `vnet-talos` partagé.** La mise en œuvre a révélé
  que les `patches[]` d'un template de cluster Omni ne peuvent pas surcharger le `providerdata` d'une `MachineClass` (où
  se trouve le bridge de la carte) ; les `MachineClass` sont des ressources COSI partagées non kustomizables, donc des
  VNet par cluster imposeraient un jeu de `MachineClass` par cluster. Résolu en adoptant un seul `vnet-talos`
  (`10.128.0.0/24`) pour tous les clusters Talos, en échangeant l'isolation L2 des nœuds par cluster contre un catalogue
  de `MachineClass` simple. L'isolation des LB externes est conservée par les pools LB du VLAN 5 propres à chaque
  cluster, inchangés.
- **2026-06-27** : **Architecture V2 (cet ADR)** : double carte et Proxmox SDN VXLAN, déclenchée par la planification
  multi-cluster de [#1038](https://github.com/chezmoidotsh/arcane/issues/1038). Le domaine L2 partagé a été identifié
  comme un problème structurel à partir de deux clusters. Le SDN VXLAN a été préféré aux VLAN UDM Pro par cluster pour
  éviter une dépendance à l'interface de l'UDM Pro à chaque cluster. Le pool LB de Cilium est passé de
  `192.168.10.64/28` (VLAN 2 / Home) à `10.0.0.64/26` (VLAN 5 / Homelab) pour garder tout le trafic des clusters dans le
  VLAN Homelab.
- **2026-05** : **Conception initiale (V1)** : VM Talos à une seule carte sur le VLAN 5 (`10.0.0.0/22`) pour le premier
  cluster `lungmen.akn`. Raisons : un seul cluster, aucun surcoût VXLAN, transparence totale sur le VLAN 5. Pool LB de
  Cilium en `10.0.0.64/29`.

---

## Historique des modifications

- **2026-10-11** : **CHORE** : Migration vers le gabarit d'ADR 2.0.0 (version française) : traduction, sections
  renommées, sommaire manuel supprimé, section `Pour aller plus loin`, émojis des conséquences remplacés par les
  marqueurs du gabarit, liens de référence convertis en liens en ligne, `template-version` ajouté. Titre et nom de
  fichier reformulés pour nommer la décision plutôt que le sujet (« Topologie réseau » devient « Séparer le trafic des
  nœuds Talos du VLAN Homelab »). L'option « VLAN UDM Pro par cluster », jamais réellement envisagée, est retirée : les
  options 3 et 4 deviennent les options 2 et 3, y compris dans les entrées historiques. Statuts d'options et préfixes de
  l'historique ramenés à ceux du gabarit, évolution de la décision triée du plus récent au plus ancien. Décision,
  valeurs d'adressage et dates d'origine inchangées.
- **2026-10-11** : **FEATURE** : Passage de `status` de `accepted` à `implemented`, sans `implementation-completed` (le
  texte n'établit aucune date de fin). Le dépôt prouve que la décision est appliquée dans son périmètre actuel : zone
  `simple` `pvenet`, VNet `talosnet` et sous-réseau `10.128.0.0/24` dans `stack/proxmox/sdn.ts` ; seconde carte
  `additional_nics` sur `talosnet` dans les `MachineClass` de `catalog/omni/machineclasses/` ; `eth1` en DHCP (MTU 1450)
  dans `catalog/omni/clustertemplates/base.yaml` ; pools LB `external` distincts par cluster (`10.0.0.64/29` et
  `10.0.0.72/29`) ; hook `99-talosnet-lb-notrack` installé par `pve.yaml` ; `ipv4NativeRoutingCIDR=172.30.0.0/16` dans
  les manifestes Cilium ; `scripts/omni:template:lint`. La migration vers `vxlan` (option 2) reste prévue pour l'arrivée
  d'un second nœud Proxmox et n'est pas faite. Mise à jour de `date`.
- **2026-07-30** : **FIX** : de vrais clients externes n'atteignaient pas la VIP Gateway d'un cluster, car le pare-feu
  de `pve-01` abandonnait la réponse comme `ctstate INVALID`, en raison d'une zone conntrack différente entre le chemin
  pontée de la requête et le chemin routé de la réponse. Corrigé par une exception `NOTRACK` sur `pve-01`, documentée
  dans la
  [procédure INF-20260730-00](../procedures/infrastructure/INF-20260730-00-Desactiver-le-Suivi-de-Connexion-des-Pools-LB.md).
  Aucun changement de la décision ni de ses compromis ; voir la nouvelle entrée de l'évolution de la décision et les
  conséquences négatives mises à jour.
- **2026-07-28** : **CLARIFICATION** : l'ancienne « option 2 » unique est scindée en deux : l'**option 2** (Proxmox SDN
  `vxlan`) est désormais marquée **REJETÉE pour le homelab actuel à un seul nœud**, car PVE 9 refuse de créer une zone
  `vxlan` sans `--peers`/`--fabric`, c'est-à-dire sans second nœud : ce n'était donc jamais un vrai choix, seulement un
  mur de plateforme. L'**option 3** (zone Proxmox SDN `simple`) est celle réellement **ACCEPTÉE** et en service ; la
  section `Décision retenue` pointe désormais vers elle. Migrer de l'option 3 vers l'option 2 (`vxlan`) est obligatoire,
  non facultatif, dès l'arrivée d'un second nœud, puisque les zones `simple` ne peuvent pas s'étendre sur plusieurs
  hôtes. Correction aussi de `vnet-talos` en `talosnet` (limite de 8 caractères des noms de VNet sur PVE 9 ; la zone est
  `pvenet`) dans les sections d'état actuel (les entrées historiques de l'évolution de la décision et de l'historique
  gardent le nom d'origine). Désormais codifié dans Pulumi (`stack/proxmox/sdn.ts`), ce qui remplace la procédure
  manuelle. Aucun changement de la décision de fond (un VNet SDN partagé isole le trafic de nœud du VLAN 5) ni de ses
  compromis ; voir les options 2 et 3 et les deux nouvelles entrées de l'évolution de la décision.
- **2026-06-29** : **FEATURE** : CIDR de services unifié pour tous les clusters : tous partagent `172.31.0.0/19`
  (kube-dns `172.31.0.10` partout) au lieu de `/19` propres à chaque cluster. Des CIDR de services qui se recouvrent
  sont compatibles avec ClusterMesh : l'équilibrage de charge de services par eBPF de Cilium résout les ClusterIP sur le
  nœud source. L'allocation précédente de CIDR de services par cluster (`172.31.0.0/16` découpé en 8 × `/19`) est
  remplacée ; l'espace `172.31.x.x` restant est réservé. Ajout d'un tableau d'allocation `cluster.name`/`cluster.id`
  (prérequis de ClusterMesh, pas encore appliqués).
- **2026-06-27** : **FEATURE** : VNet SDN par cluster (`vnet-lungmen`, `vnet-rhodes`, `vnet-sandbox`) remplacés par un
  seul `vnet-talos` partagé (`10.128.0.0/24`), après avoir constaté que les `patches[]` d'un template de cluster Omni ne
  peuvent pas surcharger le `providerdata` d'une `MachineClass` (bridge de la carte). Compromis : l'isolation L2 des
  nœuds par cluster est sacrifiée au profit d'un catalogue de `MachineClass` partagé simple ; l'isolation des LB
  externes par cluster est conservée par les pools LB du VLAN 5.
- **2026-06-27** : **FEATURE** : ADR initial documentant la conception réseau V1 (une carte, un cluster) et V2 (double
  carte et Proxmox SDN VXLAN, multi-cluster). Créé en même temps que [IPAM](../reference/IPAM-Reference.md) et
  [`topology.d2`](../assets/network/topology.d2), qui forment la référence réseau complète.

---

## Pour aller plus loin

- [#1038 Template de cluster Omni à double carte et SDN](https://github.com/chezmoidotsh/arcane/issues/1038) : l'issue
  de suivi.
- [#1032 Documenter la topologie réseau du homelab](https://github.com/chezmoidotsh/arcane/issues/1032) : l'issue
  bloquante.
- [Implémentation Pulumi](../../projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts) : la zone, le VNet
  et le sous-réseau du SDN.
- [IPAM](../reference/IPAM-Reference.md) : le plan d'adressage (VLAN, pools LB Cilium, `talosnet`, CIDR Kubernetes).
- [Référence réseau](../reference/Reseau-Reference.md) : la topologie réseau du homelab.
- [Diagramme de topologie réseau](../assets/network/topology.d2) : la source D2 du schéma de la topologie.
- [Provisionner le SDN Proxmox](../procedures/infrastructure/INF-20260627-00-Provisionner-le-SDN-Proxmox.md) : la
  procédure d'origine et la migration de `simple` vers `vxlan`.
- [Désactiver le suivi de connexion des pools LB](../procedures/infrastructure/INF-20260730-00-Desactiver-le-Suivi-de-Connexion-des-Pools-LB.md)
  : le correctif `NOTRACK` sur `pve-01`.
- [Migrer les nœuds Talos du VLAN 2 au VLAN 5](../archives/MIGR-20260628-00-Migrer-les-Noeuds-Talos-du-VLAN-2-au-VLAN-5.md)
  : la migration archivée qui a précédé cette topologie.
- [ADR-013 Observabilité centralisée VictoriaMetrics sur LXC](./ADR-013-Observabilite-Centralisee-VictoriaMetrics-sur-LXC.md)
  : dépend du réseau LXC du VLAN 5 et des règles de pare-feu de pve-exporter décrites ici.
- [Proxmox SDN](https://pve.proxmox.com/wiki/Setup_Simple_Zone_With_SNAT_and_DHCP) : documentation de la zone simple
  avec SNAT et DHCP.
- [Cilium L2 Announcements](https://docs.cilium.io/en/stable/network/l2-announcements/) : documentation des annonces L2.
- [RFC 7348 VXLAN](https://datatracker.ietf.org/doc/html/rfc7348) : la spécification de VXLAN.
- [proxmox-csi-plugin](https://github.com/sergelogvinov/proxmox-csi-plugin) : le plugin CSI Kubernetes pour Proxmox.
