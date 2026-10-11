# MIGR-20260628-00 Migrer les nœuds Talos du VLAN 2 au VLAN 5

Cette procédure déplaçait les machines virtuelles Talos gérées par Omni de l'ancienne disposition réseau (VLAN 2, une
seule carte) vers la disposition V2 (VLAN 5 sur `eth0`, VNet `talosnet` sur `eth1`). Elle est archivée parce que les
machine classes décrivent désormais uniquement la disposition V2.

> [!NOTE]\
> **Archivée le 2026-10-11.** La migration est terminée ; ce document n'est plus tenu à jour.

## Ce que couvrait le document

Les machine classes d'Omni sont passées de V1 (VLAN 2, une carte) à V2 (VLAN 5, deux cartes) lors de l'adoption de la
topologie réseau décrite dans l'ADR-014. Omni ne reprovisionne pas les machines en cours d'exécution quand une machine
class change : les nœuds existants restaient en V1 jusqu'à une migration manuelle. Un cluster mixte (VLAN 2 et VLAN 5)
n'était pas supporté.

Les grandes étapes étaient les suivantes :

1. Pousser les définitions V2 des machine classes dans Omni (aucun effet sur les nœuds existants).
2. Repérer les nœuds à migrer et vérifier leur configuration réseau dans Proxmox (`tag=2`, une seule carte).
3. Migrer les workers un par un : drainer le nœud, le supprimer puis le recréer via Omni avec la machine class V2
   (variante possible : modifier la configuration réseau de la VM dans Proxmox avec `qm set`, déconseillée car Omni peut
   écraser le changement), vérifier que le nœud est `Ready`, puis le rendre à nouveau planifiable.
4. Migrer le nœud de control plane en dernier, pendant une fenêtre de maintenance (indisponibilité inévitable pour un
   control plane à nœud unique).
5. Retirer éventuellement le VLAN 2 du trunk `vmbr1` une fois qu'aucune VM ne l'utilise.

Pendant la fenêtre de migration, le trunk de `vmbr1` devait transporter les VLAN 2 et 5. Le résultat attendu était un
cluster dont tous les nœuds sont `Ready`, avec `eth1` en DHCP sur `talosnet` (`10.128.0.x`) et aucune VM en `tag=2`.

## Pourquoi il est archivé

Les quatre machine classes du dépôt (`c1.minimal`, `w1.medium`, `w1.large`, `w1.xlarge` dans
`catalog/omni/machineclasses/`) déclarent `vlan: 5`, et le README du même répertoire note que la valeur « was 2 in V1 ».
Le cluster template partagé `catalog/omni/clustertemplates/base.yaml` ne contient aucune référence à un VLAN ou à
`talosnet` : les clusters créés aujourd'hui héritent de la disposition V2 par les machine classes. Un nœud neuf naît
donc en V2 et ne passe plus par cette migration.

Ce qui ne peut pas être confirmé depuis le dépôt :

- La date de fin réelle de la migration et le retrait effectif du VLAN 2 du trunk `vmbr1` : ces informations relèvent de
  l'état du serveur Proxmox, pas du dépôt.
- L'absence de VM en `tag=2` sur le serveur Proxmox.
- Le README de `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni-infra-provider-proxmox/` mentionne encore
  `vlan: 2` pour les VM Talos (ligne 275) : cette mention est probablement obsolète par rapport aux machine classes.

Le VLAN 2 existe toujours dans le réseau (réseau résidentiel « Home », voir `docs/network/ipam.md`) ; seule son
utilisation par les nœuds Talos a disparu.

## Texte intégral

Le texte d'origine, en anglais, est figé à
[`docs/procedures/infrastructure/MIGR-20260628-00.vlan2-to-vlan5.md`](https://github.com/chezmoidotsh/arcane/blob/a4b94da36d2a779878ea80850a76272e5e4cc524/docs/procedures/infrastructure/MIGR-20260628-00.vlan2-to-vlan5.md)
(commit `a4b94da3`, dernière version avant la migration de la documentation, issue #1257). Le lien pointe sur un commit
: il reste valable après la suppression du fichier.

## Pour aller plus loin

- [ADR-014 Network Topology](../decisions/014-network-topology.md) : la décision qui a motivé la migration (VLAN 5,
  double carte, SDN).
- [Plan d'adressage IP](../network/ipam.md) : VLAN, sous-réseaux et règles inter-VLAN.
- [Provisionner le SDN Proxmox](../procedures/infrastructure/INF-20260627-00-Provisionner-le-SDN-Proxmox.md) : prérequis
  de la migration (VNet `talosnet`, trunk VLAN 5).
