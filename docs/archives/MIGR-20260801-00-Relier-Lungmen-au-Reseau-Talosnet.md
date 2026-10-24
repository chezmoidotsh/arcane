# MIGR-20260801-00 Relier lungmen au réseau talosnet

Cette procédure ajoutait une seconde carte réseau (`eth1`, DHCP sur le VNet SDN `talosnet`) au nœud de control plane
unique de `lungmen.akn`, pour rendre son kube-apiserver joignable depuis `rhodes.akn`. Elle est archivée parce que
l'opération est terminée et que le pont qu'elle créait était explicitement temporaire.

> [!NOTE]\
> **Archivée le 2026-10-11.** L'opération est terminée ; ce document n'est plus tenu à jour. Le pont existe toujours,
> mais ses valeurs ont changé : voir plus bas.

## Ce que couvrait le document

La procédure ajoutait `eth1` sans toucher à la présence existante du nœud sur `eth0` (VLAN 2). Le kube-apiserver de
lungmen devenait joignable depuis `rhodes.akn`, ce qui débloquait la phase 10 de
[#370](https://github.com/chezmoidotsh/arcane/issues/370) (ré-authentification d'External Secrets Operator sur OpenBao).
Elle a été exécutée le 2026-08-01 avec `LUNGMEN_VMID=2411000` et `LUNGMEN_TALOSNET_IP=10.128.0.19` : les 7 étapes ont
abouti sur le nœud en production, sans redémarrage, et les 35 `ExternalSecrets` de lungmen sont passés à `SecretSynced`.
Le document était déjà conservé comme référence pour un pont similaire, non comme runbook à rejouer tel quel.

Elle exigeait l'accès SSH `root` à `pve-01.pve.chezmoi.sh`, les contextes `talosctl` `lungmen.akn`, `kubectl`
`admin@lungmen.akn` et `omni-rhodes-akn`, ainsi qu'un accès administrateur à Vault (`mise run bao:login:admin`). Les
entrées étaient `LUNGMEN_VMID` (identifiant de la VM, via `qm list`) et `LUNGMEN_TALOSNET_IP` (adresse reçue par `eth1`,
relevée en cours de route).

On attachait d'abord la seconde carte dans Proxmox (`qm set ${LUNGMEN_VMID} --net1 virtio,bridge=talosnet,firewall=0`),
puis on déclarait `eth1` (`dhcp: true`, `mtu: 1450`) dans la configuration machine Talos avec
`talosctl patch machineconfig`. Le correctif n'était pas rejoué en entier, parce que les listes `clusterDNS`, `cni.urls`
et `extraManifests` auraient été dupliquées : seul le fragment `interfaces` était appliqué. Si `eth1` n'apparaissait pas
après application, le repli était `qm reboot`, qui coupe tout le cluster pendant 1 à 2 minutes et se planifie en fenêtre
de maintenance.

On relevait ensuite l'adresse attribuée avec `talosctl get addresses` (un bail DHCP stable par MAC) et on vérifiait la
joignabilité depuis rhodes avec un pod jetable `curl` vers `https://${LUNGMEN_TALOSNET_IP}:6443/version` (HTTP 401
attendu). Comme rhodes applique un egress en refus par défaut, il fallait une `CiliumNetworkPolicy` temporaire
autorisant `${LUNGMEN_TALOSNET_IP}/32` sur le port 6443, sans quoi le pod expirait même si le routage était correct.

Le `remote.host` du `ClusterVaultComponent` (`projects/lungmen.akn/src/infrastructure/pulumi/stack/vault.ts`) était
repointé sur `https://${LUNGMEN_TALOSNET_IP}:6443`, puis la règle `toFQDNs` (`kubernetes.lungmen.akn.chezmoi.sh`) de
`projects/rhodes.akn/src/apps/vault/security/network-policy.allow-to-lungmen-api.yaml` était remplacée par une règle
`toCIDR` sur la même adresse, port 6443 : une règle FQDN ne laisse passer que les IP issues d'une résolution DNS
observée, donc elle bloquait la connexion par IP brute. La procédure se terminait par la confirmation de la
resynchronisation d'ESO (`ClusterSecretStore` `READY: True`, `ExternalSecrets` en `SecretSynced`).

Le retour arrière inversait les étapes dans l'ordre inverse, jusqu'à `qm set ${LUNGMEN_VMID} --delete net1`. `eth0`
n'étant jamais modifiée, il n'y avait aucun risque pour la connectivité existante.

## Pourquoi il est archivé

L'opération est terminée, mais le pont reste temporaire : il doit disparaître quand lungmen.akn sera recréé sous la
nouvelle architecture Omni/SDN ([#1072](https://github.com/chezmoidotsh/arcane/issues/1072)) et que son ancien nœud
deviendra `lungmen-legacy`. Les alternatives étudiées dans [#1155](https://github.com/chezmoidotsh/arcane/issues/1155)
(KubeSpan, limité à l'intérieur d'un cluster, et sous-réseau Tailscale, bloqué par un bogue du socket-LB de Cilium) ont
été écartées.

Les valeurs du document ne sont plus celles en vigueur au 2026-10-11. `vault.ts` pointe sur `https://10.128.0.20:6443`,
et la politique réseau de rhodes autorise `toCIDR: 10.128.0.20/32`, avec la mention « temporary — talosnet bridge, see
MIGR-20260801-00 » : l'adresse `10.128.0.19` ci-dessus n'est plus la bonne. Le fichier
`projects/lungmen.akn/src/infrastructure/talos/lungmen-akn-01.patch-config.yaml` n'existe plus dans l'arbre. Le retour à
la règle `toFQDNs` reste conditionné au basculement DNS de lungmen (issue 1188, PR 3). Pour la topologie réseau
actuelle, voir [ADR-014](../decisions/ADR-014-Separer-le-Trafic-des-Noeuds-Talos-du-VLAN-Homelab.md),
[Réseau](../reference/Reseau-Reference.md) et [Plan d'adressage IP](../reference/IPAM-Reference.md).

Ce qui n'a pas été vérifié depuis le dépôt : l'état réel de la seconde carte du nœud dans Proxmox, l'adresse DHCP
actuellement attribuée à `eth1` et la raison du passage de `10.128.0.19` à `10.128.0.20`.

## Texte intégral

Le texte complet (commandes et historique compris) reste dans l'historique Git du fichier
`docs/archives/2026-08-01-MIGR-20260801-00.lungmen-talosnet-bridge.md`, dans la version précédant sa migration (issue
#1257).

## Pour aller plus loin

- [ADR-014 Network Topology](../decisions/ADR-014-Separer-le-Trafic-des-Noeuds-Talos-du-VLAN-Homelab.md) : le VNet
  `talosnet` et le motif à deux cartes réutilisé ici.
- [Réseau](../reference/Reseau-Reference.md) : la topologie réseau actuelle.
- [Plan d'adressage IP](../reference/IPAM-Reference.md) : le VNet `talosnet` et la réservation `lungmen-legacy`.
- [Archive MIGR-20260628-00](MIGR-20260628-00-Migrer-les-Noeuds-Talos-du-VLAN-2-au-VLAN-5.md) : la procédure sœur dont
  celle-ci reprend le schéma attacher, vérifier, redémarrer.
