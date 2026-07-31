# Homelab IPAM

Single source of truth for all IP addressing: VLANs, the SDN VNet, Kubernetes CIDRs, and the firewall rules that bound
what each range can reach. Update this document before adding new clusters, services, or static IPs. For the physical
topology and a diagram, see [`README.md`](README.md).

## Table of Contents

- [VLANs](#vlans)
  - [VLAN Placement Guide](#vlan-placement-guide)
  - [FAQ](#faq)
- [VLAN 5 Address Plan](#vlan-5-address-plan)
  - [Sub-ranges](#sub-ranges)
  - [Static Assignments — Management Zone](#static-assignments--management-zone)
  - [Cilium LoadBalancer Pools](#cilium-loadbalancer-pools)
- [Proxmox SDN — talosnet VNet](#proxmox-sdn--talosnet-vnet)
  - [Internal LoadBalancer Pools (talosnet)](#internal-loadbalancer-pools-talosnet)
- [Kubernetes CIDRs](#kubernetes-cidrs)
  - [Service CIDR — shared across all clusters (ClusterMesh-ready)](#service-cidr--shared-across-all-clusters-clustermesh-ready)
  - [Pod CIDRs — unique per cluster (ClusterMesh prerequisite)](#pod-cidrs--unique-per-cluster-clustermesh-prerequisite)
  - [ClusterMesh prerequisites](#clustermesh-prerequisites)
- [Firewall Rules](#firewall-rules)
  - [UDM Pro — Inter-VLAN](#udm-pro--inter-vlan)
  - [Proxmox — Per-LXC](#proxmox--per-lxc-nic-level)

---

## VLANs

| VLAN | Name       | Subnet            | DHCP                        | Purpose                         | Notes                                        |
| ---- | ---------- | ----------------- | --------------------------- | ------------------------------- | -------------------------------------------- |
| 1    | Backbone   | 10.10.10.0/24     | Yes                         | Network devices only            | UDM Pro, switch mgmt; no internet            |
| 2    | Home       | 192.168.10.0/25   | Yes, no static reservations | Home devices                    |                                              |
| 3    | Home Guest | 192.168.10.128/25 | Yes                         | Guest WiFi                      | Internet only; full L2 isolation             |
| 4    | IoT        | 192.168.3.0/25    | Yes (HASS static, planned)  | IoT devices                     | No internet (HASS excepted); IoT → HASS only |
| 5    | Homelab    | 10.0.0.0/22       | Disabled — all static       | PVE, LXCs, Talos LB, SDN tunnel | See address plan below                       |

### VLAN Placement Guide

| Device type                                     | VLAN                                              |
| ----------------------------------------------- | ------------------------------------------------- |
| Network devices (UDM Pro, switches, APs)        | 1 — Backbone                                      |
| Personal devices (laptops, phones, tablets)     | 2 — Home                                          |
| NAS                                             | 5 — Homelab                                       |
| Guest devices, untrusted hardware               | 3 — Home Guest                                    |
| IoT devices, smart home sensors, cameras, bulbs | 4 — IoT                                           |
| Home Assistant                                  | 4 — IoT (with internet + VLAN 2 access exception) |
| Proxmox host, LXC containers                    | 5 — Homelab                                       |
| Talos VMs (eth1 node IPs)                       | SDN VNet (internal, not physical VLAN)            |
| Kubernetes services (Cilium LB IPs)             | 5 — Homelab (10.0.0.64/26)                        |

**Design rationale:**

- **Backbone (VLAN 1)** — hard separation of network management; a compromised home device cannot reach switch/AP
  configuration interfaces.
- **Home (VLAN 2)** — standard residential network. Separate from IoT and infra; a misconfigured device cannot directly
  access the homelab.
- **Guest (VLAN 3)** — untrusted by definition. Full isolation including from other guest devices.
- **IoT (VLAN 4)** — most IoT devices have weak security. Isolated from home and homelab; only HASS is the integration
  bridge.
- **Homelab (VLAN 5)** — all infrastructure on one VLAN simplifies routing (no VLAN-to-VLAN hops for cluster-to-NAS
  storage). VLAN 2 → VLAN 5 is the only allowed inbound path.

### FAQ

**Q: Where does the NAS go?** VLAN 5 (Homelab). Co-located with the clusters consuming its storage (Immich, Jellyfin,
Paperless) to avoid cross-VLAN mounts. Home devices reach it via the VLAN 2 → VLAN 5 rule.

**Q: Can SMB shares on VLAN 5 be discovered from VLAN 2?** SMB discovery relies on mDNS/NetBIOS which do not cross VLANs
by default. Options (in order of preference):

1. **UDM Pro mDNS Repeater** _(recommended)_ — enable the UniFi mDNS/Bonjour relay between VLAN 2 and VLAN 5.
   Synology/TrueNAS advertise SMB via Avahi; the relay reflects announcements to VLAN 2 devices.
2. **Static DNS entry** — add a hostname record for the NAS. Works for all client OSes; no discovery, but always
   reliable.
3. **Dual NIC on NAS** _(fallback)_ — assign the NAS a VLAN 2 IP as well. Keeps SMB traffic on VLAN 2 L2 segment; more
   complex to manage.

> **Windows WSD note:** Windows SMB discovery uses WSD in addition to mDNS. WSD is not relayed by the UDM Pro mDNS
> repeater. Windows clients may need a static DNS entry or a WSD proxy.

**Q: What about IoT devices that need occasional internet access?** VLAN 4 default is no internet. Add per-device
exceptions in the UDM Pro firewall (by MAC or static IP). HASS is the only blanket internet exception configured at the
VLAN level.

---

## VLAN 5 Address Plan

All active addressing is consolidated in `10.0.0.0/24`. The remaining three `/24` blocks are reserved for future use.

### Sub-ranges

| Block           | Range       | Purpose                                                         |
| --------------- | ----------- | --------------------------------------------------------------- |
| `10.0.0.0/26`   | .1 – .62    | PVE host + core LXCs (management zone)                          |
| `10.0.0.64/26`  | .64 – .127  | Cilium LoadBalancer pools (8 clusters × /29, 8 usable IPs each) |
| `10.0.0.128/25` | .129 – .254 | Reserved                                                        |
| `10.0.1.0/24`   | —           | Free / future                                                   |
| `10.0.2.0/24`   | —           | Free / future                                                   |
| `10.0.3.0/24`   | —           | Free / future                                                   |

### Static Assignments — Management Zone

Allocation convention within `10.0.0.0/26`: `.1` gateway, `.10–.19` hypervisor, `.20–.29` system LXCs, `.30–.62` other
devices.

| IP        | Host                            | DNS                                                        | Notes                                                                                                                                                                                                          |
| --------- | ------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10.0.0.1  | Gateway (UDM Pro)               |                                                            |                                                                                                                                                                                                                |
| 10.0.0.10 | pve-01 IPMI                     |                                                            | BMC remote management                                                                                                                                                                                          |
| 10.0.0.11 | pve-01 OS                       | pve-01.pve.chezmoi.sh                                      | Hypervisor management IP                                                                                                                                                                                       |
| 10.0.0.21 | omni LXC                        | omni.chezmoi.sh, api.omni.chezmoi.sh, kube.omni.chezmoi.sh | Omni UI/API SideroLink Machine API, Kubernetes API proxy. Dual-NIC: also `10.128.0.2` on talosnet (`eth1`)                                                                                                     |
| 10.0.0.22 | o11y LXC                        | o11y.chezmoi.sh                                            | Victoria stack — central metrics/logs/traces. Dual-NIC: also `10.128.0.5` on talosnet (`eth1`)                                                                                                                 |
| 10.0.0.23 | oci-registry LXC                | oci.chezmoi.sh                                             | Zot — pull-through OCI cache + first-party images. Dual-NIC: also `10.128.0.4` on talosnet (`eth1`)                                                                                                            |
| 10.0.0.24 | pve-exporter LXC                |                                                            | Single-NIC (VLAN 5 only)                                                                                                                                                                                       |
| 10.0.0.25 | omni-infra-provider-proxmox LXC |                                                            | Single-NIC (VLAN 5 only)                                                                                                                                                                                       |
| 10.0.0.26 | talosnet-dns LXC                | ns.chezmoi.sh                                              | BIND — see [Internal LoadBalancer Pools (talosnet)](#internal-loadbalancer-pools-talosnet). Dual-NIC: `10.128.0.3` on talosnet (`eth1`) is where it actually serves DNS; the VLAN 5 address is unused for that |
| 10.0.0.30 | NAS                             | nas.chezmoi.sh                                             | Primary interface. Also on talosnet (`10.128.0.6`)                                                                                                                                                             |
| 10.0.0.31 | NAS (applications)              |                                                            | Dedicated IP for the applications (Garage, etc.)                                                                                                                                                               |

> `*.omni.chezmoi.sh` is a wildcard record pointing to the public Pangolin gateway (`195.201.114.83`, kazimierz.akn) —
> it resolves outside VLAN 5 entirely and isn't tied to any IP in this table.

> **DNS resolvers.** VLAN 5 has no internal DNS relay documented here — the UDM Pro gateway (`10.0.0.1`) does not answer
> DNS queries from this VLAN. The static-IP LXCs above use public resolvers (`1.1.1.1`, `9.9.9.9`) via
> `catalog.staticNetwork.nameservers` (`catalog/nix/modules/lxc-static-network/`). Revisit if an internal resolver is
> ever stood up.

### Cilium LoadBalancer Pools

Each cluster runs two `CiliumLoadBalancerIPPool`s, named `external` and `internal`. `external` is the catch-all default
(any Service/Gateway that doesn't opt into `internal` lands here) — it must explicitly exclude the `internal` label
(`io.cilium/lb-ipam-pool NotIn [internal]`), or it competes with `internal` for the same Services, since Cilium's
LB-IPAM tie-break isn't label-aware. See `projects/rhodes.akn/src/infrastructure/kubernetes/cilium/external.ippool.yaml`
for the reference implementation. This section covers the `external` pools (VLAN 5, reachable from the home network);
see [Internal LoadBalancer Pools (talosnet)](#internal-loadbalancer-pools-talosnet) for `internal`.

Each cluster gets a `/29` block, all 8 addresses usable — these are flat L2-announced address pools, not routed subnets,
so unlike a real `/29` the block's own network/broadcast addresses aren't reserved. The `/26` holds exactly 8 × `/29`.
Order follows cluster creation sequence; sandbox takes the last slot.

| Block           | Usable IPs | Cluster                     |
| --------------- | ---------- | --------------------------- |
| `10.0.0.64/29`  | .64–.71    | rhodes.akn                  |
| `10.0.0.72/29`  | .72–.79    | lungmen.akn                 |
| `10.0.0.80/29`  | .80–.87    | —                           |
| `10.0.0.88/29`  | .88–.95    | —                           |
| `10.0.0.96/29`  | .96–.103   | —                           |
| `10.0.0.104/29` | .104–.111  | —                           |
| `10.0.0.112/29` | .112–.119  | —                           |
| `10.0.0.120/29` | .120–.127  | sandbox / last prod cluster |

---

## Proxmox SDN — talosnet VNet

Internal node-to-node network for Talos clusters, provisioned in the `pvenet` SDN zone. Not routed on physical VLANs.
**Zone type is `simple`, not `vxlan`** — PVE 9 requires `--peers`/`--fabric` to create a `vxlan` zone, which needs a
second Proxmox node; on today's single-node homelab that's impossible, so `simple` is used instead. Codified in Pulumi
at `projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts` (`pvenetZone`/`talosnetVnet`/`talosnetSubnet`),
which superseded the manual `pvesh`/`pveum` recipe in
[INF-20260627-00](../procedures/infrastructure/INF-20260627-00.proxmox-sdn-setup.md) — that procedure still has the full
design rationale and the migration path once a second node joins.

**Parent range:** `10.128.0.0/16` — no conflict with any existing subnet. A single `/24` is currently allocated to the
shared Talos VNet (see table below).

`talosnet` (VNet names are capped at 8 alphanumeric characters on PVE 9, hence not `vnet-talos`) is configured with:

- **Gateway:** `10.128.0.1` (PVE node acts as L3 router)
- **DHCP:** dnsmasq with stable leases per MAC (node IPs survive reboots), range `.10`–`.250`
- **DNS:** `10.128.0.3` (talosnet-dns/BIND, also reachable as `dns.talosnet.chezmoi.sh` from anything that can already
  resolve names — not from `dhcpDnsServer` itself, which is a raw DHCP option 6 value and can't be a hostname) handed
  out to nodes via DHCP (`dhcpDnsServer` on the Pulumi subnet) — this is what lets talosnet clients resolve
  split-horizon names, see [Internal LoadBalancer Pools (talosnet)](#internal-loadbalancer-pools-talosnet)
- **SNAT:** enabled so nodes can reach `pve-01.pve.chezmoi.sh:8006` (required for proxmox-csi-plugin)
- **MTU:** not set on the SDN zone/VNet itself (`SdnZoneSimple.mtu` is left unset in `sdn.ts`, so PVE's default applies
  there) — `1450` is instead set directly on each Talos node's `eth1` interface via the Omni cluster templates
  (`catalog/omni/clustertemplates/base.yaml`), pre-sized for a future `vxlan` migration (50-byte encapsulation overhead)
  even though today's `simple` zone doesn't need it

| VNet       | Subnet          | Block                           | Purpose                                           |
| ---------- | --------------- | ------------------------------- | ------------------------------------------------- |
| `talosnet` | `10.128.0.0/24` | `.1` gateway, `.10`–`.250` DHCP | Shared node traffic (eth1) for all Talos clusters |

> **Why a single shared VNet?** Omni `MachineClass` resources are shared, non-kustomizable COSI objects, and
> cluster-template `patches[]` can only apply Talos machine-config patches — neither can override a `MachineClass`'s
> `providerdata` (where `additional_nics[].bridge` lives) per cluster. A per-cluster VNet would need a per-cluster
> `MachineClass`, so all Talos clusters share `talosnet` instead. External LoadBalancer traffic stays isolated
> per-cluster via the VLAN 5 LB pools above, independently of this VNet. See
> [ADR-014](../decisions/014-network-topology.md) for the full rationale.

> **ACL:** `SDN.Use` is granted to `omni@pve` on the VNet so the Omni infra provider can attach VMs to it — codified as
> `omniSdnTalosnetAcl` in `stack/proxmox/sdn.ts` (equivalent manual command below; `omni@pve` also needs the same role
> on `localnetwork/vmbr1` for the VLAN5/eth0 plane, granted in `stack/proxmox/access/omni.ts`):
>
> ```sh
> pveum acl modify /sdn/zones/<zone>/<vnet> --users omni@pve --roles PVESDNUser
> ```

### Internal LoadBalancer Pools (talosnet)

`talosnet` has no route from any physical VLAN — it's only reachable from other Talos nodes or hosts explicitly attached
to the SDN VNet. Each cluster can expose a second `CiliumLoadBalancerIPPool`, named `internal`, that is genuinely
internal-only (unlike the `external` pools above, which are reachable from the home network via the VLAN 2 → VLAN 5
rule). `internal` carries a `serviceSelector` so it's opt-in only — see
[Cilium LoadBalancer Pools](#cilium-loadbalancer-pools) above for why `external` also needs to exclude it.

Split-horizon DNS, not a separate hostname, is what makes this useful: talosnet-dns (BIND, `10.128.0.3`) lets
external-dns (RFC2136) dynamically publish the same `*.chezmoi.sh` name a cluster already has externally (e.g.
`vault.chezmoi.sh`), pointed at the internal IP instead — see `talosnet-dns/modules/bind.nix`.

Free space outside the `.1` gateway and the `.10`–`.250` DHCP range: `.2`–`.9` (8 IPs, reserved) and `.240`–`.254` (15
IPs, `.255` is the `/24` broadcast address). `internal` pools get a 2-IP block each, same cluster order as the
`external` pools — sandbox excluded, it doesn't need an internal-only path.

| Block                 | Usable IPs | Cluster                          |
| --------------------- | ---------- | -------------------------------- |
| `10.128.0.240`–`.241` | 2          | rhodes.akn                       |
| `10.128.0.242`–`.243` | 2          | lungmen.akn                      |
| `10.128.0.244`–`.245` | 2          | —                                |
| `10.128.0.246`–`.247` | 2          | —                                |
| `10.128.0.248`–`.249` | 2          | —                                |
| `10.128.0.250`–`.251` | 2          | —                                |
| `10.128.0.252`–`.253` | 2          | —                                |
| `10.128.0.254`        | 1          | — spare                          |
| `10.128.0.2`–`.9`     | 8          | — reserved (outside `.240-.254`) |

Sandbox has no row: it's a throwaway cluster with no internal-only workload, so it doesn't get an `internal` pool.

---

## Kubernetes CIDRs

Allocated from `172.16.0.0/12` exclusively — no `10.x` or `192.168.x` ranges to avoid any conflict with physical VLANs,
SDN subnets, or LB pools.

**Address space structure:**

- `172.16.0.0/12` contains exactly 8 × `/15` blocks
- Last block (`172.30.0.0/15`) is the Kubernetes space, split into two `/16`:
  - `172.30.0.0/16` — pod CIDRs (8 clusters × `/19` = 8,192 IPs each; unique per cluster)
  - `172.31.0.0/16` — reserved; first `/19` (`172.31.0.0/19`) is the shared service CIDR

### Service CIDR — shared across all clusters (ClusterMesh-ready)

All clusters share a single service CIDR: **`172.31.0.0/19`** — kube-dns at `172.31.0.10` everywhere. This is
intentional and **ClusterMesh-compatible**: Cilium performs service load-balancing at the source node via eBPF, so the
ClusterIP is rewritten to a backend pod IP _before_ the packet leaves the node. ClusterIPs never traverse the
inter-cluster link, making overlapping service CIDRs between clusters transparent. The rest of `172.31.0.0/16` is
reserved.

### Pod CIDRs — unique per cluster (ClusterMesh prerequisite)

Pod CIDRs MUST be non-overlapping between clusters — this is a hard ClusterMesh requirement. Each cluster allocates from
its own `/19` within `172.30.0.0/16`.

> **Sizing note:** A `/16` fits exactly 8 × `/19`. 8,192 pod IPs per cluster is well above any homelab requirement.

| Cluster     | cluster.name   | cluster.id | Pod CIDR          | Service CIDR    | kube-dns    |
| ----------- | -------------- | ---------- | ----------------- | --------------- | ----------- |
| rhodes.akn  | rhodes-akn     | 1          | `172.30.0.0/19`   | `172.31.0.0/19` | 172.31.0.10 |
| lungmen.akn | lungmen-akn    | 2          | `172.30.32.0/19`  | `172.31.0.0/19` | 172.31.0.10 |
| cluster 3   | _(unassigned)_ | 3          | `172.30.64.0/19`  | `172.31.0.0/19` | 172.31.0.10 |
| cluster 4   | _(unassigned)_ | 4          | `172.30.96.0/19`  | `172.31.0.0/19` | 172.31.0.10 |
| cluster 5   | _(unassigned)_ | 5          | `172.30.128.0/19` | `172.31.0.0/19` | 172.31.0.10 |
| cluster 6   | _(unassigned)_ | 6          | `172.30.160.0/19` | `172.31.0.0/19` | 172.31.0.10 |
| cluster 7   | _(unassigned)_ | 7          | `172.30.192.0/19` | `172.31.0.0/19` | 172.31.0.10 |
| sandbox     | sandbox        | 8          | `172.30.224.0/19` | `172.31.0.0/19` | 172.31.0.10 |

### ClusterMesh prerequisites

<!-- markdownlint-disable MD060 -->

| Prerequisite                                | Status | Notes                                                                                                 |
| ------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Pod CIDRs unique per cluster                | ✅     | 8 × /19 from `172.30.0.0/16`, non-overlapping                                                         |
| Shared service CIDR across clusters         | ✅     | `172.31.0.0/19` — ClusterMesh-compatible (service LB at source via eBPF)                              |
| `ipv4NativeRoutingCIDR` = pod supernet      | ✅     | `172.30.0.0/16` — Cilium skips SNAT for inter-cluster pod traffic                                     |
| `routingMode=native` + kubeProxyReplacement | ✅     | Native routing, no overlay, kube-proxy disabled                                                       |
| `cluster.name` unique per cluster           | ⏳     | Allocated above. Must be set in Cilium config per cluster (NOT in the shared install manifest).       |
| `cluster.id` unique per cluster (1–255)     | ⏳     | Allocated above. Encoded into security identities — set at install time, effectively immutable.       |
| `clustermesh-apiserver` reachable           | ⏳     | Control plane exposure via LoadBalancer (TCP 2379). Mechanism TBD (SDN `talosnet` or VLAN 5 LB pool). |
| Shared `cilium-ca` across clusters          | ⏳     | Required for cross-cluster mTLS identity verification.                                                |

<!-- markdownlint-enable MD060 -->

> **`cluster.name` / `cluster.id` caveat:** The shared Cilium install manifest
> (`catalog/talos/manifests/cilium/1.19.5-native.yaml`) is referenced via URL by all cluster templates and cannot set
> per-cluster values. These must be applied post-install (e.g., `cilium config set cluster-name rhodes-akn` +
> `cilium config set cluster-id 1`, or a Helm values overlay managed by ArgoCD). The exact mechanism will be decided
> when ClusterMesh is enabled.

**Cilium `ipv4NativeRoutingCIDR`:** Set to `172.30.0.0/16` (the pod CIDR supernet) in every cluster's Cilium install
manifest. This tells Cilium not to SNAT traffic destined to any pod IP in the supernet — essential for inter-cluster
pod-to-pod connectivity in ClusterMesh. The service CIDR is deliberately excluded: services are resolved by eBPF at the
source node, not routed natively. See the comment in `catalog/talos/manifests/cilium/1.19.5-native.yaml`.

**Conflict check — no overlap with any existing range:**

| Existing range    | Source            |
| ----------------- | ----------------- |
| 10.0.0.0/22       | VLAN 5 (Homelab)  |
| 10.0.0.64/26      | Cilium LB pools   |
| 10.10.10.0/24     | VLAN 1 (Backbone) |
| 10.128.0.0/16     | SDN (`talosnet`)  |
| 192.168.10.0/25   | VLAN 2 (Home)     |
| 192.168.10.128/25 | VLAN 3 (Guest)    |
| 192.168.3.0/25    | VLAN 4 (IoT)      |

---

## Firewall Rules

### UDM Pro — Inter-VLAN

All unlisted inter-VLAN paths are implicitly denied. Rules are VLAN-level only (no per-port rules at the UDM Pro layer).

| VLAN           | Internet            | Inter-VLAN            | Notes                                                                                                   |
| -------------- | ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| 1 — Backbone   | No                  | Management only       | Network devices only; no internet required                                                              |
| 2 — Home       | Yes                 | → VLAN 5 (Homelab)    | Per-device internet isolation possible (e.g. TV in guest mode)                                          |
| 3 — Home Guest | Yes                 | None — full isolation | Devices cannot reach each other or any local VLAN                                                       |
| 4 — IoT        | No (HASS exception) | → HASS only           | No internet by default; HASS has internet access; VLAN 2 → HASS allowed; per-device exceptions possible |
| 5 — Homelab    | Yes                 | None outbound to home | VLAN 2 can reach VLAN 5; VLAN 5 does not initiate to VLAN 2                                             |

### Proxmox — Per-LXC (NIC-level)

Policy: **default-drop inbound**. Rules are defined by protocol/port. No per-host IP whitelisting — VLAN/subnet
restrictions are used when the source is stable (e.g. pve-exporter limited to VLAN 5 only). Avoids per-IP maintenance
burden as IPs may shift during rebuilds.

| LXC                           | Allowed inbound                                                       |
| ----------------------------- | --------------------------------------------------------------------- |
| `pve-exporter`                | TCP 9221 (Prometheus scrape) from VLAN 5 only                         |
| `omni-infra-provider-proxmox` | Proxmox API callback port + Omni Wireguard tunnel (per provider docs) |
| `omni`                        | HTTPS (443), Wireguard (Omni tunnel), admin UI                        |
| `o11y`                        | Prometheus remote-write, Grafana/Loki HTTPS, Vector ingest            |
| `oci-registry`                | HTTPS (registry pull/push)                                            |
| All LXCs                      | Outbound: unrestricted via VLAN 5 gateway                             |

> Exact port lists are finalized during deployment. Principle: open the minimum required for the service to function,
> deny everything else inbound.
