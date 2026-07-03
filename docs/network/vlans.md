# Homelab Network Reference

Single source of truth for all IP addressing, VLAN layout, SDN design, and firewall rules.
Update this document before adding new clusters, services, or static IPs.

## Table of Contents

* [Physical Topology](#physical-topology)
* [VLANs](#vlans)
  * [VLAN Placement Guide](#vlan-placement-guide)
  * [FAQ](#faq)
* [VLAN 5 Address Plan](#vlan-5-address-plan)
  * [Sub-ranges](#sub-ranges)
  * [Static Assignments — Management Zone](#static-assignments--management-zone)
  * [Cilium LoadBalancer Pools](#cilium-loadbalancer-pools)
* [Proxmox SDN — VXLAN VNets](#proxmox-sdn--vxlan-vnets)
* [Kubernetes CIDRs](#kubernetes-cidrs)
  * [Service CIDR — shared across all clusters (ClusterMesh-ready)](#service-cidr--shared-across-all-clusters-clustermesh-ready)
  * [Pod CIDRs — unique per cluster (ClusterMesh prerequisite)](#pod-cidrs--unique-per-cluster-clustermesh-prerequisite)
  * [ClusterMesh prerequisites](#clustermesh-prerequisites)
* [Firewall Rules](#firewall-rules)
  * [UDM Pro — Inter-VLAN](#udm-pro--inter-vlan)
  * [Proxmox — Per-LXC](#proxmox--per-lxc-nic-level)

***

## Physical Topology

```text
Internet
    │
[UDM Pro] ─────────────────────────────── [pve-01]
    │         NIC 1: VLAN trunk (vmbr1)        │
    │         NIC 2: VLAN 5 mgmt (vmbr0)  vmbr0 (management — VLAN 5, 10.0.0.11)
    │                                      vmbr1 (VLAN-aware trunk → VMs and LXCs)
    └── WiFi AP
```

**pve-01** connects directly to the UDM Pro via 2 physical NICs (no intermediate switch):

* `vmbr0` — Management bridge on NIC 2; VLAN 5 access port (`10.0.0.11` static)
* `vmbr1` — Guest bridge on NIC 1; VLAN trunk, carries all VLANs to VM/LXC ports

***

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

* **Backbone (VLAN 1)** — hard separation of network management; a compromised home device cannot reach switch/AP configuration interfaces.
* **Home (VLAN 2)** — standard residential network. Separate from IoT and infra; a misconfigured device cannot directly access the homelab.
* **Guest (VLAN 3)** — untrusted by definition. Full isolation including from other guest devices.
* **IoT (VLAN 4)** — most IoT devices have weak security. Isolated from home and homelab; only HASS is the integration bridge.
* **Homelab (VLAN 5)** — all infrastructure on one VLAN simplifies routing (no VLAN-to-VLAN hops for cluster-to-NAS storage). VLAN 2 → VLAN 5 is the only allowed inbound path.

### FAQ

**Q: Where does the NAS go?**
VLAN 5 (Homelab). Co-located with the clusters consuming its storage (Immich, Jellyfin, Paperless) to avoid cross-VLAN mounts. Home devices reach it via the VLAN 2 → VLAN 5 rule.

**Q: Can SMB shares on VLAN 5 be discovered from VLAN 2?**
SMB discovery relies on mDNS/NetBIOS which do not cross VLANs by default. Options (in order of preference):

1. **UDM Pro mDNS Repeater** *(recommended)* — enable the UniFi mDNS/Bonjour relay between VLAN 2 and VLAN 5. Synology/TrueNAS advertise SMB via Avahi; the relay reflects announcements to VLAN 2 devices.
2. **Static DNS entry** — add a hostname record for the NAS. Works for all client OSes; no discovery, but always reliable.
3. **Dual NIC on NAS** *(fallback)* — assign the NAS a VLAN 2 IP as well. Keeps SMB traffic on VLAN 2 L2 segment; more complex to manage.

> **Windows WSD note:** Windows SMB discovery uses WSD in addition to mDNS. WSD is not relayed by the UDM Pro mDNS repeater. Windows clients may need a static DNS entry or a WSD proxy.

**Q: What about IoT devices that need occasional internet access?**
VLAN 4 default is no internet. Add per-device exceptions in the UDM Pro firewall (by MAC or static IP). HASS is the only blanket internet exception configured at the VLAN level.

***

## VLAN 5 Address Plan

All active addressing is consolidated in `10.0.0.0/24`. The remaining three `/24` blocks are reserved for future use.

### Sub-ranges

| Block           | Range       | Purpose                                                         |
| --------------- | ----------- | --------------------------------------------------------------- |
| `10.0.0.0/26`   | .1 – .62    | PVE host + core LXCs (management zone)                          |
| `10.0.0.64/26`  | .65 – .126  | Cilium LoadBalancer pools (8 clusters × /29, 6 usable IPs each) |
| `10.0.0.128/25` | .129 – .254 | Reserved                                                        |
| `10.0.1.0/24`   | —           | Free / future                                                   |
| `10.0.2.0/24`   | —           | Free / future                                                   |
| `10.0.3.0/24`   | —           | Free / future                                                   |

### Static Assignments — Management Zone

Allocation convention within `10.0.0.0/26`: `.1` gateway, `.10–.19` hypervisor, `.20–.29` system LXCs, `.30–.62` other devices.

| IP        | Host               | Notes                                                    |
| --------- | ------------------ | -------------------------------------------------------- |
| 10.0.0.1  | Gateway (UDM Pro)  |                                                          |
| 10.0.0.10 | pve-01 IPMI        | BMC remote management                                    |
| 10.0.0.11 | pve-01 OS          | Hypervisor management IP                                 |
| 10.0.0.21 | omni LXC           |                                                          |
| 10.0.0.22 | o11y LXC           |                                                          |
| 10.0.0.23 | oci-registry LXC   |                                                          |
| 10.0.0.30 | NAS                | Primary interface                                        |
| 10.0.0.31 | NAS (applications) | Dedicated IP for the applications dataset (Garage, etc.) |

> `pve-exporter` and `omni-infra-provider-proxmox` IPs are assigned during deployment — not pre-allocated here.

### Cilium LoadBalancer Pools

Each cluster gets a `/29` block (6 usable IPs). The `/26` holds exactly 8 × `/29`. Order follows cluster creation sequence; sandbox takes the last slot.

| Block           | Usable IPs | Cluster                     |
| --------------- | ---------- | --------------------------- |
| `10.0.0.64/29`  | .65–.70    | rhodes.akn                  |
| `10.0.0.72/29`  | .73–.78    | lungmen.akn                 |
| `10.0.0.80/29`  | .81–.86    | —                           |
| `10.0.0.88/29`  | .89–.94    | —                           |
| `10.0.0.96/29`  | .97–.102   | —                           |
| `10.0.0.104/29` | .105–.110  | —                           |
| `10.0.0.112/29` | .113–.118  | —                           |
| `10.0.0.120/29` | .121–.126  | sandbox / last prod cluster |

***

## Proxmox SDN — VXLAN VNets

Internal node-to-node network for Talos clusters. Not routed on physical VLANs — VXLAN-encapsulated over the PVE management network.

**Parent range:** `10.128.0.0/16` — no conflict with any existing subnet. A single `/24` is
currently allocated to the shared Talos VNet (see table below).

`vnet-talos` is configured with:

* **Gateway:** `10.128.0.1` (PVE node acts as L3 router)
* **DHCP:** dnsmasq with stable leases per MAC (node IPs survive reboots), range `.10`–`.250`
* **SNAT:** enabled so nodes can reach `pve-01.pve.chezmoi.sh:8006` (required for proxmox-csi-plugin)
* **MTU:** 1450 (standard 1500 minus 50-byte VXLAN header)

| VNet         | Subnet          | Block                           | Purpose                                           |
| ------------ | --------------- | ------------------------------- | ------------------------------------------------- |
| `vnet-talos` | `10.128.0.0/24` | `.1` gateway, `.10`–`.250` DHCP | Shared node traffic (eth1) for all Talos clusters |

> **Why a single shared VNet?** The original design allocated one VNet per cluster
> (`vnet-rhodes`, `vnet-lungmen`, `vnet-sandbox`). Implementation of
> [#1038](https://github.com/chezmoidotsh/arcane/issues/1038) uncovered an Omni constraint:
> cluster-template `patches[]` are Talos machine-config patches only and cannot override a
> `MachineClass`'s `providerdata` (where `additional_nics[].bridge` lives), and
> MachineClasses are non-kustomizable shared COSI resources. Per-cluster VNets would force
> one MachineClass set per cluster, so all Talos clusters now share `vnet-talos`.
> Per-cluster isolation of *external* LoadBalancer traffic is unaffected — it is provided by
> the per-cluster VLAN 5 LB pools, not by the SDN VNet. See
> [ADR-014 (Revision 2026-06-27)](../decisions/014-network-topology.md) for the full
> rationale and trade-offs.

> **ACL:** `SDN.Use` must be granted to `omni@pve` on each VNet before the Omni infra provider can attach VMs to it:
>
> ```sh
> pveum acl modify /sdn/zones/<zone>/<vnet> --users omni@pve --roles PVESDNUser
> ```

***

## Kubernetes CIDRs

Allocated from `172.16.0.0/12` exclusively — no `10.x` or `192.168.x` ranges to avoid any conflict with physical VLANs, SDN subnets, or LB pools.

**Address space structure:**

* `172.16.0.0/12` contains exactly 8 × `/15` blocks
* Last block (`172.30.0.0/15`) is the Kubernetes space, split into two `/16`:
  * `172.30.0.0/16` — pod CIDRs (8 clusters × `/19` = 8,192 IPs each; unique per cluster)
  * `172.31.0.0/16` — reserved; first `/19` (`172.31.0.0/19`) is the shared service CIDR

### Service CIDR — shared across all clusters (ClusterMesh-ready)

All clusters share a single service CIDR: **`172.31.0.0/19`** — kube-dns at `172.31.0.10`
everywhere. This is intentional and **ClusterMesh-compatible**: Cilium performs service
load-balancing at the source node via eBPF, so the ClusterIP is rewritten to a backend pod
IP *before* the packet leaves the node. ClusterIPs never traverse the inter-cluster link,
making overlapping service CIDRs between clusters transparent.

> **Previous design (pre-2026-06-29):** Each cluster had its own `/19` service CIDR carved
> from `172.31.0.0/16`. Unified to a single shared CIDR for ClusterMesh readiness and
> simpler cluster templates. The rest of `172.31.0.0/16` is reserved.

### Pod CIDRs — unique per cluster (ClusterMesh prerequisite)

Pod CIDRs MUST be non-overlapping between clusters — this is a hard ClusterMesh requirement.
Each cluster allocates from its own `/19` within `172.30.0.0/16`.

> **Sizing note:** A `/16` fits exactly 8 × `/19`. 8,192 pod IPs per cluster is well above
> any homelab requirement.

| Cluster     | cluster.name   | cluster.id | Pod CIDR          | Service CIDR    | kube-dns    |
| ----------- | -------------- | ---------- | ----------------- | --------------- | ----------- |
| rhodes.akn  | rhodes-akn     | 1          | `172.30.0.0/19`   | `172.31.0.0/19` | 172.31.0.10 |
| lungmen.akn | lungmen-akn    | 2          | `172.30.32.0/19`  | `172.31.0.0/19` | 172.31.0.10 |
| cluster 3   | *(unassigned)* | 3          | `172.30.64.0/19`  | `172.31.0.0/19` | 172.31.0.10 |
| cluster 4   | *(unassigned)* | 4          | `172.30.96.0/19`  | `172.31.0.0/19` | 172.31.0.10 |
| cluster 5   | *(unassigned)* | 5          | `172.30.128.0/19` | `172.31.0.0/19` | 172.31.0.10 |
| cluster 6   | *(unassigned)* | 6          | `172.30.160.0/19` | `172.31.0.0/19` | 172.31.0.10 |
| cluster 7   | *(unassigned)* | 7          | `172.30.192.0/19` | `172.31.0.0/19` | 172.31.0.10 |
| sandbox     | sandbox        | 8          | `172.30.224.0/19` | `172.31.0.0/19` | 172.31.0.10 |

### ClusterMesh prerequisites

<!-- markdownlint-disable MD060 -->

| Prerequisite                                | Status | Notes                                                                                                   |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| Pod CIDRs unique per cluster                | ✅      | 8 × /19 from `172.30.0.0/16`, non-overlapping                                                           |
| Shared service CIDR across clusters         | ✅      | `172.31.0.0/19` — ClusterMesh-compatible (service LB at source via eBPF)                                |
| `ipv4NativeRoutingCIDR` = pod supernet      | ✅      | `172.30.0.0/16` — Cilium skips SNAT for inter-cluster pod traffic                                       |
| `routingMode=native` + kubeProxyReplacement | ✅      | Native routing, no overlay, kube-proxy disabled                                                         |
| `cluster.name` unique per cluster           | ⏳      | Allocated above. Must be set in Cilium config per cluster (NOT in the shared install manifest).         |
| `cluster.id` unique per cluster (1–255)     | ⏳      | Allocated above. Encoded into security identities — set at install time, effectively immutable.         |
| `clustermesh-apiserver` reachable           | ⏳      | Control plane exposure via LoadBalancer (TCP 2379). Mechanism TBD (SDN `vnet-talos` or VLAN 5 LB pool). |
| Shared `cilium-ca` across clusters          | ⏳      | Required for cross-cluster mTLS identity verification.                                                  |

<!-- markdownlint-enable MD060 -->

> **`cluster.name` / `cluster.id` caveat:** The shared Cilium install manifest
> (`catalog/talos/manifests/cilium/1.19.5-native.yaml`) is referenced via URL by all
> cluster templates and cannot set per-cluster values. These must be applied post-install
> (e.g., `cilium config set cluster-name rhodes-akn` + `cilium config set cluster-id 1`,
> or a Helm values overlay managed by ArgoCD). The exact mechanism will be decided when
> ClusterMesh is enabled.

**Cilium `ipv4NativeRoutingCIDR`:** Set to `172.30.0.0/16` (the pod CIDR supernet) in every
cluster's Cilium install manifest. This tells Cilium not to SNAT traffic destined to any pod
IP in the supernet — essential for inter-cluster pod-to-pod connectivity in ClusterMesh. The
service CIDR is deliberately excluded: services are resolved by eBPF at the source node, not
routed natively. See the comment in `catalog/talos/manifests/cilium/1.19.5-native.yaml`.

**Conflict check — no overlap with any existing range:**

| Existing range    | Source            |
| ----------------- | ----------------- |
| 10.0.0.0/22       | VLAN 5 (Homelab)  |
| 10.0.0.64/26      | Cilium LB pools   |
| 10.10.10.0/24     | VLAN 1 (Backbone) |
| 10.128.0.0/16     | SDN VXLAN         |
| 192.168.10.0/25   | VLAN 2 (Home)     |
| 192.168.10.128/25 | VLAN 3 (Guest)    |
| 192.168.3.0/25    | VLAN 4 (IoT)      |

***

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

Policy: **default-drop inbound**. Rules are defined by protocol/port. No per-host IP whitelisting — VLAN/subnet restrictions are used when the source is stable (e.g. pve-exporter limited to VLAN 5 only). Avoids per-IP maintenance burden as IPs may shift during rebuilds.

| LXC                           | Allowed inbound                                                       |
| ----------------------------- | --------------------------------------------------------------------- |
| `pve-exporter`                | TCP 9221 (Prometheus scrape) from VLAN 5 only                         |
| `omni-infra-provider-proxmox` | Proxmox API callback port + Omni Wireguard tunnel (per provider docs) |
| `omni`                        | HTTPS (443), Wireguard (Omni tunnel), admin UI                        |
| `o11y`                        | Prometheus remote-write, Grafana/Loki HTTPS, Vector ingest            |
| `oci-registry`                | HTTPS (registry pull/push)                                            |
| All LXCs                      | Outbound: unrestricted via VLAN 5 gateway                             |

> Exact port lists are finalized during deployment. Principle: open the minimum required for the service to function, deny everything else inbound.
