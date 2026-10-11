# INF-20260730-00 Désactiver le suivi de connexion des pools LB

Cette procédure installe sur `pve-01` une exception `NOTRACK` (conntrack) pour le bloc des pools LoadBalancer Cilium.
Sans elle, avec le design Talos à deux interfaces réseau (ADR-014), les clients réellement externes (hors des clusters
Kubernetes du homelab) n'atteignent pas l'IP LoadBalancer ou Gateway externe d'un cluster : la requête arrive et Cilium
y répond correctement en interne, mais la réponse est abandonnée par le pare-feu de l'hôte Proxmox.

Vérifiée contre le dépôt le 2026-10-11 ; les commandes n'ont pas été rejouées sur l'hôte Proxmox pour cette migration.
Le correctif a été validé en conditions réelles sur la Gateway externe de `rhodes.akn` (`10.0.0.64`, dans le bloc
`10.0.0.64/26`) le 2026-07-30 : `HTTP/1.1 200 OK` depuis un vrai client du VLAN 2, avant et après un `ifreload -a` en
direct.

## Cadre technique et conventions

### Symptôme

Un client du VLAN 2 (Home), ou de tout autre VLAN, vise la VIP de la Gateway externe d'un cluster (par exemple
`10.0.0.64` pour `rhodes.akn`) : le handshake TCP n'aboutit jamais. Le SYN arrive, mais aucun SYN-ACK ne revient. Depuis
l'intérieur du cluster (hairpin depuis un Pod, ou `curl` lancé dans le network namespace du nœud), la même VIP
fonctionne. Seuls les clients réellement externes sont touchés.

### Cause racine

Le design Talos à deux interfaces (ADR-014) donne à chaque nœud `eth0` (trunk VLAN 5, sans IP, réservée à l'annonce L2
de Cilium) et `eth1` (`talosnet`, le VNet SDN, seule IP réelle et seule route par défaut du nœud). Le SYN du client
arrive sur `eth0` (ponté directement sur le VLAN 5, `vmbr1`, par `pve-01`) et Cilium/Envoy le traite correctement. La
réponse (SYN-ACK) est en revanche produite par un processus en espace utilisateur (l'Envoy embarqué de la Gateway API,
lié à `127.0.0.1`). L'annonce L2 ne pilote que l'ARP de la VIP, pas l'interface choisie par le noyau pour une réponse
émise par une socket ([cilium/cilium#40521](https://github.com/cilium/cilium/issues/40521) le confirme). La réponse suit
donc l'unique route par défaut, sort par `eth1`/`talosnet`, et `pve-01` la transmet vers le VLAN 5 via `vmbr0`
(`ip_forward` est activé sur `talosnet` et `vmbr0`, et aucune route ni règle de pare-feu ne la bloque autrement).

La panne réelle se situe une couche plus bas. Le pare-feu de `pve-01` (`pve-firewall`, pare-feu intégré de PVE basé sur
iptables et conntrack) affecte une **zone conntrack** dédiée à tout trafic entrant par un shim de bridge de pare-feu par
invité (`fwbr<vmid>i<net>`, créé dès qu'une NIC d'invité a `firewall=1`) :

```sh
# table raw, chaîne PREROUTING
-A PREROUTING -i fwbr+ -j CT --zone 1
```

Le SYN d'origine du client (ponté par `vmbr1` vers `eth0` de la VM Talos) est évalué dans cette zone. La réponse (routée
via `talosnet` puis `vmbr0`, sans jamais toucher une interface `fwbr+`) est évaluée dans la zone par défaut : de son
point de vue, c'est un SYN-ACK orphelin sans connexion suivie correspondante. La chaîne `PVEFW-FORWARD` de PVE
l'abandonne alors comme `ctstate INVALID`, par sa toute première règle, appliquée avant tout ce qui est configurable :

```sh
# table filter, chaîne PVEFW-FORWARD, règle 1 (fixe, non configurable via cluster.fw ni les security groups)
-A PVEFW-FORWARD -m conntrack --ctstate INVALID -j DROP
```

Le diagnostic a été confirmé empiriquement : le compteur de paquets de la règle DROP augmentait exactement du nombre de
retransmissions du SYN-ACK pendant chaque test en échec, et une capture sur l'interface `talosnet` de `pve-01` montrait
le SYN-ACK arrivant sans jamais atteindre `vmbr0`.

La règle INVALID-drop de `PVEFW-FORWARD` est une base fixe de PVE, évaluée avant toute règle de `cluster.fw` ou de
security group : une règle ACCEPT classique, insérée plus loin dans la chaîne, ne peut pas la contourner.

> [!NOTE]\
> `iptables -t raw -S` sur `pve-01` affiche 9 fois la même règle `CT --zone 1`. Ce n'est pas une duplication due à un
> rechargement (`pve-firewall` n'avait aucun redémarrage au moment de la découverte) : PVE génère une règle par invité
> en cours d'exécution ayant `firewall=1` sur son interface `vmbr1` (9 invités vérifiés : LXC `101` à `105`, VM `109`,
> `201`, `2022100`, `2411000`). Le motif (`fwbr+`) est identique, les 9 copies sont redondantes entre elles sans
> signaler un bug.

### Correctif : NOTRACK sur tout le bloc des pools LB, dans la table raw

Le correctif court-circuite entièrement conntrack pour le bloc partagé des pools LB externes de Cilium, dans les deux
sens, si bien qu'aucune classification `ctstate`, valide ou invalide, ne peut plus s'y appliquer. `raw`/`PREROUTING` est
évaluée par le noyau avant que conntrack n'affecte une zone ou un état, et n'est pas gérée par `pve-firewall` (qui ne
gère que les chaînes `PVEFW-*` de la table `filter` et les règles de zone CT de `raw`) : une règle `NOTRACK` ajoutée à
la main n'est pas écrasée par un rechargement du pare-feu.

La portée est `10.0.0.64/26`, soit tout le bloc que [IPAM](../../network/ipam.md) réserve aux pools LB Cilium (8
clusters × /29, une tranche chacun), et non le `/29` d'un seul cluster. Cela couvre tous les clusters qui exposent une
Gateway externe aujourd'hui comme à l'avenir, sans modification lors de l'ajout d'un cluster. Les règles équivalentes,
en commandes directes :

```sh
iptables -t raw -I PREROUTING 1 -d 10.0.0.64/26 -j NOTRACK   # tout le bloc des pools LB Cilium, tous les clusters
iptables -t raw -I PREROUTING 1 -s 10.0.0.64/26 -j NOTRACK
```

Pour survivre aux redémarrages et à `ifreload -a` (exécuté à chaque `pvesh set /cluster/sdn`, donc à chaque changement
SDN futur), les règles sont installées par un hook idempotent dans `/etc/network/if-up.d/`, le même type de mécanisme
que `ifupdown2` utilise pour les règles générées par PVE. Il est limité pour s'exécuter une seule fois par rechargement
plutôt qu'une fois par interface. Le hook est versionné dans
[`99-talosnet-lb-notrack`](../../../projects/chezmoi.sh/src/infrastructure/ansible/files/99-talosnet-lb-notrack) et
installé par le playbook `pve.yaml` (voir les étapes).

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `ansible-playbook` (via
`mise install`, voir l'environnement de développement dans [`AGENTS.md`](../../../AGENTS.md)), `ssh`, `ssh-keygen`.

Les accès suivants sont également nécessaires :

- accès SSH à `pve-01.pve.chezmoi.sh`, déclaré dans le groupe `pve` de
  `projects/chezmoi.sh/src/infrastructure/ansible/inventory/production.yaml` ;
- droits root sur l'hôte : l'inventaire se connecte directement en `root` (`ansible_user: root`), sans élévation côté
  Ansible.

Le SDN doit être configuré au préalable ([Provisionner le SDN Proxmox](INF-20260627-00-Provisionner-le-SDN-Proxmox.md)).
Cette procédure est aussi à rejouer après toute reconstruction ou réinstallation de `pve-01` (voir
[ADR-014](../../decisions/014-network-topology.md) pour la configuration réseau de l'hôte).

## Entrées requises

- `HOSTNAME` : nom DNS servi par la Gateway à tester, par exemple le nom d'une route `HTTPRoute` du cluster.
- `LB_IP` : IP externe LoadBalancer ou Gateway du cluster, prise dans le bloc `10.0.0.64/26`, par exemple `10.0.0.64`
  pour `rhodes.akn`.

## Étape 1 — Supprimer l'ancienne clé SSH de l'hôte (après reconstruction)

Cette étape ne concerne que le cas d'une reconstruction de `pve-01`. L'hôte présente alors une nouvelle clé SSH que
l'option `accept-new` de l'inventaire ne fait pas confiance automatiquement (elle ne couvre que les hôtes inconnus).
Supprimer l'entrée périmée avant de lancer le playbook :

```sh
ssh-keygen -R pve-01.pve.chezmoi.sh   # aussi l'IP de l'hôte, si la connexion s'est faite par IP
```

## Étape 2 — Installer le hook avec Ansible

Le playbook copie le hook dans `/etc/network/if-up.d/99-talosnet-lb-notrack` (root, mode `0755`) puis l'exécute
immédiatement avec `IFACE=lo`, sans attendre un rechargement. Le hook teste chaque règle avec `iptables -C` avant de
l'insérer : relancer le playbook ne duplique jamais les règles.

```sh
cd projects/chezmoi.sh/src/infrastructure/ansible
ansible-playbook -i inventory/production.yaml pve.yaml
# → "Install the NOTRACK hook for the Cilium LB pool" : changed (première installation) ou ok
# → "Apply the hook now" : changed uniquement si le hook vient d'être installé ou modifié
```

Un aperçu sans modification est possible avec `--check --diff`.

## Étape 3 — Vérifier l'accès externe et la persistance

```sh
# Depuis l'extérieur des clusters du homelab (par exemple un poste sur le VLAN 2) :
curl -m 5 --resolve <HOSTNAME>:443:<LB_IP> https://<HOSTNAME>/
# → une réponse HTTP (par exemple HTTP/1.1 200 OK) au lieu d'un délai dépassé

# Sur pve-01, confirmer que les règles NOTRACK sont présentes, au nombre de 2 exactement (aucun doublon) :
iptables -t raw -L PREROUTING -n --line-numbers | grep NOTRACK
# → deux lignes : une avec destination 10.0.0.64/26, une avec source 10.0.0.64/26

# Confirmer qu'elles survivent à un vrai rechargement (ce que déclenche chaque application SDN) :
ifreload -a
iptables -t raw -L PREROUTING -n --line-numbers | grep NOTRACK
# → toujours exactement 2 lignes
```

## Vérifications rapides

- **Accès externe** : `curl -m 5 --resolve <HOSTNAME>:443:<LB_IP> https://<HOSTNAME>/` depuis un client hors des
  clusters — réponse HTTP reçue.
- **Règles présentes** : `iptables -t raw -L PREROUTING -n --line-numbers | grep NOTRACK` sur `pve-01` — exactement 2
  lignes.
- **Persistance** : mêmes règles après `ifreload -a` — toujours exactement 2 lignes.

## Problèmes connus

### Correctif propre à l'hôte, hors Pulumi

Le correctif s'applique à l'hôte `pve-01` et ne s'exprime pas dans Pulumi : le fournisseur `@pulumi/proxmox` n'offre
aucune primitive d'exception NAT ou conntrack par source. D'où le petit playbook Ansible `pve.yaml`.

### Aucun mécanisme natif de pve-firewall

Les fichiers `cluster.fw`, `host.fw` et ceux des VM n'ont aucune directive pour poser une cible `NOTRACK` ni pour
changer l'affectation des zones conntrack. Les fils du forum Proxmox sur ce même problème (liens plus bas) aboutissent
tous à une règle iptables ou nftables manuelle en `post-up` ou en hookscript, comme ici. La règle `CT --zone 1` de PVE à
l'origine du problème est elle-même installée de cette façon : la procédure n'en contourne pas le cadre, elle utilise le
même mécanisme que le code de PVE.

### Pas de tâche cron de réapplication

Rien ne retire la règle entre deux `ifreload`. La génération des règles de `pve-firewall` ne fait qu'ajouter (voir la
note sur les 9 copies) : elle ne vide jamais la table `raw`, donc ne peut pas non plus supprimer la règle. Une
réapplication périodique résoudrait un problème qui ne se produit pas ; le hook `if-up.d` réaffirme déjà la règle à
chaque chemin de rechargement légitime (`ifreload -a`, démarrage).

### Bloc de pools LB agrandi

Si le bloc des pools LB dépasse un jour `10.0.0.64/26` (voir [IPAM](../../network/ipam.md)), mettre à jour le CIDR
`POOL` du hook en conséquence. Aucune autre modification par cluster n'est nécessaire : le bloc est partagé par les 8
tranches de cluster par conception.

### Non répliqué sur un futur pve-02

`/etc/network/if-up.d/` est sur le disque local, pas dans `/etc/pve/` (le magasin de configuration répliqué du cluster,
où vivent `cluster.fw` et consorts). Lorsqu'un second nœud Proxmox rejoindra le cluster (voir la migration `vxlan`
d'[ADR-014](../../decisions/014-network-topology.md)), ajouter l'hôte au groupe d'inventaire `pve` et relancer le
playbook : il n'apparaît pas automatiquement.

### SNAT non actif sur talosnet à la date de la découverte

Lors de l'investigation initiale (2026-07-30), le SNAT n'était pas actif sur `talosnet`, bien que
`projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts` déclare `snat: true` et que
[Provisionner le SDN Proxmox](INF-20260627-00-Provisionner-le-SDN-Proxmox.md) le décrive comme obligatoire :
`pvesh get /cluster/sdn/vnets/talosnet/subnets` ne montrait aucune clé `snat` et `iptables -t nat -L POSTROUTING` était
vide. Cet écart entre état déclaré et état réel est distinct du sujet de cette procédure, qui ne le corrige pas ; il
n'avait pas encore fait l'objet d'une issue. Cet état n'a pas été revérifié sur l'hôte pour cette migration.

## Historique

- _2026-10-11_ : Migration vers le standard de documentation (issue #1257) : page traduite en français, structure
  alignée sur le gabarit de procédure. Liens relatifs corrigés (`../network/ipam.md` et
  `../decisions/014-network-topology.md` devenus `../../network/ipam.md` et `../../decisions/014-network-topology.md`,
  la page étant à deux niveaux sous `docs/`). Contenu revérifié contre le dépôt : hook `99-talosnet-lb-notrack`,
  playbook `pve.yaml`, bloc `10.0.0.64/26` d'IPAM, `accept-new` de l'inventaire et `snat: true` de `sdn.ts` sont
  conformes.
- _2026-10-08_ : Hook déplacé d'une copie en ligne vers un fichier versionné installé par `pve.yaml` (Ansible).
- _2026-07-30_ : Portée de NOTRACK élargie du `/29` de `rhodes.akn` à tout le bloc `10.0.0.64/26` des pools LB (tous les
  clusters). Ajout des notes sur l'absence de mécanisme natif PVE et sur l'inutilité d'une réapplication par cron.
- _2026-07-30_ : Création initiale, à la suite d'une investigation en direct de l'inaccessibilité de la Gateway externe
  de `rhodes.akn`.

## Pour aller plus loin

- [ADR-014 — Topologie réseau du homelab](../../decisions/014-network-topology.md) : la décision de design à deux
  interfaces et l'entrée d'évolution du 2026-07-30 qui décrit ce correctif.
- [Provisionner le SDN Proxmox](INF-20260627-00-Provisionner-le-SDN-Proxmox.md) : la procédure de mise en place du SDN,
  préalable à celle-ci.
- [IPAM](../../network/ipam.md) : le plan d'adressage, dont le bloc `10.0.0.64/26` des pools LB Cilium.
- [cilium/cilium#40521](https://github.com/cilium/cilium/issues/40521) et
  [cilium/cilium#43819](https://github.com/cilium/cilium/issues/43819) : l'annonce L2 ne pilote pas le routage des
  réponses, et le même mode de défaillance signalé pour Gateway API.
- [Disabling conntrack on a VM interface](https://forum.proxmox.com/threads/disabling-conntrack-on-vm-interface-with-nftables-based-firewall-enabled.163524/)
  et
  [NAT network and firewall - conntrack zone](https://forum.proxmox.com/threads/nat-network-and-firewall-conntrack-zone.58820/)
  : confirmation sur le forum Proxmox de l'absence de directive native.
