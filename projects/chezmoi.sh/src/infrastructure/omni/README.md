# `omni` — Talos machine classes (as-code)

Declarative [Omni machine classes][omni-mc] for the homelab, applied to the
Omni instance at `https://omni.chezmoi.sh` via `omnictl`. Each class is an
auto-provisioning template the [Proxmox infra provider][provider] turns into a
Talos VM when Omni scales a cluster.

The provider and Omni instance themselves are deployed as Proxmox LXCs — see
[`../proxmox/lxc/omni/`](../proxmox/lxc/omni/) (Omni + Dex + Caddy) and
[`../proxmox/lxc/omni-infra-provider-proxmox/`][provider] (the provider that
creates the VMs). This directory is only the **fleet sizing catalog**.

## Table of contents

1. [Naming convention](#naming-convention)
2. [Class catalog](#class-catalog)
3. [Control-plane caveat (2 GiB)](#control-plane-caveat-2-gib)
4. [Provider data](#provider-data)
5. [Applying changes](#applying-changes)
6. [Using a class in a cluster](#using-a-class-in-a-cluster)
7. [Adding or resizing a class](#adding-or-resizing-a-class)

## Naming convention

AWS-style instance types — `<family><generation>.<size>`:

```text
w1.xlarge
│ │   └── small · medium · large · xlarge · 2xlarge …   (size on the ladder)
│ └── generation (bump to c2/w2 if the host CPU or tuning baseline changes)
└── family:  c → control plane (compute-lean, low RAM)
             w → worker        (balanced, RAM-heavy)
```

As in AWS, **family and size both carry meaning**: the `c1` family runs lean on
RAM (etcd + API server need cores more than memory), while the `w1` family is
balanced (`vCPU ≈ RAM / 2 GiB`). A given size label therefore maps to different
RAM across families — `c1.small` is 1 GiB, the smallest worker is `w1.medium`.

## Class catalog

The host has 32 threads / 125 GiB RAM and already runs `tal01` (16c / 32 GiB),
so the catalog is sized for the \~90 GiB of headroom that remains.

| Class       | vCPU | RAM    | Disk¹ | Intended for                                        |
| ----------- | ---- | ------ | ----- | --------------------------------------------------- |
| `c1.small`  | 2    | 2 GiB  | 32 GB | Single-node control plane (see caveat below)        |
| `w1.medium` | 2    | 4 GiB  | 32 GB | Light — Argo, ingress, small services (amiya-style) |
| `w1.large`  | 4    | 8 GiB  | 32 GB | General-purpose, mixed workloads                    |
| `w1.xlarge` | 8    | 16 GiB | 32 GB | Heavy — databases, costly services (lungmen-style)  |

The next worker rung is **`w1.2xlarge`** (16 vCPU / 32 GiB) — not shipped yet;
add it when a workload actually needs it (the host has \~90 GiB of headroom).

¹ Disk is **fixed at 32 GB on every class for now** — deliberately uniform, not
scaled with the tier. It is root/ephemeral storage on `nvme-lvm` only (Talos
system partitions + container images + `emptyDir` overhead); **persistent
volumes are out of scope** and come from the Proxmox CSI driver, not the node
disk. The thin LVM pool is sparse, so 32 GB is a ceiling, not a reservation —
bump `disk_size` per class if a node starts filling its ephemeral partition.

## Control-plane caveat (2 GiB)

`c1.small` runs at **2 GiB** — the provider's enforced minimum (`minimum: 2048`
in the Proxmox infra provider schema). This is still below Sidero's recommended
etcd floor (4 GiB comfortable), but is an accepted trade-off for a quiet homelab
mono-CP. Know the failure mode:

* etcd is memory-hungry during **compaction, defrag, and snapshot restore** —
  on 2 GiB it can get OOM-killed exactly when you need it (e.g. recovery).
* It is fine for a **single** control-plane node. Do **not** reuse `c1.small`
  for an HA (3-node) control plane — add a `c1.medium`/`c1.large` class
  (4–8 GiB) for that.

If the CP ever feels tight, bump `memory` in `machineclasses/c1.small.yaml` and
re-apply; Omni rolls new nodes with the updated size.

## Provider data

Every class targets the `pve-01.pve.chezmoi.sh` provider and shares the same
Proxmox tuning. The rationale for each field lives in the provider README's
[field reference][field-ref] — the highlights:

| Field              | Value                                             | Why                                                                                                                                                            |
| ------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pool`             | `talos`                                           | Mandatory — the `omni@pve` ACL only authorizes this pool.                                                                                                      |
| `storage_selector` | `name == "nvme-lvm"`                              | Only image-capable storage on this host.                                                                                                                       |
| `network_bridge`   | `vmbr1`                                           | VLAN-aware guest bridge.                                                                                                                                       |
| `vlan`             | `2`                                               | Talos VLAN (LXCs use VLAN 5).                                                                                                                                  |
| `cpu_type`         | `x86-64-v3`                                       | Matches `tal01`.                                                                                                                                               |
| `disk_*`           | SSD / discard / iothread / io\_uring / cache=none | NVMe-optimised.                                                                                                                                                |
| `tags`             | role, class name                                  | Proxmox UI filtering. `talos` and `omni` are added automatically by the provider; only role (`control-plane`/`worker`) and class (`c1.small`, …) are set here. |

> **`pool: talos` is non-negotiable.** A class without it fails provisioning
> with a Proxmox 403 — the provider's ACL is scoped to `/pool/talos`.

## Applying changes

`omnictl` reads `OMNICONFIG` (set by `.mise.toml` to
`.mise/omni/omniconfig.yaml`). From `projects/chezmoi.sh/`:

```sh
mise run omni:machineclass:diff    # dry-run — preview, changes nothing
mise run omni:machineclass:apply   # apply every class in machineclasses/
mise run omni:machineclass:list    # show what Omni currently has
```

`omnictl apply` is idempotent and recursive over the directory, so adding a
file and re-running `apply` is the whole workflow. Equivalent raw command:

```sh
omnictl apply --file src/infrastructure/omni/machineclasses
```

## Using a class in a cluster

Machine classes are **not** intrinsically control plane or worker — the role is
assigned when you build the cluster. In the Omni UI (or a cluster template),
point the **control-plane** machine set at `c1.small` and each **worker**
machine set at the tier you need (`w1.medium` / `w1.large` / `w1.xlarge`). Omni
then calls the provider to auto-provision VMs matching that class.

## Adding or resizing a class

1. Copy an existing file in `machineclasses/`, change `metadata.id` (and the
   filename to match) and the `memory` / `cores` / `disk_size` in `providerdata`.
2. Keep the naming convention (`<family><gen>.<size>`) and the family ratio
   (`w1` ≈ `vCPU = RAM / 2 GiB`).
3. `mise run omni:machineclass:diff` to preview, then `:apply`.

Advanced provider fields (`sockets`, `numa`, `hugepages`, `balloon`,
`pci_devices`, `additional_disks`, `additional_nics`) exist in the [provider
schema][provider] for special cases such as GPU passthrough — keep them out of
the base catalog and add a dedicated class instead.

[omni-mc]: https://docs.siderolabs.com/omni/how-to-guides/create-a-machine-class/

[provider]: ../proxmox/lxc/omni-infra-provider-proxmox/

[field-ref]: ../proxmox/lxc/omni-infra-provider-proxmox/README.md#field-reference
