# Passerelles et DNS Reference

Cette page décrit les deux Gateways Cilium de chaque cluster (`external` et `internal`) et les deux autorités DNS qui
répondent pour `*.chezmoi.sh` selon la position du client. Elle sert à savoir quelle Gateway et quel DNS interviennent
pour un nom d'hôte donné. Vérifiée contre le dépôt le 2026-10-11 ; l'état réel des clusters n'a pas été revérifié. Les
plages d'adresses (pools, VIP, DNS) sont dans [IPAM Reference](IPAM-Reference.md), la topologie dans
[Réseau Reference](Reseau-Reference.md).

## Les deux Gateways

`rhodes.akn` et `lungmen.akn` déclarent chacune deux Gateways Cilium (GatewayClass `cilium`), dans le namespace
`kube-system`, et non dans `in-gateway-system` (voir [Historique](#historique)). Sources :
`projects/<cluster>/src/infrastructure/kubernetes/cilium/{external,internal}.gateway.yaml`.

| Gateway    | Joignable depuis                             | Pool LB-IPAM (`CiliumLoadBalancerIPPool`)                                              | Label `external-dns.chezmoi.sh/zone` |
| ---------- | -------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------ |
| `external` | Réseau domestique (VLAN 2 vers VLAN 5)       | Pool `external` : attrape tout service sans le label `io.cilium/lb-ipam-pool=internal` | `external`                           |
| `internal` | Talosnet uniquement (nœuds Talos, hôtes SDN) | Pool `internal` : réservé aux services portant ce label                                | `internal`                           |

Les blocs d'adresses de chaque pool sont dans [IPAM Reference](IPAM-Reference.md).

| Cluster       | Listeners `external`                              | Listeners `internal`                       | Routes attachées à `internal`          |
| ------------- | ------------------------------------------------- | ------------------------------------------ | -------------------------------------- |
| `rhodes.akn`  | `web`, `*.chezmoi.sh`, `*.akn.chezmoi.sh` (HTTPS) | `*.chezmoi.sh` (HTTPS)                     | `vault`, `pocket-id`, Grafana (`o11y`) |
| `lungmen.akn` | `web`, `*.chezmoi.sh`, `*.lab.chezmoi.sh` (HTTPS) | `*.chezmoi.sh`, `*.lab.chezmoi.sh` (HTTPS) | aucune                                 |

Règles de fonctionnement :

- `internal` choisit son pool par `spec.infrastructure.labels: io.cilium/lb-ipam-pool: internal`. Le pool `external`
  exclut ce label.
- Une application attache **une seule HTTPRoute aux deux Gateways** (même nom d'hôte, deux `parentRefs`). Le filtre
  d'external-dns porte sur le label de la Gateway parente, pas sur la route.
- La route `argocd` de `rhodes.akn` n'est attachée qu'à `external` (listener `*.akn.chezmoi.sh`) ; elle n'a donc pas
  d'enregistrement dans la vue `internal`.
- Les VIP sont attribuées par Cilium LB-IPAM à l'intérieur des pools et ne sont pas fixées dans les manifestes. La
  valeur réelle se lit avec `kubectl -n kube-system get gateway`.

## Les deux autorités DNS

| Vue                         | Autorité                                         | Mise à jour par                                                                                              | Clients concernés                                           |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `internal` (talosnet)       | `talosnet-dns` (BIND, `dns.talosnet.chezmoi.sh`) | `external-dns-bind` (RFC2136 + TSIG), `--gateway-label-filter=external-dns.chezmoi.sh/zone in (internal)`    | Tout client utilisant le DNS fourni par le DHCP talosnet    |
| `external` (LAN domestique) | UniFi (UDM Pro, API via webhook)                 | `external-dns-unifi` (provider webhook), `--gateway-label-filter=external-dns.chezmoi.sh/zone in (external)` | Clients du LAN domestique et tout nœud n'utilisant pas BIND |

Les adresses de `talosnet-dns` et de l'UDM Pro sont dans [IPAM Reference](IPAM-Reference.md).

### Paramètres des instances external-dns

Sources : `projects/<cluster>/src/infrastructure/kubernetes/external-dns/{bind,unifi}.helmvalues/default.yaml`.

| Paramètre              | `external-dns-bind`                                                 | `external-dns-unifi`                                                                      |
| ---------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Provider               | `rfc2136` (natif, secret TSIG injecté par variable d'environnement) | `webhook` (`ghcr.io/kashalls/external-dns-unifi-webhook`)                                 |
| Politique              | `sync`                                                              | `sync`                                                                                    |
| Types d'enregistrement | `A`, `TXT`                                                          | `A`, `TXT`                                                                                |
| `txtOwnerId`           | `external-dns.rhodesakn`, `external-dns.lungmenakn`                 | `external-dns.rhodesakn`, `external-dns.lungmenakn`                                       |
| Secret OpenBao         | secret TSIG (SOPS, `external-dns/sops/bind.secret.yaml`)            | `rhodes.akn/external-dns/third-parties/unifi`, `lungmen.akn/external-dns/providers/unifi` |

### Contenu de BIND

La zone `chezmoi.sh` de `talosnet-dns` contient des enregistrements statiques réservés à talosnet (`ns`, `dns.talosnet`,
`pve-01.pve`, `omni`, `api.omni`, `oci`, `data.o11y`, `s3`, `nas`) et les enregistrements `A` et `TXT` écrits
dynamiquement par external-dns. Tout le reste est transmis à des résolveurs amont (UniFi, puis deux résolveurs publics).
Les enregistrements statiques ne sont créés qu'au premier démarrage du volume. Sources :
`projects/chezmoi.sh/src/infrastructure/proxmox/lxc/talosnet-dns/modules/bind.nix` et le `README.md` du même dossier.

Les clients talosnet reçoivent `talosnet-dns` comme DNS par les options DHCP talosnet. Les hôtes hors talosnet (par
exemple les LXC du VLAN 5) ne voient jamais les réponses de BIND.

## Écart connu : external-dns-unifi

L'issue [#1224](https://github.com/chezmoidotsh/arcane/issues/1224) signale que `external-dns-unifi` aurait été retiré
pendant la migration `amiya.akn` vers `rhodes.akn` : plus aucun enregistrement `*.chezmoi.sh` ne serait publié dans
UniFi, et la vue LAN domestique dériverait. Le symptôme observé était `o11y.chezmoi.sh` résolu vers l'ancienne adresse
du LXC o11y côté UniFi, alors que BIND répondait correctement.

Ce que le dépôt montre :

- `external-dns-unifi` est toujours déclaré dans `src/` et rendu dans `dist/`
  (`apps.v1.Deployment.external-dns-unifi.yaml`) pour les deux clusters.
- Le document de migration [amiya.akn vers rhodes.akn](../archives/MIGR-20260729-00-Migrer-Amiya-vers-Rhodes.md) décrit
  `external-dns-unifi` de `rhodes.akn` comme actif.

Ce qui n'est pas établi : l'exécution réelle des Pods, l'authentification auprès d'UniFi, l'écriture des enregistrements
et la cause de l'enregistrement périmé. Le chemin de la clé OpenBao diffère entre les deux clusters (`third-parties`
contre `providers`), ce qui est une piste à vérifier. Réparer, remplacer ou gérer à la main les enregistrements UniFi
reste une décision ouverte.

## Diagnostic : quel DNS répond pour un nom d'hôte

| Étape | Vérification                          | Commande                                                                                       | Interprétation                                                                                                                                      |
| ----- | ------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | DNS réellement utilisé par le client  | `cat /etc/resolv.conf` (nœud Talos : `talosctl -n <nœud> read /etc/resolv.conf`)               | L'adresse de `talosnet-dns` désigne BIND ; toute autre adresse désigne UniFi ou un résolveur public                                                 |
| 2     | Vue talosnet                          | `dig @<adresse de talosnet-dns> <hôte>`                                                        | Doit renvoyer la VIP de la Gateway `internal`                                                                                                       |
| 3     | Vue LAN domestique                    | `dig @<adresse de l'UDM Pro> <hôte>`                                                           | Doit renvoyer la VIP de la Gateway `external` ; une adresse différente ou ancienne correspond à l'[écart connu](#écart-connu--external-dns-unifi)   |
| 4     | VIP réelles et attachement des routes | `kubectl -n kube-system get gateway external internal`, puis `kubectl get httproute -A`        | La route doit être attachée à la Gateway attendue                                                                                                   |
| 5     | external-dns écrit-il ?               | `kubectl -n external-dns-system logs deploy/external-dns-unifi` (ou `-bind`), `dig TXT <hôte>` | Le `txtOwnerId` du TXT indique l'instance propriétaire du nom                                                                                       |
| 6     | Périmé ou absent                      | Comparer les étapes 2 et 3                                                                     | Réponse périmée côté UniFi avec BIND sain : écart connu ; réponse absente côté BIND : `external-dns-bind` ou le label `zone=internal` de la Gateway |

## Historique

- _2026-10-11_ : migration vers le standard de documentation (page de référence, en français). Vérifications contre le
  dépôt :
  - Les Gateways sont dans `kube-system` (`metadata.namespace: kube-system` dans les quatre fichiers
    `{external,internal}.gateway.yaml`, et dans les `parentRefs` des HTTPRoute). `AGENTS.md` indique `in-gateway-system`
    et `projects/*/src/infrastructure/kubernetes/in-gateway/` : ce dossier n'existe pas dans l'arbre. L'écart est dans
    `AGENTS.md`, pas dans cette page.
  - Vérifié : deux Gateways Cilium par cluster, `external-dns` avec les providers `bind` (rfc2136) et `unifi` (webhook).
  - Vérifié : seules les routes `vault`, `pocket-id` et Grafana de `rhodes.akn` sont attachées à `internal` ; aucune
    route de `lungmen.akn` ne l'est. La route `argocd` n'est attachée qu'à `external`.
  - Ajouté : listeners de chaque Gateway (`*.akn.chezmoi.sh` côté `rhodes.akn`, `*.lab.chezmoi.sh` côté `lungmen.akn`),
    absents de l'ancienne version.
  - Retiré : les valeurs d'adressage (pools, VIP, adresses DNS), désormais dans [IPAM Reference](IPAM-Reference.md). Les
    VIP citées par l'issue ne sont pas vérifiables depuis le dépôt.
  - Non revérifié : l'état réel des clusters et de l'écart `external-dns-unifi` (issue #1224).

## Pour aller plus loin

- [IPAM Reference](IPAM-Reference.md) : pools de Load Balancer, adresses de `talosnet-dns` et de l'UDM Pro.
- [Réseau Reference](Reseau-Reference.md) : topologie et vue d'ensemble du réseau.
- [ADR-014 Topologie réseau](../decisions/ADR-014-Topologie-Reseau.md) : justification du découpage réseau (double NIC
  et zone SDN `simple`).
- [talosnet-dns](../../projects/chezmoi.sh/src/infrastructure/proxmox/lxc/talosnet-dns/README.md) : construction et mise
  à jour du LXC BIND.
