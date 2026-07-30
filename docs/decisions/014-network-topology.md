---
status: "accepted"
date: 2026-07-30
decision-makers: ["Alexandre"]
assisted-by: ["claude-sonnet-4-6", "glm-5.2", "claude-sonnet-5"]
informed: []
---

# Homelab network topology: single-VLAN (V1) to dual-NIC + Proxmox SDN VXLAN (V2)

## Table of Contents

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
  - [Functional Requirements](#functional-requirements)
  - [Non-Functional Requirements](#non-functional-requirements)
  - [Constraints](#constraints)
- [Considered Options](#considered-options)
  - [Option 1: Single-NIC Talos VMs on VLAN 5 (V1 — initial)](#option-1-single-nic-talos-vms-on-vlan-5-v1--initial)
  - [Option 2: Per-cluster UDM Pro VLANs with single NIC](#option-2-per-cluster-udm-pro-vlans-with-single-nic)
  - [Option 3: Dual-NIC Talos VMs with Proxmox SDN VXLAN (V2 — rejected for now)](#option-3-dual-nic-talos-vms-with-proxmox-sdn-vxlan-v2--rejected-for-now)
  - [Option 4: Dual-NIC Talos VMs with Proxmox SDN `simple` zone VNet (V2 — accepted)](#option-4-dual-nic-talos-vms-with-proxmox-sdn-simple-zone-vnet-v2--accepted)
- [Decision Outcome](#decision-outcome)
  - [Rationale](#rationale)
- [Consequences](#consequences)
  - [Positive](#positive)
  - [Negative](#negative)
  - [Neutral](#neutral)
- [Decision Evolution](#decision-evolution)
- [References and Related Decisions](#references-and-related-decisions)
- [Changelog](#changelog)

## Context and Problem Statement

The homelab runs on a single Proxmox hypervisor (`pve-01`) connected directly to a UDM Pro gateway via two physical NICs
(no intermediate switch). The UDM Pro manages five VLANs: Backbone (VLAN 1), Home (VLAN 2), Home Guest (VLAN 3), IoT
(VLAN 4), and Homelab (VLAN 5, `10.0.0.0/22`). The Proxmox host exposes two bridges to guests: `vmbr0` (PVE management,
VLAN 5 only) and `vmbr1` (VLAN-aware trunk for all guest VMs and LXCs).

When the first Talos cluster (`lungmen.akn`) was provisioned, all VMs were given a single NIC on `vmbr1` (VLAN 5). This
worked for a single cluster: node IPs, kubelet traffic, etcd, and Cilium L2 LoadBalancer ARP announcements all shared
the same L2 segment. With the exception of Cilium's use of gratuitous ARP for `10.0.0.64/29` (lungmen's LB slice within
the `/26` pool), the traffic remained contained within VLAN 5 and invisible to home devices.

Planning for a second production cluster (`rhodes.akn`) — tracked in [#1038][] — exposed a structural problem with this
design. Under the single-NIC model, every cluster's node traffic (kubelet, etcd, CNI internal traffic) would share the
same VLAN 5 L2 broadcast domain. A misconfigured workload, a network policy bug, or an accidental ARP flood on
`lungmen.akn` could disrupt `rhodes.akn` node-level connectivity. More critically, a CNI misconfiguration on one cluster
could send traffic that reaches pod CIDRs or kubelet ports on nodes of a completely different cluster — a L2 bleed with
no mitigating barrier.

Additionally, Cilium's L2 announcements (gratuitous ARP, unsolicited ARP replies) need to remain on the shared VLAN 5
segment so that home devices and the UDM Pro routing table can learn service IPs. But the node management traffic
(kubelet API, etcd peer communication, internal overlay) does not need to be on that same segment — and mixing them
creates noise and surface area that grows with each new cluster.

The strategic question this ADR answers is: **how do we isolate inter-cluster node traffic at L2 without requiring UDM
Pro configuration changes for each new cluster, while keeping Cilium L2 LoadBalancer announcements on the shared homelab
VLAN where home devices can reach them?**

## Decision Drivers

### Functional Requirements

- Talos nodes must be able to reach the Proxmox API (`pve-01:8006`) so that `proxmox-csi-plugin` can attach and detach
  volumes correctly.
- Cilium L2 LoadBalancer ARP announcements must remain on VLAN 5 so that the UDM Pro and home-network devices can learn
  Kubernetes service IPs without additional routing config.
- Each cluster's node traffic (kubelet, etcd, inter-node) must be L2-isolated from other clusters' node traffic.
- DHCP-assigned node IPs must be stable across reboots (stable leases per MAC).
- Adding a new cluster must not require changes to the UDM Pro or physical cabling.

### Non-Functional Requirements

- **Operational simplicity** — a single maintainer; the network design should be understandable and debuggable without
  specialist networking knowledge.
- **VXLAN overhead is acceptable** — 50-byte header over a 1G link at homelab inter-node bandwidth (typically < 100
  Mbps) is negligible.
- **Declarative + versioned** — GitOps rules #1 and #2; network topology must be captured in code (this document +
  `docs/network/ipam.md`), not only in GUI state.

### Constraints

- **UDM Pro configuration is GUI-only** — the UniFi Terraform provider is fragile against controller updates; every UDM
  Pro change is a manual operation. Adding a new VLAN per cluster would require UDM Pro GUI changes on each provisioning
  event.
- **Single Proxmox node** — no multi-node SDN topology to consider; all VXLAN traffic stays on the same physical host
  (loopback effectively), so latency is negligible.
- **Proxmox SDN is available** — PVE 8.x ships SDN with VXLAN zone support; no additional software is required.

## Considered Options

### Option 1: Single-NIC Talos VMs on VLAN 5 (V1 — initial)

> **Status: SUPERSEDED by Option 4**

Each Talos VM gets a single NIC on `vmbr1`, tagged to VLAN 5. The VM receives a static IP in the management zone
(`10.0.0.0/26`), and all traffic — node management, Cilium overlay, and L2 announcements — flows over the same L2
segment. This is the configuration that was in place when `lungmen.akn` was the only cluster.

- `+` Zero additional configuration — no SDN setup, no second NIC, no DHCP server.
- `+` No VXLAN overhead.
- `+` Fully transparent on the network: all traffic visible on VLAN 5 for debugging.
- `-` All clusters share the same L2 broadcast domain; no inter-cluster isolation.
- `-` A CNI misconfiguration on one cluster can reach other clusters' node ports at L2.
- `-` ARP broadcast domain grows linearly with cluster count, increasing noise on VLAN 5.
- `-` Cilium L2 announcements and kubelet/etcd traffic cannot be separated; all go to the same interface, increasing the
  attack surface of node management ports.

### Option 2: Per-cluster UDM Pro VLANs with single NIC

> **Status: REJECTED**

Each cluster gets its own UDM Pro VLAN (e.g., VLAN 10 for `lungmen.akn`, VLAN 11 for `rhodes.akn`). Talos VMs have a
single NIC on the cluster-specific VLAN. Cilium L2 announcements are made on that cluster VLAN and a UDM Pro inter-VLAN
rule allows home devices to reach the LB pool IPs. The UDM Pro routing table maps each Kubernetes service CIDR to the
correct VLAN.

- `+` Full L2 isolation between clusters at the physical VLAN layer — no VXLAN.
- `+` Debuggable with standard VLAN tools; no Proxmox SDN required.
- `-` **Every new cluster requires a UDM Pro GUI change** — a new VLAN, a new DHCP scope, and at least one inter-VLAN
  firewall rule. The UDM Pro has no IaC support.
- `-` Cilium LB announcements on a per-cluster VLAN mean the UDM Pro must have explicit routes for each cluster's LB
  pool to make services reachable from VLAN 2 (Home).
- `-` Each cluster VLAN adds broadcast domain surface visible to the physical switch; more VLANs = more trunk
  configuration.
- `-` Violates the constraint that adding a cluster must not require UDM Pro changes.

### Option 3: Dual-NIC Talos VMs with Proxmox SDN VXLAN (V2 — rejected for now)

> **Status: REJECTED — not by preference, by platform constraint. See Option 4, the accepted variant.**

Each Talos VM gets two NICs:

- `eth0` → `vmbr1` (VLAN 5 trunk, no node IP assigned) — Cilium L2Announcement ARP responses only; the VM responds to
  ARP for LB pool IPs but carries no kubelet traffic.
- `eth1` → a shared SDN VNet, VXLAN-encapsulated, DHCP with stable leases per MAC — all node management traffic: kubelet
  API, etcd, inter-node pod overlay.

A single Proxmox SDN `vxlan` zone would back one shared VNet (`10.128.0.0/24`) used by **all** Talos/Omni clusters, the
same way Option 4 does. The only difference from Option 4 is the encapsulation: `vxlan` tunnels the VNet's L2 domain
over IP, so it can extend across multiple Proxmox hosts — which is exactly why it was the original target: it's what a
future multi-node homelab needs for the node-plane VNet to keep working when clusters' VMs are spread across more than
one physical host.

**Why rejected today, specifically:** PVE 9's SDN API refuses to create a `vxlan` zone without `--peers` or `--fabric` —
both require naming at least one other Proxmox node's address, and the homelab has only `pve-01`. This isn't a soft
preference or a cost/benefit call; the API call to create the zone fails outright. `vxlan` cannot be chosen on this
hardware today, full stop. See
[INF-20260627-00](../procedures/infrastructure/INF-20260627-00.proxmox-sdn-setup.md#migrating-from-simple-to-vxlan-when-a-second-proxmox-node-joins)
for the migration procedure to run when a second node joins and this option becomes viable again.

- `+` The VNet's L2 domain can span multiple Proxmox hosts — required once there's more than one node.
- `+` Tunnel encapsulation gives a real wire-level isolation boundary, not just a host-local private bridge.
- `-` **Cannot be created on a single-node Proxmox cluster** — hard platform constraint, not a trade-off.
- `-` Adds 50 bytes of VXLAN overhead per packet; acceptable at homelab bandwidth but relevant for high-throughput
  storage workloads.
- `-` Second network path (SDN) to configure and debug, on top of the physical VLANs.

### Option 4: Dual-NIC Talos VMs with Proxmox SDN `simple` zone VNet (V2 — accepted)

> **Status: ACCEPTED**

Identical to Option 3's `eth0`/`eth1` split — the only difference is the SDN zone type. A single Proxmox SDN
**`simple`** zone backs one shared VNet, `talosnet` (`10.128.0.0/24`, zone `pvenet`), used by **all** Talos/Omni
clusters. A `simple` zone is a private, host-local bridge with no encapsulation: no `--peers`/`--fabric` requirement, so
it can be created on a single Proxmox node — which is exactly the constraint that ruled out Option 3. SNAT on the VNet
gateway (`10.128.0.1`, PVE acting as L3 router) lets nodes reach `pve-01:8006` (required for `proxmox-csi-plugin`). The
UDM Pro needs no changes — VLAN 5 already exists and carries the Cilium LB announcements from `eth0`.

The trade-off this option accepts is scope: a `simple` zone's bridge is host-local, so it doesn't extend to a second
Proxmox node. That's fine today (single-node homelab) and becomes the reason to migrate to Option 3 (`vxlan`) the day a
second node is added — this option is not a permanent substitute for Option 3, it's what today's hardware allows. The
zone/VNet/subnet are codified in Pulumi (`projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts`), which
superseded the manual `pvesh`/`pveum` steps
[INF-20260627-00](../procedures/infrastructure/INF-20260627-00.proxmox-sdn-setup.md) originally documented. PVE 9 also
caps VNet names at 8 alphanumeric characters, so the originally planned `vnet-talos` is named `talosnet`.

> **Revision (2026-06-27) — per-cluster VNets collapsed into `talosnet`.** The original design (either option) called
> for one VNet per cluster (`vnet-lungmen`, `vnet-rhodes`, `vnet-sandbox`) carved from `10.128.0.0/16`, each providing
> L2 isolation of node-plane traffic between clusters. During implementation we hit a hard Omni constraint: a
> cluster-template's `patches[]` are Talos machine-config strategic-merge patches only — they **cannot override a
> `MachineClass`'s `providerdata`** (e.g. `additional_nics[].bridge`). The cluster-template's `machineClass` reference
> exposes only `name` and `size`; the bridge a NIC attaches to lives inside the MachineClass's `providerdata`, and
> MachineClasses are shared COSI typed resources (`metadata.type`/`metadata.id`) that cannot be kustomize-patched per
> cluster ([Omni cluster-template reference][omni-ct]; maintainer confirmation in [siderolabs/omni#2593][omni-2593]).
> Per-cluster VNets would therefore require a distinct set of MachineClasses per cluster. Rather than multiply
> MachineClasses, we adopt a single shared `talosnet` (`10.128.0.0/24`) for all Talos clusters. **Trade-off:**
> per-cluster L2 isolation for node (`eth1`) traffic is sacrificed in exchange for a simple, shared MachineClass catalog
> — consistent with the repo's "Steel Age: pragmatic over perfect" philosophy (AGENTS.md). Inter-cluster isolation for
> _external_ LoadBalancer traffic is preserved by the per-cluster VLAN 5 LB pools (`10.0.0.64/26`), which remain
> separate `/29` slices per cluster on `eth0`.

- `+` **Actually creatable on a single Proxmox node** — no `--peers`/`--fabric`, no second host required.
- `+` **Node-plane separation from the homelab VLAN** — all cluster node traffic (kubelet, etcd, inter-node) is confined
  to the shared `talosnet` and kept off VLAN 5, which is left to Cilium LB announcements only.
- `+` **No UDM Pro changes per new cluster** — adding a cluster reuses the shared `talosnet` and the MachineClass
  catalog (IaC, no GUI); the UDM Pro is untouched.
- `+` **Clean traffic separation** — Cilium L2 announcements on `eth0` (VLAN 5, visible to the UDM Pro) and node
  management on `eth1` (SDN VNet, invisible to physical VLANs). Reduces ARP broadcast noise on VLAN 5 to LB-pool
  announcements only.
- `+` SNAT on the VNet gateway provides Proxmox API reachability without exposing node IPs to the VLAN 5 segment.
- `+` No encapsulation overhead — a `simple` zone doesn't tunnel anything.
- `-` **Single-node only, by construction** — the bridge doesn't span a second Proxmox host; adding one requires
  migrating to Option 3 (`vxlan`), not a config tweak.
- `-` Proxmox SDN adds operational surface: a second network path to configure and debug.
- `-` Node IPs (DHCP from SDN dnsmasq) are not visible on VLAN 5 — requires using `kubectl` or Omni to find node
  addresses for debugging.

## Decision Outcome

**Chosen: Option 4 — dual-NIC Talos VMs with a Proxmox SDN `simple` zone VNet.** (Option 3, the same design over
`vxlan`, is the target once a second Proxmox node exists — see Option 3's rejection reason.)

The isolation benefit of the dual-NIC + shared-VNet design is decisive at more than one cluster: a single shared L2
domain (Options 1 and 2) means that any cluster's node traffic is reachable by any other cluster's workloads at the
network layer. Options 3/4 eliminate that surface with no UDM Pro intervention. Option 2 provides equivalent isolation
but at the cost of a permanent UDM Pro GUI dependency for every new cluster — a hard constraint violation. Between 3 and
4, the choice isn't really a trade-off — Option 3 cannot be created on today's single Proxmox node, so Option 4 is the
only one on the table until that changes.

The SDN operational surface is an accepted trade-off. The SDN is managed declaratively in Pulumi
(`stack/proxmox/sdn.ts`) and documented in `docs/network/ipam.md`. The Omni infra provider handles VNet attachment
automatically when provisioning VMs.

### Rationale

**L2 isolation without UDM Pro coupling.** The fundamental constraint is that UDM Pro configuration is GUI-only and
cannot be safely automated. Option 2 would couple each cluster provisioning event to a manual UDM Pro operation —
exactly the type of undocumentable, non-reproducible state that GitOps rules #1 and #2 exist to eliminate. Options 3/4
push isolation into the Proxmox SDN layer, which is API-driven and can be expressed as IaC.

**Clean separation of L2 planes.** The dual-NIC design creates two distinct traffic planes: the announcement plane
(`eth0`, VLAN 5) and the management plane (`eth1`, SDN VNet). This separation means that the physical VLAN 5 broadcast
domain only sees Cilium gratuitous ARP for LB pool IPs — not kubelet handshakes, etcd elections, or inter-node pod
tunnel setup. The blast radius of a node-plane CNI misconfiguration is bounded to `talosnet` (`10.128.0.0/24`);
inter-cluster isolation of _external_ service traffic is preserved by the per-cluster VLAN 5 LB pools.

**Proxmox API reachability via SNAT.** The `proxmox-csi-plugin` requires nodes to call the Proxmox API (`pve-01:8006`).
Under the SDN design, nodes have no direct VLAN 5 IP, so the VNet gateway provides SNAT to give each node a routable
source IP for that call. This is a targeted exception that does not expose node management ports to VLAN 5.

## Consequences

### Positive

- ✅ Cluster node traffic (kubelet/etcd) is kept off VLAN 5 on the shared `talosnet`; VLAN 5 ARP broadcasts are limited
  to Cilium LB announcements.
- ✅ Adding a new cluster reuses the existing `talosnet` and shared MachineClass catalog — no new VNet, no new
  MachineClasses, and no UDM Pro changes.
- ✅ VLAN 5 ARP broadcast domain carries only Cilium LB announcements, not cluster node traffic.
- ✅ Node IPs are stable across reboots (DHCP stable leases per MAC from SDN dnsmasq).
- ✅ Network topology is fully documented and reproducible (this ADR + `docs/network/ipam.md`).
- ✅ All clusters share one Cilium install manifest — the pod CIDR supernet `172.30.0.0/16` is set as
  `ipv4NativeRoutingCIDR` (`catalog/talos/manifests/cilium/`). This is a **ClusterMesh prerequisite**: Cilium skips SNAT
  for destinations within the supernet, so inter-cluster pod traffic retains its source identity. Each cluster still
  allocates its own non-overlapping /19 from within the /16 — the `ipv4NativeRoutingCIDR` setting simply tells Cilium
  not to masquerade traffic headed to any address in the broader range.
- ✅ **Service CIDR unified across all clusters** — all clusters share `172.31.0.0/19` (kube-dns `172.31.0.10`
  everywhere) instead of per-cluster `/19` ranges. This is ClusterMesh-compatible: Cilium resolves ClusterIPs at the
  source node via eBPF, so they never traverse the inter-cluster link. Pod CIDRs remain unique per cluster (mandatory).
  See the ClusterMesh prerequisites table in `docs/network/ipam.md`.

### Negative

- ⚠️ All Talos clusters share `talosnet`, so node-plane (`eth1`) traffic is **not** L2-isolated per cluster (per the
  2026-06-27 revision). External service isolation remains provided by the per-cluster VLAN 5 LB pools.
- ⚠️ Once migrated to `vxlan` (Option 3): 50 bytes/packet overhead, negligible at homelab bandwidth but relevant for
  storage-heavy workloads on NAS-backed PVCs.
- ⚠️ Node IPs are not visible on VLAN 5; debugging requires `kubectl get nodes -o wide` or Omni console rather than a
  simple `arp` scan on VLAN 5.
- ⚠️ Proxmox SDN dnsmasq must be running for new node provisioning; a dnsmasq restart does not affect already-running
  nodes (stable leases are persistent).
- ⚠️ A userspace-terminated service on `eth0` (e.g. the Gateway API's embedded Envoy) needs a `pve-01` host-level
  conntrack exception to be reachable from real external clients — see the 2026-07-30 Decision Evolution entry and
  [INF-20260730-00](../procedures/infrastructure/INF-20260730-00.pve-firewall-conntrack-notrack-external-lb.md).

### Neutral

- ⚖️ Today's isolation is a host-local bridge, not a wire tunnel (see Option 4's single-node trade-off) — that changes
  once the `vxlan` migration (Option 3) happens.
- ⚖️ `10.0.0.10` is the IPMI address of pve-01; `10.0.0.11` is the OS management IP. The `.10`/`.11` pair is intentional
  (BMC + host OS on consecutive addresses).

## Decision Evolution

- **2026-05**: **Initial design (V1)** — Single-NIC Talos VMs on VLAN 5 (`10.0.0.0/22`) for the first cluster
  `lungmen.akn`. Rationale: single cluster, zero VXLAN overhead, full transparency on VLAN 5. Cilium LB pool at
  `10.0.0.64/29`.
- **2026-06-27**: **V2 architecture (this ADR)** — Dual-NIC + Proxmox SDN VXLAN, triggered by [#1038][] multi-cluster
  planning. The shared L2 domain was identified as a structural problem for two or more clusters. SDN VXLAN chosen over
  per-cluster UDM Pro VLANs to avoid GUI-only UDM Pro dependency per cluster. Cilium LB pool moved from
  `192.168.10.64/28` (VLAN 2 / Home) to `10.0.0.64/26` (VLAN 5 / Homelab) to keep all cluster traffic inside the Homelab
  VLAN.
- **2026-06-27 (revision)**: **Per-cluster VNets collapsed into a single shared `vnet-talos`.** Implementation revealed
  that Omni cluster-template `patches[]` cannot override a `MachineClass`'s `providerdata` (where the NIC bridge lives);
  MachineClasses are non-kustomizable shared COSI resources, so per-cluster VNets would force one MachineClass set per
  cluster. Resolved by adopting a single `vnet-talos` (`10.128.0.0/24`) for all Talos clusters, trading per-cluster L2
  node isolation for a simple MachineClass catalog. External LB isolation is retained via the unchanged per-cluster VLAN
  5 LB pools.
- **2026-06-28**: **PVE 9 platform constraints on apply** — Creating the `vxlan` zone failed: PVE 9 requires
  `--peers`/`--fabric` at creation time, both needing a second Proxmox node that doesn't exist. Applied as a `simple`
  zone (named `pvenet`) instead — no VXLAN encapsulation is actually in effect today, only once a second node joins and
  the zone is migrated (procedure documented in INF-20260627-00). Also renamed `vnet-talos` to `talosnet`: PVE 9 caps
  VNet names at 8 alphanumeric characters, hyphens included. Doesn't change the decision itself (shared SDN VNet for
  node-plane isolation from VLAN 5) or its trade-offs, only the encapsulation mechanism and object names. (Retroactively
  split into Option 3, `vxlan`/rejected, and Option 4, `simple`/accepted — see the 2026-07-28 entry.)
- **2026-06-29**: **Service CIDR unification (ClusterMesh readiness)** — Moved from per-cluster service CIDRs (each
  cluster had its own `/19` from `172.31.0.0/16`) to a single shared service CIDR `172.31.0.0/19` for all clusters.
  Cilium's eBPF-based service load-balancing means ClusterIPs are resolved at the source node and never appear on the
  inter-cluster wire, so overlapping service CIDRs are transparent to ClusterMesh. Simplifies cluster templates (service
  CIDR and kube-dns are now defaults, not per-cluster overrides). Pod CIDRs remain per-cluster (mandatory ClusterMesh
  prerequisite). Added `cluster.name`/`cluster.id` allocation table for future ClusterMesh enablement.
- **2026-07-28**: **Codified in Pulumi** — The zone/VNet/subnet/ACL that INF-20260627-00 provisioned by hand are now
  declared in `projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts`, replacing the manual
  `pvesh create`/`pveum acl modify` recipe for future cluster recreations. Same `simple` zone, same `talosnet`
  addressing — no design change, just moving the as-applied state into IaC.
- **2026-07-30**: **Operational gap found: real external clients couldn't reach a cluster's Gateway VIP.** Discovered
  while debugging `rhodes.akn`'s external Gateway. Cilium L2 announcements only control ARP for the VIP, not which
  interface the kernel picks for a reply generated by a userspace process (the Gateway API's embedded Envoy on
  `127.0.0.1`) — confirmed against [cilium/cilium#40521][cilium-40521] and matching [cilium/cilium#43819][cilium-43819].
  That reply follows the node's only default route (`eth1`/`talosnet`) and is forwarded by `pve-01` toward VLAN 5
  correctly at the routing level, but `pve-01`'s own firewall drops it: PVE assigns a dedicated conntrack zone
  (`CT --zone 1`) to traffic entering through a per-guest firewall bridge shim (`fwbr+`); the reply never touches one
  (it arrives via `talosnet`/`vmbr0` instead), so from that mismatched zone's perspective it is an untracked orphan
  SYN-ACK, dropped by `PVEFW-FORWARD`'s fixed, non-configurable `ctstate INVALID` rule. Fixed with a `raw`-table
  `NOTRACK` exception for the affected LB pool CIDR, persisted via an idempotent `/etc/network/if-up.d/` hook (survives
  `ifreload -a`, which every future SDN apply triggers). Does not change this ADR's decision or trade-offs — `eth0`
  remaining IP-less was never the problem; the fix lives entirely on `pve-01`, outside Talos/Cilium config. Full root
  cause and fix: [INF-20260730-00][inf-20260730-00].

## References and Related Decisions

- **Tracking issue**: [#1038 — Omni cluster template dual-NIC / SDN](https://github.com/chezmoidotsh/arcane/issues/1038)
- **Blocking issue**: [#1032 — Document homelab network topology][#1032]
- **Network reference**: [`docs/network/ipam.md`](../network/ipam.md)
- **Network diagram**: [`docs/network/topology.d2`](../network/topology.d2)
- **Pulumi implementation**:
  [`projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts`](../../projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts)
- **Setup procedure**: [INF-20260627-00](../procedures/infrastructure/INF-20260627-00.proxmox-sdn-setup.md)
- **Related ADRs**:
  - ADR-013: Centralized observability (NixOS LXC on Proxmox) — depends on VLAN 5 LXC networking and pve-exporter
    firewall rules documented here.
- **External documentation**:
  - [Proxmox SDN documentation](https://pve.proxmox.com/wiki/Setup_Simple_Zone_With_SNAT_and_DHCP)
  - [Cilium L2 Announcements](https://docs.cilium.io/en/stable/network/l2-announcements/)
  - [RFC 7348 — VXLAN](https://datatracker.ietf.org/doc/html/rfc7348)
  - [proxmox-csi-plugin — Kubernetes CSI for Proxmox](https://github.com/sergelogvinov/proxmox-csi-plugin)

---

## Changelog

- **2026-07-30**: **OPERATIONAL FINDING**: Real external clients could not reach a cluster's Gateway VIP — `pve-01`'s
  own firewall dropped the reply as `ctstate INVALID` due to a conntrack zone mismatch between the bridged request path
  and the routed reply path. Fixed with a `NOTRACK` exception on `pve-01`, documented in
  [INF-20260730-00][inf-20260730-00]. No change to the decision or trade-offs in this ADR — see the new Decision
  Evolution entry and updated Negative consequences.
- **2026-07-28**: **CLARIFICATION**: Split the former single "Option 3" into two: **Option 3** (Proxmox SDN `vxlan`) is
  now marked **REJECTED for the current single-node homelab** — PVE 9 refuses to create a `vxlan` zone at all without
  `--peers`/`--fabric`, i.e. without a second node, so it was never actually a choice, just a hard platform wall.
  **Option 4** (Proxmox SDN `simple` zone) is the option actually **ACCEPTED** and running — `Decision Outcome` updated
  to point at it. Migrating from 4 back to 3 (`vxlan`) is mandatory, not optional, once a second node joins, since
  `simple` zones can't span hosts. Also fixed `vnet-talos` → `talosnet` (8-char VNet name limit on PVE 9; zone is
  `pvenet`) throughout the current-state sections (historical Decision Evolution/Changelog entries keep the original
  name). Now codified in Pulumi (`stack/proxmox/sdn.ts`), superseding the manual procedure. No change to the underlying
  decision (a shared SDN VNet isolates node traffic from VLAN 5) or its trade-offs — see Options 3/4 and the two new
  Decision Evolution entries.
- **2026-06-29**: **REVISION**: Service CIDR unified across all clusters — all clusters now share `172.31.0.0/19`
  (kube-dns `172.31.0.10` everywhere) instead of per-cluster `/19` ranges. Overlapping service CIDRs are
  ClusterMesh-compatible: Cilium's eBPF service load-balancing resolves ClusterIPs at the source node. The previous
  per-cluster service CIDR allocation (`172.31.0.0/16` split into 8 × /19) is superseded; remaining `172.31.x.x` space
  is reserved. Added `cluster.name`/`cluster.id` allocation table (ClusterMesh prerequisites, not yet applied).
- **2026-06-27**: **REVISION**: Per-cluster SDN VNets (`vnet-lungmen`, `vnet-rhodes`, `vnet-sandbox`) replaced by a
  single shared `vnet-talos` (`10.128.0.0/24`) after discovering Omni cluster-template `patches[]` cannot override a
  MachineClass's `providerdata` (NIC bridge). Trade-off: per-cluster L2 node isolation is sacrificed for a simple shared
  MachineClass catalog; per-cluster external-LB isolation is preserved via the VLAN 5 LB pools.
- **2026-06-27**: **ACCEPTED**: Initial ADR documenting V1 (single-NIC, single cluster) and V2 (dual-NIC + Proxmox SDN
  VXLAN, multi-cluster) network design. Created alongside `docs/network/ipam.md` and `docs/network/topology.d2` as the
  full network reference.

<!-- Issue reference links -->

[#1032]: https://github.com/chezmoidotsh/arcane/issues/1032
[#1038]: https://github.com/chezmoidotsh/arcane/issues/1038

<!-- External reference links -->

[omni-ct]: https://docs.siderolabs.com/omni/reference/cluster-templates
[omni-2593]: https://github.com/siderolabs/omni/issues/2593
[cilium-40521]: https://github.com/cilium/cilium/issues/40521
[cilium-43819]: https://github.com/cilium/cilium/issues/43819
[inf-20260730-00]: ../procedures/infrastructure/INF-20260730-00.pve-firewall-conntrack-notrack-external-lb.md
