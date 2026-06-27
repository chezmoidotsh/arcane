# Homelab Network

This directory is the single source of truth for the homelab network topology.
Update it before adding new clusters, services, or static IPs.

## Contents

| File                           | Purpose                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| [`vlans.md`](vlans.md)         | Operational reference: VLANs, VLAN 5 IP plan, Proxmox SDN VNets, Kubernetes CIDRs, firewall rules |
| [`topology.d2`](topology.d2)   | D2 source for the topology diagram below                                                          |
| [`topology.svg`](topology.svg) | Generated diagram (regenerate with `d2 topology.d2 topology.svg`)                                 |

***

## Infrastructure Overview

The homelab runs on a single Proxmox hypervisor (`pve-01`) connected directly to a
UniFi Dream Machine Pro. The UDM Pro acts as the L3 gateway and manages all five VLANs.
There is no intermediate switch between the UDM Pro and pve-01 — both machines' physical
NICs attach directly to UDM Pro ports.

**pve-01** exposes two bridges to its guests:

* **`vmbr0`** (NIC 2, VLAN 5 access) — the hypervisor's own management IP (`10.0.0.11`).
  No guest traffic flows here.
* **`vmbr1`** (NIC 1, full VLAN trunk) — all guest VMs and LXC containers attach here.
  VLANs are tagged per port.

Standalone infrastructure services (Omni, observability stack, OCI registry) run as
NixOS LXC containers on `vmbr1` with static IPs in the `10.0.0.0/26` management zone.

Kubernetes clusters run as **Talos VMs** with a dual-NIC design:

* **eth0 → vmbr1 (VLAN 5, no node IP)** — Cilium L2 LoadBalancer ARP announcements only.
  Each cluster's LB pool is a `/29` slice of `10.0.0.64/26`, visible to home devices via
  the UDM Pro.
* **eth1 → shared SDN VNet `vnet-talos` (VXLAN, `10.128.0.0/24`)** — all node management
  traffic (kubelet, etcd, inter-node) for every Talos cluster. SNAT lets nodes reach the
  Proxmox API for the CSI volume driver.

The Proxmox SDN VXLAN zone (`10.128.0.0/16`) hosts the shared `vnet-talos`, keeping node
traffic off the homelab VLAN with no UDM Pro configuration changes per new cluster.
Per-cluster isolation of *external* LoadBalancer traffic is preserved by the per-cluster
VLAN 5 LB pools. See [ADR-014](../decisions/014-network-topology.md) for the full rationale.

***

## Network Topology Diagram

![Homelab Network Topology](topology.svg)

> Regenerate after editing `topology.d2`:
>
> ```sh
> d2 docs/network/topology.d2 docs/network/topology.svg
> ```

***

## Quick Reference

For full detail see [`vlans.md`](vlans.md). Key numbers:

| Resource                         | Range                              |
| -------------------------------- | ---------------------------------- |
| Homelab VLAN 5                   | `10.0.0.0/22`                      |
| Management zone (PVE + LXCs)     | `10.0.0.0/26` (.1–.62)             |
| Cilium LB pool                   | `10.0.0.64/26` (8 clusters × /29)  |
| Proxmox SDN VXLAN (`vnet-talos`) | `10.128.0.0/24` (parent `/16`)     |
| Pod CIDRs                        | `172.30.0.0/16` (8 clusters × /19) |
| Service CIDRs                    | `172.31.0.0/16` (8 clusters × /19) |
