# Internal / External Gateway and DNS split

How `*.chezmoi.sh` hostnames resolve depends on **where the client sits**. Two Gateways per cluster, two DNS
authorities, and one of the two update paths has an open gap (see [Known gap](#known-gap-external-dns-unifi)). For
addressing see [`ipam.md`](ipam.md); for the rationale of the network design see
[ADR-014](../decisions/014-network-topology.md).

## The two Gateways

Both rhodes.akn and lungmen.akn declare two Cilium Gateways in `kube-system`
(`projects/<cluster>/src/infrastructure/kubernetes/cilium/{external,internal}.gateway.yaml`):

| Gateway    | Reachable from                         | LB pool (`CiliumLoadBalancerIPPool`)                          | Label `external-dns.chezmoi.sh/zone` |
| ---------- | -------------------------------------- | ------------------------------------------------------------- | ------------------------------------ |
| `external` | Home network (VLAN 2 -> VLAN 5)        | `external`: `10.0.0.64/29` (rhodes), `10.0.0.72/29` (lungmen) | `external`                           |
| `internal` | Talosnet only (Talos nodes, SDN hosts) | `internal`: `10.128.0.240-241` (rhodes), `.242-243` (lungmen) | `internal`                           |

- `internal` opts into its pool through `spec.infrastructure.labels: io.cilium/lb-ipam-pool: internal`; `external` is
  the catch-all pool and excludes that label.
- Apps attach **one HTTPRoute to both Gateways** (same hostname, two `parentRefs`). Today only rhodes.akn routes do
  this: `vault`, `pocket-id` and the `o11y` Grafana. No lungmen.akn route attaches to `internal`.
- The VIPs are allocated by Cilium LB-IPAM from the pools above, they are not pinned in the manifests. The issue quotes
  `10.128.0.240` (internal) and `10.0.0.65` (external) for rhodes.akn: both fall inside the pools, but the exact
  assignment is **not verifiable from the repo**; read it with `kubectl -n kube-system get gateway`.

## The two DNS authorities

| View                      | Authority                                                      | Updated by                                                                                                   | Clients                                       |
| ------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `internal`                | `talosnet-dns` (BIND, `10.128.0.3`, `dns.talosnet.chezmoi.sh`) | `external-dns-bind` (RFC2136 + TSIG), `--gateway-label-filter=external-dns.chezmoi.sh/zone in (internal)`    | Anything using talosnet DHCP DNS              |
| `external` (domestic LAN) | UniFi (UDM Pro, `https://10.10.10.10` in the webhook config)   | `external-dns-unifi` (webhook provider), `--gateway-label-filter=external-dns.chezmoi.sh/zone in (external)` | Home LAN clients, and any node not using BIND |

Details verified in the repo:

- BIND serves the `chezmoi.sh` zone: a few static talosnet-only records (`omni`, `api.omni`, `oci`, `data.o11y`, `nas`,
  `s3`) plus dynamic A/TXT records written by external-dns. It forwards everything else upstream (`10.10.10.10`, then
  `1.1.1.1` / `1.0.0.1`). Source: `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/talosnet-dns/modules/bind.nix`.
- Talosnet clients get `10.128.0.3` as DNS through the talosnet DHCP options (see [`ipam.md`](ipam.md)). Hosts outside
  talosnet (VLAN 5 LXCs use `1.1.1.1` / `9.9.9.9`, see `ipam.md`) never see BIND's answers.
- Each external-dns instance has its own `txtOwnerId` (`external-dns.rhodesakn`, `external-dns.lungmenakn`), policy
  `sync`, record types `A` and `TXT` only.
- Sources: `projects/<cluster>/src/infrastructure/kubernetes/external-dns/{bind,unifi}.helmvalues/default.yaml`.

## Known gap: external-dns-unifi

**Live, unresolved. This document does not fix it.**

Issue [#1224](https://github.com/chezmoidotsh/arcane/issues/1224) reports that `external-dns-unifi` was decommissioned
during the amiya.akn -> rhodes.akn migration (issue 370), so nothing publishes fresh `*.chezmoi.sh` records to UniFi and
the domestic-LAN view drifts: any hostname changed since is silently stale for every client that resolves through UniFi
instead of BIND. The observed symptom was lungmen.akn resolving `o11y.chezmoi.sh` to the o11y LXC's old address while
BIND answered correctly.

What the repo shows, and what it does not:

- **Not confirmed by the repo**: `external-dns-unifi` is still declared and rendered in both clusters
  (`projects/{rhodes,lungmen}.akn/src/infrastructure/kubernetes/external-dns/`, `dist/.../external-dns/` contains
  `Deployment.external-dns-unifi`), and the ArgoCD application has automated sync. The migration doc
  (`docs/migrations/amiya.akn->rhodes.akn.md`) also describes rhodes's `external-dns-unifi` as active.
- **Therefore unverified**: whether the pods actually run, authenticate against UniFi, and write records. The stale
  record is real evidence that something is broken, but the cause (not running, API key invalid, filter not matching,
  records not accepted by UniFi) has not been established. Lead worth checking: the OpenBao key differs between clusters
  (`rhodes.akn/external-dns/third-parties/unifi` vs `lungmen.akn/external-dns/providers/unifi`).
- Whether to repair, replace or manage UniFi records by hand is a separate decision. **A follow-up issue should be filed
  for it** (not done by this PR).

## Diagnostic checklist: which DNS answers for a hostname?

1. **What the client actually uses.** On the machine having the problem: `cat /etc/resolv.conf` (for a Talos node:
   `talosctl -n <node> read /etc/resolv.conf`). `10.128.0.3` means BIND; anything else (UDM Pro, public resolver) means
   the UniFi or public view.
2. **Talosnet view.** `dig @10.128.0.3 <host>` - should return the `internal` Gateway VIP (`10.128.0.24x`).
3. **Domestic LAN view.** `dig @10.10.10.10 <host>` (UniFi) - should return the `external` Gateway VIP (`10.0.0.6x`). A
   different or old address here is the [known gap](#known-gap-external-dns-unifi).
4. **Compare with the cluster.** `kubectl -n kube-system get gateway external internal` for the real VIPs, then
   `kubectl get httproute -A` to confirm the route is attached to the Gateway you expect.
5. **Is external-dns writing?** `kubectl -n external-dns-system get pods` and
   `kubectl -n external-dns-system logs deploy/external-dns-unifi` (or `-bind`) on the cluster that owns the route.
   Check the TXT ownership record (`dig TXT <host>`) to see which `txtOwnerId` owns the name.
6. **Stale vs. missing.** A stale answer from UniFi with a healthy BIND answer is exactly the gap above; a missing
   answer from BIND means `external-dns-bind` or the Gateway `zone=internal` label is the problem.
