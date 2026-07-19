# Proxmox VE (pve-01.pve.chezmoi.sh)

> [!NOTE]
> This document is **auto-generated** from the `chezmoi-sh-infra` Pulumi stack's own live state — do not edit it by
> hand. Regenerate it with `mise run proxmox:docs:generate` (already chained onto `mise run pulumi:apply`).

`pve-01` is the single hypervisor this homelab runs on: every Kubernetes node, every platform LXC, and the
NAS itself are guests on this one machine. It is the bottom of the dependency chain — nothing else in the homelab
survives its loss — which is why its configuration is versioned as code rather than clicked into the web UI.

> [!IMPORTANT]
> **This document describes what the stack manages, and nothing else.** Access control, resource pools, SDN, backup
> storage, certificates, and the firewall baseline are declared in
> [`stack/proxmox/`](../src/infrastructure/pulumi/stack/proxmox/README.md) and rendered here from its deployed state.
> Anything a human configured directly on the host — guests, their disks, their backup jobs — is out of scope by
> design and does not appear below. See [What this stack does not manage](#what-this-stack-does-not-manage).

## Quick reference

| I need to… | Go to |
| --- | --- |
| Deploy a change to this host | [Deploy a change](#deploy-a-change) |
| Understand who can do what on this host | [Identities & access](#identities--access) |
| Rotate the Cloudflare token used for TLS | [Rotate the Cloudflare DNS-01 token](#rotate-the-cloudflare-dns-01-token) |
| Re-issue the node's certificate | [Force a certificate renewal](#force-a-certificate-renewal) |
| Give a new service access to the host | [Add a service identity](#add-a-service-identity) |
| Put a Kubernetes cluster on the SDN | [Attach a Kubernetes cluster to the SDN](#attach-a-kubernetes-cluster-to-the-sdn) |
| Restore a VM or LXC from backup | [Restore a guest from backup](#restore-a-guest-from-backup) |
| Recover after losing the host | [Rebuild the host](#rebuild-the-host) |
| Bring an existing PVE object under Pulumi | [Import an existing object](#import-an-existing-object) |

## The host

A single machine, directly cabled to the UDM Pro — no switch, no second node, no HA, no quorum. Guest availability is
bounded by this one machine's availability; the mitigation is backups, not redundancy.

| Component | Reference |
| --- | --- |
| Chassis | SilverStone RM400 · 4U rackmount |
| Board | Supermicro X10SLR-F · IPMI 2.0 on a dedicated port |
| CPU | 16 cores / 32 threads |
| Memory | 128 GiB DDR4 ECC |
| Storage | 2 × NVMe — one for the hypervisor, one for guest disks |
| Network | 1 × IPMI · 2 × 1GbE (onboard) · 1 × 10GbE |

Addressing (management IP, IPMI, LoadBalancer pools, VLAN layout) is not repeated here — it lives in
[`docs/network/vlans.md`](../../../docs/network/vlans.md), the single source of truth for the homelab's IPAM.

### Bridges

Not managed by this stack — the host's own network config, set up at install time — but every SDN object and firewall
rule below is meaningless without knowing which bridge it sits on:

| Bridge | Role |
| --- | --- |
| `vmbr0` | Management only — VLAN 5 access port, carries the host's own address |
| `vmbr1` | Guest trunk — VLAN-aware, carries every VM/LXC port on its own tag |

Talos nodes are dual-NIC (see [ADR-014](../../../docs/decisions/014-network-topology.md)): `eth0` on `vmbr1` so
Cilium's L2 LoadBalancer announcements stay reachable from home devices, and `eth1` on the SDN below so node-to-node
traffic never touches the home L2 domain.

## Identities & access

Four service accounts, each scoped to the narrowest path that works.

| Identity | Purpose | Granted |
| --- | --- | --- |
| `kubernetes-ccm@pve` | Kubernetes cloud-controller-manager - node labels and VM state | `KubernetesCCM` on `/nodes/pve`, `KubernetesCCM` on `/pool/talos` |
| `kubernetes-csi@pve` | Kubernetes CSI plugin - dynamic volume provisioning | `KubernetesCSI` on `/pool/talos` |
| `omni@pve` | Omni infra provider - VM lifecycle scoped to /pool/talos | `OmniProviderNode` on `/nodes/pve-01`, `OmniProvider` on `/pool/talos`, `PVESDNUser` on `/sdn/zones/localnetwork/vmbr1`, `PVESDNUser` on `/sdn/zones/pvenet/talosnet` |
| `prometheus@pve` | prometheus-pve-exporter monitoring | `Exporter` on `/` |

`prometheus@pve` is the only identity granted anything at `/`, and its role carries audit privileges exclusively — it can read the whole host and change none of it. Every other grant is bounded by a resource pool or a single node.

Three identities authenticate with an API token (`kubernetes-ccm@pve!ccm`, `kubernetes-csi@pve!csi` and `prometheus@pve!exporter`), all with privilege separation disabled — each token therefore carries exactly its user's permissions, no more.
`omni@pve` has no token: it authenticates with a password held outside this stack, which Pulumi never reads or writes.
Token secrets are one-time values Proxmox VE never returns again; they are not in this document and not recoverable
from stack state either.

<details>
<summary>Custom roles and their privileges</summary>

| Role | Privileges |
| --- | --- |
| `Exporter` | `Datastore.Audit`, `Pool.Audit`, `Sys.Audit`, `VM.Audit` |
| `KubernetesCCM` | `Sys.Audit`, `VM.Audit`, `VM.GuestAgent.Audit` |
| `KubernetesCSI` | `Datastore.Allocate`, `Datastore.AllocateSpace`, `Datastore.Audit`, `VM.Allocate`, `VM.Audit`, `VM.Clone`, `VM.Config.CPU`, `VM.Config.Disk`, `VM.Config.HWType`, `VM.Config.Memory`, `VM.Config.Options`, `VM.Migrate`, `VM.PowerMgmt` |
| `OmniProvider` | `Datastore.Allocate`, `Datastore.AllocateSpace`, `Datastore.AllocateTemplate`, `Datastore.Audit`, `Pool.Allocate`, `Pool.Audit`, `VM.Allocate`, `VM.Audit`, `VM.Clone`, `VM.Config.CDROM`, `VM.Config.CPU`, `VM.Config.Disk`, `VM.Config.HWType`, `VM.Config.Memory`, `VM.Config.Network`, `VM.Config.Options`, `VM.Console`, `VM.PowerMgmt` |
| `OmniProviderNode` | `Sys.AccessNetwork`, `Sys.Audit` |

</details>

<details>
<summary>ACL bindings</summary>

| Path | Grantee | Role | Propagates |
| --- | --- | --- | --- |
| `/nodes/pve-01` | `omni@pve` | `OmniProviderNode` | yes |
| `/nodes/pve` | `kubernetes-ccm@pve` | `KubernetesCCM` | yes |
| `/pool/talos` | `kubernetes-ccm@pve` | `KubernetesCCM` | yes |
| `/pool/talos` | `kubernetes-csi@pve` | `KubernetesCSI` | yes |
| `/pool/talos` | `omni@pve` | `OmniProvider` | yes |
| `/` | `prometheus@pve` | `Exporter` | yes |
| `/sdn/zones/localnetwork/vmbr1` | `omni@pve` | `PVESDNUser` | yes |
| `/sdn/zones/pvenet/talosnet` | `omni@pve` | `PVESDNUser` | yes |

</details>

### Resource pools

| Pool | Purpose | Referenced by ACLs |
| --- | --- | --- |
| `core` | Critical platform LXCs — required for everything else (oci-registry, o11y, omni) | no |
| `talos` | Omni-managed Talos VMs | yes — 3 grants |

`talos` is referenced by ACL bindings, which makes it an enforcement boundary rather than a label: the identities
granted on `/pool/talos` can see and act on guests **inside that pool and nowhere else**.
`core` is referenced by no grant at all, which is what keeps its members unreachable from any automation
credential.

> [!CAUTION]
> Adding a guest to `talos` silently grants every identity bound to that pool full access to
> it. Pool membership _is_ the permission — there is no second check.

Storage-level membership is declared for `local` and `nvme-lvm`, so the CSI plugin can provision volumes there.
Guest membership is not: it is set when Omni creates the VM, which is outside this stack.

## Network (SDN)

One virtual network carrying guest traffic off the host's physical VLANs.

| Zone | Type | VNet | Subnet | Gateway | DHCP | SNAT |
| --- | --- | --- | --- | --- | --- | --- |
| `pvenet` | `simple` | `talosnet` | `10.128.0.0/24` | `10.128.0.1` | `10.128.0.10–10.128.0.250` | yes |

`talosnet` — _Shared Talos node traffic (eth1) for all clusters_.

SNAT is load-bearing, not an optimisation: Talos nodes hold no address on the home VLAN, so without it they cannot
reach the Proxmox API — and `proxmox-csi-plugin` calls that API on every volume attach and detach.

A single shared VNet, rather than one per cluster, is an Omni constraint: MachineClasses are shared COSI resources
whose `providerdata` a cluster template cannot override, so per-cluster VNets would force a duplicate MachineClass set
per cluster. Isolation of _external_ traffic is unaffected — it comes from the per-cluster LoadBalancer pools in
[`vlans.md`](../../../docs/network/vlans.md), not from the SDN.

> [!NOTE]
> SDN changes are staged by Proxmox VE and inert until applied. The stack applies them automatically after any zone,
> VNet, subnet, or SDN ACL change, so a completed `pulumi up` always leaves the fabric live.

## Backup storage

| Storage | Server | Datastore | Authenticates as | Content | Retention here |
| --- | --- | --- | --- | --- | --- |
| `pbs.pve.chezmoi.sh` | `pbs.pve.chezmoi.sh` | `Backblaze-B2` | `pve-backup@pbs!pve-storage` | backup | none — keep-all |

Retention is deliberately absent on this side. The PBS token holds no `Datastore.Prune` permission, so pruning runs
server-side under PBS's own schedule — a compromised hypervisor cannot delete its own offsite backup history. The
policy that actually applies is documented in [`PROXMOX_BACKUP_SERVER.md`](./PROXMOX_BACKUP_SERVER.md).

Backups are encrypted client-side with a key applied once at bootstrap and never re-read afterwards. That key is not
recoverable from this host or from stack state: without a copy, existing backups cannot be restored.

_Which_ guests get backed up, and when, is a Proxmox VE backup job — see
[What this stack does not manage](#what-this-stack-does-not-manage).

## Certificates

The node's web UI and API serve a certificate renewed by Proxmox VE's own ACME client.

| Certificate | Account | Directory | Challenge |
| --- | --- | --- | --- |
| `pve-01.pve.chezmoi.sh` | `default` | Let's Encrypt production | DNS-01 via `cloudflare` |

DNS-01 is the only workable challenge here: the management interface is not publicly reachable, so HTTP-01 has no way
to validate it. The Cloudflare credential is a scoped, DNS-01-only API token minted and owned by this stack — not a
long-lived zone-edit token — and the plugin's stored credentials never appear in this document.


## Firewall

One Security Group guests can opt into:

### `talos` — _Baseline firewall policy for Omni-managed Talos VMs_

| Action | Protocol | Port | Source | Purpose |
| --- | --- | --- | --- | --- |
| `ACCEPT` | `icmp` | — | `+rfc1918` | Allow ICMP from private IPs (diagnostics) |
| `ACCEPT` | `tcp` | `50000` | `+rfc1918` | Talos apid — talosctl/Omni management plane |
| `ACCEPT` | `tcp` | `50001` | `+rfc1918` | Talos trustd — node join/trust bootstrap |

Only the ports every Talos node needs regardless of topology are here. Kubelet, the Kubernetes API, and etcd quorum
depend on control-plane layout this stack has no visibility into, so they are layered per-VM on top of `GROUP talos`
rather than baked into the baseline. Attaching a VM to the group is part of that VM's config, and stays manual.


## What this stack does not manage

| Not managed | Why |
| --- | --- |
| **VM / LXC lifecycle** | Proxmox hosts the Kubernetes clusters; letting those clusters manage Proxmox would close a trust cycle. Structurally excluded — no VM resource type is imported anywhere in this stack. See [ADR-015](../../../docs/decisions/015-migrate-crossplane-to-pulumi.md). |
| **Backup jobs** | Which guest is backed up on what schedule is VM-lifecycle-adjacent; same reasoning. This stack only prepares the destination. |
| **Host storage and network** | Local storage and the bridges are part of the OS install, same layer as the hypervisor itself. |
| **PCI/USB passthrough mappings** | They encode host-specific IOMMU addresses needing rediscovery on any rebuild anyway, and are consumed by exactly one guest. |
| **Realms** | `pam` and `pve` are built-ins; nothing custom exists to codify. |
| **Notifications** | The bridged provider exposes no Proxmox VE notification resource. The node stays on its built-in `sendmail` → `root@pam` matcher. |

## Procedures

### Deploy a change

Every procedure below ends in an apply, so this comes first.

**Prerequisite — authenticate as `root@pam` with a password, not an API token.** Unlike every other stack in this
project, this one cannot use a scoped API token: Proxmox VE's ACME endpoints reject token authentication outright,
even a full-privilege token with privilege separation disabled, because they check for a real `root@pam` session. The
credential is passed as environment variables, scoped to the single command that needs it:

```sh
cd projects/chezmoi.sh/src/infrastructure/pulumi

PROXMOX_VE_USERNAME="root@pam" \
PROXMOX_VE_PASSWORD="$(security find-generic-password -a root@pam -s pve-01.pve.chezmoi.sh -w)" \
  mise run pulumi:diff     # preview pending changes

PROXMOX_VE_USERNAME="root@pam" \
PROXMOX_VE_PASSWORD="$(security find-generic-password -a root@pam -s pve-01.pve.chezmoi.sh -w)" \
  mise run pulumi:apply    # apply, then regenerate this document
```

> [!IMPORTANT]
> The password never goes into Pulumi config — not even as `--secret`. `Pulumi.<stack>.yaml` is committed to git, and
> encrypted-at-rest is not the same as safe to commit. Read it from a password manager inline, as above, and never
> `export` it into a long-lived shell. The one-time Keychain setup is in
> [`stack/proxmox/README.md`](../src/infrastructure/pulumi/stack/proxmox/README.md), "Bootstrapping".

Applying also regenerates this document from the resulting state, so it never drifts from what is deployed.

### Rotate the Cloudflare DNS-01 token

The token is owned by the stack, so rotation is a stack operation — not a Cloudflare dashboard one. Tainting marks it
for replacement; the apply that follows mints a fresh token and reconfigures the ACME plugin with it:

```sh
mise run proxmox:acme:rotate
```

The task taints the token and applies in one go. It needs the same credentials as
[Deploy a change](#deploy-a-change), passed the same way.

Revoke the old token in the Cloudflare dashboard once the apply succeeds. Deleting it there _first_ breaks renewals
until the next apply.

### Force a certificate renewal

Proxmox VE renews automatically at 30 days remaining. To re-issue early — after a domain change, or to verify DNS-01
still works following a token rotation:

```sh
pvenode acme cert order --force
journalctl -u pvedaemon -f    # watch the challenge
```

### Add a service identity

Add the role (if no built-in fits), the user, an optional token, and one ACL per grant to
[`stack/proxmox/access.ts`](../src/infrastructure/pulumi/stack/proxmox/access.ts), then apply. Scope every grant to a
pool or a node, never to `/`.

Give the user a `comment`: it is what fills the Purpose column above. An identity declared without one renders blank,
which is the signal to go write it in the code rather than here.

New tokens print their one-time secret in the apply output. It is never shown again and is not recoverable from stack
state.

### Attach a Kubernetes cluster to the SDN

Nothing to do — all Talos clusters share the existing VNet, and the Omni provider identity already holds `SDN.Use` on
it. The cluster's MachineClass references that VNet.

Adding a _new_ VNet instead requires an ACL granting `PVESDNUser` to the Omni identity on it, or the infra provider
cannot attach NICs to guests there. See
[`INF-20260627-00.proxmox-sdn-setup.md`](../../../docs/procedures/infrastructure/INF-20260627-00.proxmox-sdn-setup.md).

### Restore a guest from backup

Backups live on the backup server, not on this host. From the web UI: **Datacenter → Storage → the PBS storage →
Backups**, pick a snapshot, then **Restore**. From the CLI:

```sh
pvesm list <storage>       # find the snapshot
qmrestore <volume> <vmid>  # VM
pct restore <vmid> <volume>  # LXC
```

Restoring requires the datastore's client-side encryption key to be configured on this host. It already is; if the
host was rebuilt, restore that key before anything else or the backups are unreadable.

### Rebuild the host

1. Install Proxmox VE; restore the management address and both bridges per
   [`vlans.md`](../../../docs/network/vlans.md).
2. Restore the PBS datastore encryption key — without it, every backup is unreadable.
3. Re-register the PBS storage, then restore the platform LXCs first: Omni is what rebuilds the Talos clusters.
4. Re-apply this stack (`mise run pulumi:apply`) to recreate roles, identities, ACLs, pools, SDN, and the firewall
   baseline.
5. Re-create the PCI/USB mappings by hand — IOMMU addresses will have changed.

### Import an existing object

When a Proxmox VE object was created by hand and should come under Pulumi without being recreated:

```sh
pulumi import proxmox:index/<type>:<Type> <name> <id>
```

See
[`INF-20260705-00.pulumi-state-and-import.md`](../../../docs/procedures/infrastructure/INF-20260705-00.pulumi-state-and-import.md).

> [!IMPORTANT]
> ACME resources cannot be imported or applied with an API token. Proxmox VE's ACME endpoints reject token
> authentication outright — even a full-privilege one — and require a real `root@pam` password session. See
> [`stack/proxmox/README.md`](../src/infrastructure/pulumi/stack/proxmox/README.md), "Bootstrapping".

## Appendix

### Key terms

- **Node** — one physical Proxmox VE machine. Here there is exactly one; most Proxmox documentation assumes a
  multi-node cluster, and those features (HA, quorum, live migration) do not apply.
- **Resource pool** — a named group of guests and storages. ACLs can be granted on `/pool/<name>`, which turns
  membership into a permission.
- **Realm** — an authentication source. `pam` is the host's Linux users (`root@pam`); `pve` is Proxmox's own internal
  user database, where every service account here lives.
- **API token** — a credential belonging to a user, with its own identity. With _privilege separation_ disabled it
  carries the user's permissions; enabled, it gets only what is granted to the token itself.
- **Bridge (`vmbr*`)** — a virtual switch on the host. A _VLAN-aware_ bridge passes 802.1Q tags through to guests, so
  one bridge can carry several VLANs.
- **SDN zone / VNet / subnet** — Proxmox's software-defined networking: a zone is the backing technology, a VNet a
  virtual network inside it, a subnet its addressing (gateway, DHCP, SNAT). Changes are staged until applied.
- **Security Group** — a named, reusable set of firewall rules a guest references, instead of carrying its own copy.
- **ACME / DNS-01** — the protocol Let's Encrypt uses to issue certificates. DNS-01 proves ownership by writing a DNS
  record, which works for hosts that are not publicly reachable.

### References

- [`stack/proxmox/README.md`](../src/infrastructure/pulumi/stack/proxmox/README.md) — the stack managing this host
- [`PROXMOX_BACKUP_SERVER.md`](./PROXMOX_BACKUP_SERVER.md) — the backup server this host pushes to
- [`TRUENAS.md`](./TRUENAS.md) — the NAS guest running on this host
- [`docs/network/vlans.md`](../../../docs/network/vlans.md) — VLAN layout and address plan (IPAM)
- [ADR-014](../../../docs/decisions/014-network-topology.md) — dual-NIC Talos topology
- [ADR-015](../../../docs/decisions/015-migrate-crossplane-to-pulumi.md) — why VM/LXC lifecycle stays manual
- [`INF-20260627-00.proxmox-sdn-setup.md`](../../../docs/procedures/infrastructure/INF-20260627-00.proxmox-sdn-setup.md) — SDN setup
- [`INF-20260620-00.proxmox-node-exporter.md`](../../../docs/procedures/infrastructure/INF-20260620-00.proxmox-node-exporter.md) — monitoring setup
