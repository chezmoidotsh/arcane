# MIGR-20260801-00 Relier lungmen au réseau talosnet

Migré le 2026-10-11 ; les commandes, les valeurs et les liens n'ont pas été revérifiés.

Cette procédure ajoutait une seconde carte réseau (`eth1`, DHCP sur le VNet SDN `talosnet`) au nœud de control plane
unique de `lungmen.akn`, sans toucher à sa présence existante sur `eth0` (VLAN 2). Elle rendait le kube-apiserver de
lungmen joignable depuis `rhodes.akn`, ce qui débloquait la phase 10 de
[#370](https://github.com/chezmoidotsh/arcane/issues/370) (ré-authentification d'External Secrets Operator sur OpenBao).
Le pont était explicitement temporaire.

Elle a été exécutée le 2026-08-01 avec `LUNGMEN_VMID=2411000` et `LUNGMEN_TALOSNET_IP=10.128.0.19`. Les 7 étapes ont
abouti sur le nœud en production, sans redémarrage ; les 35 `ExternalSecrets` de lungmen sont passés à `SecretSynced`.
Le document était déjà conservé comme référence pour un pont similaire, non comme runbook à rejouer tel quel.

> [!NOTE]\
> **Constat au 2026-10-11.** Le pont existe toujours, mais ses valeurs ont changé. `vault.ts`
> (`projects/lungmen.akn/src/infrastructure/pulumi/stack/`) pointe sur `https://10.128.0.20:6443` et la politique
> `projects/rhodes.akn/src/apps/vault/security/network-policy.allow-to-lungmen-api.yaml` autorise
> `toCIDR: 10.128.0.20/32`, avec la mention « temporary — talosnet bridge, see MIGR-20260801-00 » : l'adresse
> `10.128.0.19` ci-dessus n'est plus celle en vigueur. Le fichier
> `projects/lungmen.akn/src/infrastructure/talos/lungmen-akn-01.patch-config.yaml` n'existe plus dans l'arbre. Le retour
> à la règle `toFQDNs` reste conditionné au basculement DNS de lungmen (issue 1188, PR 3). Pour la topologie réseau
> actuelle, voir [ADR-014](../decisions/ADR-014-Topologie-Reseau.md), [Réseau](../reference/Reseau-Reference.md) et
> [Plan d'adressage IP](../reference/IPAM-Reference.md).

## Ce que couvrait le document

Le document exigeait l'accès SSH `root` à `pve-01.pve.chezmoi.sh`, les contextes `talosctl` `lungmen.akn`, `kubectl`
`admin@lungmen.akn` et `omni-rhodes-akn`, ainsi qu'un accès administrateur à Vault (`mise run bao:login:admin`). Les
entrées étaient `LUNGMEN_VMID` (identifiant de la VM, via `qm list`) et `LUNGMEN_TALOSNET_IP` (adresse reçue par `eth1`,
connue à l'étape 3).

Les étapes étaient les suivantes :

1. Attacher la seconde carte dans Proxmox, en laissant `net0` (VLAN 2) intact :

   ```bash
   qm set ${LUNGMEN_VMID} --net1 virtio,bridge=talosnet,firewall=0
   ```

2. Déclarer `eth1` (`dhcp: true`, `mtu: 1450`) dans la configuration machine Talos. Le correctif n'était pas rejoué en
   entier (les listes `clusterDNS`, `cni.urls` et `extraManifests` auraient été dupliquées) : seul le fragment
   `interfaces` était appliqué.

   ```bash
   talosctl --context lungmen.akn patch machineconfig --patch-file /tmp/eth1-only-patch.yaml --dry-run
   talosctl --context lungmen.akn patch machineconfig --patch-file /tmp/eth1-only-patch.yaml --mode=auto
   ```

   En l'absence d'`eth1` après application, repli sur `qm reboot ${LUNGMEN_VMID}` : panne complète du cluster pendant le
   redémarrage (1 à 2 minutes), à planifier en fenêtre de maintenance.

3. Relever l'adresse attribuée avec `talosctl --context lungmen.akn get addresses` (un bail DHCP stable par MAC).
4. Vérifier la joignabilité depuis rhodes avec un pod jetable `curl` vers `https://${LUNGMEN_TALOSNET_IP}:6443/version`
   (HTTP 401 attendu). rhodes applique un egress en refus par défaut : sans `CiliumNetworkPolicy` temporaire autorisant
   `${LUNGMEN_TALOSNET_IP}/32` sur le port 6443, le pod expire même si le routage est correct.
5. Repointer `remote.host` du `ClusterVaultComponent` (`projects/lungmen.akn/src/infrastructure/pulumi/stack/vault.ts`)
   sur `https://${LUNGMEN_TALOSNET_IP}:6443`, avec `mise run pulumi:diff` puis `mise run pulumi:apply`.
6. Remplacer, dans `projects/rhodes.akn/src/apps/vault/security/network-policy.allow-to-lungmen-api.yaml`, la règle
   `toFQDNs` (`kubernetes.lungmen.akn.chezmoi.sh`) par une règle `toCIDR` sur `${LUNGMEN_TALOSNET_IP}/32`, port 6443 :
   une règle FQDN ne laisse passer que les IP issues d'une résolution DNS observée, donc elle bloquait la connexion par
   IP brute. Puis `./scripts/dist:render` et `./scripts/argocd:app:sync`.
7. Confirmer la resynchronisation d'ESO : `kubectl --context admin@lungmen.akn get clustersecretstore vault.chezmoi.sh`
   (`READY: True`) et `get externalsecrets -A` (`SecretSynced`).

Le retour arrière inversait les étapes 6, 5, 2 puis 1, la dernière commande étant
`qm set ${LUNGMEN_VMID} --delete net1`. `eth0` n'étant jamais modifiée, aucun risque pour la connectivité existante.

## Pourquoi il est archivé

L'opération est terminée. Le pont reste temporaire : il doit disparaître quand lungmen.akn sera recréé sous la nouvelle
architecture Omni/SDN ([#1072](https://github.com/chezmoidotsh/arcane/issues/1072)) et que son ancien nœud deviendra
`lungmen-legacy`. Les alternatives étudiées dans [#1155](https://github.com/chezmoidotsh/arcane/issues/1155) (KubeSpan,
limité à l'intérieur d'un cluster, et sous-réseau Tailscale, bloqué par un bogue du socket-LB de Cilium) ont été
écartées.

Ce qui n'a pas été vérifié depuis le dépôt : l'état réel de la seconde carte du nœud dans Proxmox, l'adresse DHCP
actuellement attribuée à `eth1` et la raison du passage de `10.128.0.19` à `10.128.0.20`.

## Texte intégral

Le texte d'origine, en anglais, est figé à
[`docs/archives/2026-08-01-MIGR-20260801-00.lungmen-talosnet-bridge.md`](https://github.com/chezmoidotsh/arcane/blob/60b1b896fdeeadf83e4e979356fcba60c59f8516/docs/archives/2026-08-01-MIGR-20260801-00.lungmen-talosnet-bridge.md)
(commit `60b1b896`, dernière version avant la migration de la documentation, issue #1257). Le lien pointe sur un commit
: il reste valable après la suppression du fichier.

## Pour aller plus loin

- [ADR-014 Topologie réseau](../decisions/ADR-014-Topologie-Reseau.md) : le VNet `talosnet` et le motif à deux cartes
  réutilisé ici.
- [Réseau](../reference/Reseau-Reference.md) : la topologie réseau actuelle.
- [Plan d'adressage IP](../reference/IPAM-Reference.md) : le VNet `talosnet` et la réservation `lungmen-legacy`.
- [Archive MIGR-20260628-00](MIGR-20260628-00-Migrer-les-Noeuds-Talos-du-VLAN-2-au-VLAN-5.md) : la procédure sœur dont
  celle-ci reprend le schéma attacher, vérifier, redémarrer.
