---
status: "accepted"
date: 2026-06-27
decision-makers: ["Alexandre"]
assisted-by: ["claude-sonnet-4-6", "glm-5.2"]
informed: []
---

# Homelab network topology: single-VLAN (V1) to dual-NIC + Proxmox SDN VXLAN (V2)

## Table of Contents

* [Context and Problem Statement](#context-and-problem-statement)
* [Decision Drivers](#decision-drivers)
  * [Functional Requirements](#functional-requirements)
  * [Non-Functional Requirements](#non-functional-requirements)
  * [Constraints](#constraints)
* [Considered Options](#considered-options)
  * [Option 1: Single-NIC Talos VMs on VLAN 5 (V1 — initial)](#option-1-single-nic-talos-vms-on-vlan-5-v1--initial)
  * [Option 2: Per-cluster UDM Pro VLANs with single NIC](#option-2-per-cluster-udm-pro-vlans-with-single-nic)
  * [Option 3: Dual-NIC Talos VMs with Proxmox SDN VXLAN (V2 — accepted)](#option-3-dual-nic-talos-vms-with-proxmox-sdn-vxlan-v2--accepted)
* [Decision Outcome](#decision-outcome)
  * [Rationale](#rationale)
* [Consequences](#consequences)
  * [Positive](#positive)
  * [Negative](#negative)
  * [Neutral](#neutral)
* [Decision Evolution](#decision-evolution)
* [References and Related Decisions](#references-and-related-decisions)
* [Changelog](#changelog)

## Context and Problem Statement

The homelab runs on a single Proxmox hypervisor (`pve-01`) connected directly to a UDM Pro
gateway via two physical NICs (no intermediate switch). The UDM Pro manages five VLANs:
Backbone (VLAN 1), Home (VLAN 2),
Home Guest (VLAN 3), IoT (VLAN 4), and Homelab (VLAN 5, `10.0.0.0/22`). The Proxmox
host exposes two bridges to guests: `vmbr0` (PVE management, VLAN 5 only) and `vmbr1`
(VLAN-aware trunk for all guest VMs and LXCs).

When the first Talos cluster (`lungmen.akn`) was provisioned, all VMs were given a single
NIC on `vmbr1` (VLAN 5). This worked for a single cluster: node IPs, kubelet traffic,
etcd, and Cilium L2 LoadBalancer ARP announcements all shared the same L2 segment. With
the exception of Cilium's use of gratuitous ARP for `10.0.0.64/29` (lungmen's LB slice within the `/26` pool), the
traffic remained contained within VLAN 5 and invisible to home devices.

Planning for a second production cluster (`rhodes.akn`) — tracked in [#1038][] — exposed
a structural problem with this design. Under the single-NIC model, every cluster's node
traffic (kubelet, etcd, CNI internal traffic) would share the same VLAN 5 L2 broadcast
domain. A misconfigured workload, a network policy bug, or an accidental ARP flood on
`lungmen.akn` could disrupt `rhodes.akn` node-level connectivity. More critically, a CNI
misconfiguration on one cluster could send traffic that reaches pod CIDRs or kubelet ports
on nodes of a completely different cluster — a L2 bleed with no mitigating barrier.

Additionally, Cilium's L2 announcements (gratuitous ARP, unsolicited ARP replies) need to
remain on the shared VLAN 5 segment so that home devices and the UDM Pro routing table can
learn service IPs. But the node management traffic (kubelet API, etcd peer communication,
internal overlay) does not need to be on that same segment — and mixing them creates noise
and surface area that grows with each new cluster.

The strategic question this ADR answers is: **how do we isolate inter-cluster node traffic
at L2 without requiring UDM Pro configuration changes for each new cluster, while keeping
Cilium L2 LoadBalancer announcements on the shared homelab VLAN where home devices can
reach them?**

## Decision Drivers

### Functional Requirements

* Talos nodes must be able to reach the Proxmox API (`pve-01:8006`) so that
  `proxmox-csi-plugin` can attach and detach volumes correctly.
* Cilium L2 LoadBalancer ARP announcements must remain on VLAN 5 so that the UDM Pro and
  home-network devices can learn Kubernetes service IPs without additional routing config.
* Each cluster's node traffic (kubelet, etcd, inter-node) must be L2-isolated from other
  clusters' node traffic.
* DHCP-assigned node IPs must be stable across reboots (stable leases per MAC).
* Adding a new cluster must not require changes to the UDM Pro or physical cabling.

### Non-Functional Requirements

* **Operational simplicity** — a single maintainer; the network design should be
  understandable and debuggable without specialist networking knowledge.
* **VXLAN overhead is acceptable** — 50-byte header over a 1G link at homelab
  inter-node bandwidth (typically < 100 Mbps) is negligible.
* **Declarative + versioned** — GitOps rules #1 and #2; network topology must be
  captured in code (this document + `docs/network/vlans.md`), not only in GUI state.

### Constraints

* **UDM Pro configuration is GUI-only** — the UniFi Terraform provider is fragile
  against controller updates; every UDM Pro change is a manual operation. Adding a new
  VLAN per cluster would require UDM Pro GUI changes on each provisioning event.
* **Single Proxmox node** — no multi-node SDN topology to consider; all VXLAN traffic
  stays on the same physical host (loopback effectively), so latency is negligible.
* **Proxmox SDN is available** — PVE 8.x ships SDN with VXLAN zone support; no
  additional software is required.

## Considered Options

### Option 1: Single-NIC Talos VMs on VLAN 5 (V1 — initial)

> **Status: SUPERSEDED by Option 3**

Each Talos VM gets a single NIC on `vmbr1`, tagged to VLAN 5. The VM receives a static IP
in the management zone (`10.0.0.0/26`), and all traffic — node management, Cilium overlay,
and L2 announcements — flows over the same L2 segment. This is the configuration that was
in place when `lungmen.akn` was the only cluster.

* `+` Zero additional configuration — no SDN setup, no second NIC, no DHCP server.
* `+` No VXLAN overhead.
* `+` Fully transparent on the network: all traffic visible on VLAN 5 for debugging.
* `-` All clusters share the same L2 broadcast domain; no inter-cluster isolation.
* `-` A CNI misconfiguration on one cluster can reach other clusters' node ports at L2.
* `-` ARP broadcast domain grows linearly with cluster count, increasing noise on VLAN 5.
* `-` Cilium L2 announcements and kubelet/etcd traffic cannot be separated; all go to the
  same interface, increasing the attack surface of node management ports.

### Option 2: Per-cluster UDM Pro VLANs with single NIC

> **Status: REJECTED**

Each cluster gets its own UDM Pro VLAN (e.g., VLAN 10 for `lungmen.akn`, VLAN 11 for
`rhodes.akn`). Talos VMs have a single NIC on the cluster-specific VLAN. Cilium L2
announcements are made on that cluster VLAN and a UDM Pro inter-VLAN rule allows home
devices to reach the LB pool IPs. The UDM Pro routing table maps each Kubernetes service
CIDR to the correct VLAN.

* `+` Full L2 isolation between clusters at the physical VLAN layer — no VXLAN.
* `+` Debuggable with standard VLAN tools; no Proxmox SDN required.
* `-` **Every new cluster requires a UDM Pro GUI change** — a new VLAN, a new DHCP scope,
  and at least one inter-VLAN firewall rule. The UDM Pro has no IaC support.
* `-` Cilium LB announcements on a per-cluster VLAN mean the UDM Pro must have explicit
  routes for each cluster's LB pool to make services reachable from VLAN 2 (Home).
* `-` Each cluster VLAN adds broadcast domain surface visible to the physical switch; more
  VLANs = more trunk configuration.
* `-` Violates the constraint that adding a cluster must not require UDM Pro changes.

### Option 3: Dual-NIC Talos VMs with Proxmox SDN VXLAN (V2 — accepted)

> **Status: ACCEPTED**

Each Talos VM gets two NICs:

* `eth0` → `vmbr1` (VLAN 5 trunk, no node IP assigned) — Cilium L2Announcement ARP
  responses only; the VM responds to ARP for LB pool IPs but carries no kubelet traffic.
* `eth1` → shared SDN VNet `vnet-talos` (VXLAN-encapsulated, DHCP with stable leases per
  MAC) — all node management traffic: kubelet API, etcd, inter-node pod overlay.

A single Proxmox SDN VXLAN zone backs one shared VNet, `vnet-talos` (`10.128.0.0/24`), used
by **all** Talos/Omni clusters. SNAT on the VNet gateway (`10.128.0.1`, PVE acting as L3
router) lets nodes reach `pve-01:8006` (required for `proxmox-csi-plugin`). The UDM Pro
needs no changes — VLAN 5 already exists and carries the Cilium LB announcements from `eth0`.

> **Revision (2026-06-27) — per-cluster VNets collapsed into `vnet-talos`.**
> The original Option 3 design called for one VNet per cluster (`vnet-lungmen`,
> `vnet-rhodes`, `vnet-sandbox`) carved from `10.128.0.0/16`, each providing L2 isolation of
> node-plane traffic between clusters. During implementation we hit a hard Omni constraint: a
> cluster-template's `patches[]` are Talos machine-config strategic-merge patches only — they
> **cannot override a `MachineClass`'s `providerdata`** (e.g. `additional_nics[].bridge`).
> The cluster-template's `machineClass` reference exposes only `name` and `size`; the bridge
> a NIC attaches to lives inside the MachineClass's `providerdata`, and MachineClasses are
> shared COSI typed resources (`metadata.type`/`metadata.id`) that cannot be kustomize-patched
> per cluster ([Omni cluster-template reference][omni-ct]; maintainer confirmation in
> [siderolabs/omni#2593][omni-2593]). Per-cluster VNets would therefore require a distinct
> set of MachineClasses per cluster. Rather than multiply MachineClasses, we adopt a single
> shared `vnet-talos` (`10.128.0.0/24`) for all Talos clusters. **Trade-off:** per-cluster L2
> isolation for node (`eth1`) traffic is sacrificed in exchange for a simple, shared
> MachineClass catalog — consistent with the repo's "Steel Age: pragmatic over perfect"
> philosophy (AGENTS.md). Inter-cluster isolation for *external* LoadBalancer traffic is
> preserved by the per-cluster VLAN 5 LB pools (`10.0.0.64/26`), which remain separate `/29`
> slices per cluster on `eth0`.

* `+` **Node-plane separation from the homelab VLAN** — all cluster node traffic (kubelet,
  etcd, inter-node) is confined to the shared `vnet-talos` and kept off VLAN 5, which is
  left to Cilium LB announcements only.
* `+` **No UDM Pro changes per new cluster** — adding a cluster reuses the shared
  `vnet-talos` and the MachineClass catalog (IaC, no GUI); the UDM Pro is untouched.
* `+` **Clean traffic separation** — Cilium L2 announcements on `eth0` (VLAN 5, visible to
  the UDM Pro) and node management on `eth1` (VXLAN, invisible to physical VLANs). Reduces
  ARP broadcast noise on VLAN 5 to LB-pool announcements only.
* `+` SNAT on the VNet gateway provides Proxmox API reachability without exposing node IPs
  to the VLAN 5 segment.
* `-` VXLAN adds 50 bytes of overhead per packet; acceptable at homelab bandwidth but
  relevant for high-throughput storage workloads.
* `-` Proxmox SDN adds operational surface: a second network path to configure and debug.
* `-` Node IPs (DHCP from SDN dnsmasq) are not visible on VLAN 5 — requires using
  `kubectl` or Omni to find node addresses for debugging.
* `-` A single Proxmox node means the VXLAN tunnel is loopback-only; the isolation benefit
  is real but the physical overhead is an on-host packet copy rather than a wire traversal.

## Decision Outcome

**Chosen: Option 3 — dual-NIC Talos VMs with Proxmox SDN VXLAN.**

The isolation benefit of Option 3 is decisive at more than one cluster: a single shared L2
domain (Options 1 and 2 partial) means that any cluster's node traffic is reachable by any
other cluster's workloads at the network layer. Option 3 eliminates that surface with no
UDM Pro intervention. Option 2 provides equivalent isolation but at the cost of a permanent
UDM Pro GUI dependency for every new cluster — a hard constraint violation.

The VXLAN overhead and SDN operational surface are accepted trade-offs. At homelab bandwidth,
50 bytes of encapsulation is not measurable for cluster management traffic. The SDN is managed
declaratively in Proxmox (IaC via Ansible or the PVE API) and documented in `docs/network/vlans.md`.
The Omni infra provider handles VNet attachment automatically when provisioning VMs.

### Rationale

**L2 isolation without UDM Pro coupling.** The fundamental constraint is that UDM Pro
configuration is GUI-only and cannot be safely automated. Option 2 would couple each cluster
provisioning event to a manual UDM Pro operation — exactly the type of undocumentable,
non-reproducible state that GitOps rules #1 and #2 exist to eliminate. Option 3 pushes
isolation into the Proxmox SDN layer, which is API-driven and can be expressed as IaC.

**Clean separation of L2 planes.** The dual-NIC design creates two distinct traffic planes:
the announcement plane (`eth0`, VLAN 5) and the management plane (`eth1`, SDN VNet). This
separation means that the physical VLAN 5 broadcast domain only sees Cilium gratuitous ARP
for LB pool IPs — not kubelet handshakes, etcd elections, or inter-node pod tunnel setup.
The blast radius of a node-plane CNI misconfiguration is bounded to `vnet-talos`
(`10.128.0.0/24`); inter-cluster isolation of *external* service traffic is preserved by
the per-cluster VLAN 5 LB pools.

**Proxmox API reachability via SNAT.** The `proxmox-csi-plugin` requires nodes to call the
Proxmox API (`pve-01:8006`). Under the SDN design, nodes have no direct VLAN 5 IP, so the
VNet gateway provides SNAT to give each node a routable source IP for that call. This is a
targeted exception that does not expose node management ports to VLAN 5.

## Consequences

### Positive

* ✅ Cluster node traffic (kubelet/etcd) is kept off VLAN 5 on the shared `vnet-talos`;
  VLAN 5 ARP broadcasts are limited to Cilium LB announcements.
* ✅ Adding a new cluster reuses the existing `vnet-talos` and shared MachineClass catalog —
  no new VNet, no new MachineClasses, and no UDM Pro changes.
* ✅ VLAN 5 ARP broadcast domain carries only Cilium LB announcements, not cluster node traffic.
* ✅ Node IPs are stable across reboots (DHCP stable leases per MAC from SDN dnsmasq).
* ✅ Network topology is fully documented and reproducible (this ADR + `docs/network/vlans.md`).
* ✅ All clusters share one Cilium install manifest — the pod CIDR supernet `172.30.0.0/16`
  is set as `ipv4NativeRoutingCIDR` (`catalog/talos/manifests/cilium/`). This is a
  **ClusterMesh prerequisite**: Cilium skips SNAT for destinations within the
  supernet, so inter-cluster pod traffic retains its source identity. Each cluster
  still allocates its own non-overlapping /19 from within the /16 — the
  `ipv4NativeRoutingCIDR` setting simply tells Cilium not to masquerade traffic
  headed to any address in the broader range.
* ✅ **Service CIDR unified across all clusters** — all clusters share `172.31.0.0/19`
  (kube-dns `172.31.0.10` everywhere) instead of per-cluster `/19` ranges. This is
  ClusterMesh-compatible: Cilium resolves ClusterIPs at the source node via eBPF, so
  they never traverse the inter-cluster link. Pod CIDRs remain unique per cluster
  (mandatory). See the ClusterMesh prerequisites table in `docs/network/vlans.md`.

### Negative

* ⚠️ All Talos clusters share `vnet-talos`, so node-plane (`eth1`) traffic is **not**
  L2-isolated per cluster (per the 2026-06-27 revision). External service isolation remains
  provided by the per-cluster VLAN 5 LB pools.
* ⚠️ VXLAN adds 50-byte encapsulation overhead per packet; relevant for storage-heavy
  workloads on NAS-backed PVCs (mitigated: homelab inter-node bandwidth is well within 1G).
* ⚠️ Node IPs are not visible on VLAN 5; debugging requires `kubectl get nodes -o wide`
  or Omni console rather than a simple `arp` scan on VLAN 5.
* ⚠️ Proxmox SDN dnsmasq must be running for new node provisioning; a dnsmasq restart
  does not affect already-running nodes (stable leases are persistent).

### Neutral

* ⚖️ The VXLAN tunnel is loopback-only on a single-node Proxmox setup; the isolation
  benefit is real (separate L2 domains) but there is no physical wire traversal.
* ⚖️ `10.0.0.10` is the IPMI address of pve-01; `10.0.0.11` is the OS management IP. The
  `.10`/`.11` pair is intentional (BMC + host OS on consecutive addresses).

## Decision Evolution

* **2026-05**: **Initial design (V1)** — Single-NIC Talos VMs on VLAN 5 (`10.0.0.0/22`)
  for the first cluster `lungmen.akn`. Rationale: single cluster, zero VXLAN overhead, full
  transparency on VLAN 5. Cilium LB pool at `10.0.0.64/29`.
* **2026-06-27**: **V2 architecture (this ADR)** — Dual-NIC + Proxmox SDN VXLAN, triggered
  by [#1038][] multi-cluster planning. The shared L2 domain was identified as a structural
  problem for two or more clusters. SDN VXLAN chosen over per-cluster UDM Pro VLANs to
  avoid GUI-only UDM Pro dependency per cluster. Cilium LB pool moved from `192.168.10.64/28`
  (VLAN 2 / Home) to `10.0.0.64/26` (VLAN 5 / Homelab) to keep all cluster traffic inside
  the Homelab VLAN.
* **2026-06-27 (revision)**: **Per-cluster VNets collapsed into a single shared
  `vnet-talos`.** Implementation revealed that Omni cluster-template `patches[]` cannot
  override a `MachineClass`'s `providerdata` (where the NIC bridge lives); MachineClasses
  are non-kustomizable shared COSI resources, so per-cluster VNets would force one
  MachineClass set per cluster. Resolved by adopting a single `vnet-talos`
  (`10.128.0.0/24`) for all Talos clusters, trading per-cluster L2 node isolation for a
  simple MachineClass catalog. External LB isolation is retained via the unchanged
  per-cluster VLAN 5 LB pools.
* **2026-06-29**: **Service CIDR unification (ClusterMesh readiness)** — Moved from
  per-cluster service CIDRs (each cluster had its own `/19` from `172.31.0.0/16`) to a
  single shared service CIDR `172.31.0.0/19` for all clusters. Cilium's eBPF-based
  service load-balancing means ClusterIPs are resolved at the source node and never appear
  on the inter-cluster wire, so overlapping service CIDRs are transparent to ClusterMesh.
  Simplifies cluster templates (service CIDR and kube-dns are now defaults, not per-cluster
  overrides). Pod CIDRs remain per-cluster (mandatory ClusterMesh prerequisite). Added
  `cluster.name`/`cluster.id` allocation table for future ClusterMesh enablement.

## References and Related Decisions

* **Tracking issue**: [#1038 — Omni cluster template dual-NIC / SDN](https://github.com/chezmoidotsh/arcane/issues/1038)
* **Blocking issue**: [#1032 — Document homelab network topology][#1032]
* **Network reference**: [`docs/network/vlans.md`](../network/vlans.md)
* **Network diagram**: [`docs/network/topology.d2`](../network/topology.d2)
* **Related ADRs**:
  * ADR-013: Centralized observability (NixOS LXC on Proxmox) — depends on VLAN 5 LXC
    networking and pve-exporter firewall rules documented here.
* **External documentation**:
  * [Proxmox SDN documentation](https://pve.proxmox.com/wiki/Setup_Simple_Zone_With_SNAT_and_DHCP)
  * [Cilium L2 Announcements](https://docs.cilium.io/en/stable/network/l2-announcements/)
  * [RFC 7348 — VXLAN](https://datatracker.ietf.org/doc/html/rfc7348)
  * [proxmox-csi-plugin — Kubernetes CSI for Proxmox](https://github.com/sergelogvinov/proxmox-csi-plugin)

***

## Changelog

* **2026-06-29**: **REVISION**: Service CIDR unified across all clusters — all clusters
  now share `172.31.0.0/19` (kube-dns `172.31.0.10` everywhere) instead of per-cluster
  `/19` ranges. Overlapping service CIDRs are ClusterMesh-compatible: Cilium's eBPF
  service load-balancing resolves ClusterIPs at the source node. The previous per-cluster
  service CIDR allocation (`172.31.0.0/16` split into 8 × /19) is superseded; remaining
  `172.31.x.x` space is reserved. Added `cluster.name`/`cluster.id` allocation table
  (ClusterMesh prerequisites, not yet applied).
* **2026-06-27**: **REVISION**: Per-cluster SDN VNets (`vnet-lungmen`, `vnet-rhodes`,
  `vnet-sandbox`) replaced by a single shared `vnet-talos` (`10.128.0.0/24`) after
  discovering Omni cluster-template `patches[]` cannot override a MachineClass's
  `providerdata` (NIC bridge). Trade-off: per-cluster L2 node isolation is sacrificed for a
  simple shared MachineClass catalog; per-cluster external-LB isolation is preserved via the
  VLAN 5 LB pools.
* **2026-06-27**: **ACCEPTED**: Initial ADR documenting V1 (single-NIC, single cluster)
  and V2 (dual-NIC + Proxmox SDN VXLAN, multi-cluster) network design. Created alongside
  `docs/network/vlans.md` and `docs/network/topology.d2` as the full network reference.

<!-- Issue reference links -->

[#1032]: https://github.com/chezmoidotsh/arcane/issues/1032

[#1038]: https://github.com/chezmoidotsh/arcane/issues/1038

<!-- External reference links -->

[omni-ct]: https://docs.siderolabs.com/omni/reference/cluster-templates

[omni-2593]: https://github.com/siderolabs/omni/issues/2593
