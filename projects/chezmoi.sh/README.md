<h1 align="center">
  Root <sub>(chezmoi.sh)</sub>
</h1>

<h4 align="center">chezmoi.sh - Root project</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git&logoColor=white&logoWidth=20)](../../LICENSE)

<!-- trunk-ignore-begin(markdown-link-check/404) -->

<a href="#ℹ%EF%B8%8F-about">About</a> · <a href="#-documentation">Documentation</a> ·
<a href="#-project-structure">Project structure</a> · <a href="#%EF%B8%8F-license">License</a>

<!-- trunk-ignore-end(markdown-link-check/404) -->

</div>

---

## ℹ️ About

`chezmoi.sh` is the root infrastructure project: everything the homelab's clusters sit on top of, managed as code. It
owns the physical-adjacent layer — the Proxmox VE hypervisor's configuration, the Proxmox Backup Server, the TrueNAS
SCALE NAS — plus the shared cloud resources (Cloudflare, Tailscale, Backblaze B2) and the platform LXC appliances (Omni,
observability, OCI registry) every other project depends on.

The backbone is the [`chezmoi-sh-infra`](src/infrastructure/pulumi/README.md) Pulumi stack. Its state lives in the
Garage S3 backend on the NAS (see
[`INF-20260705-00.pulumi-state-and-import.md`](../../docs/procedures/infrastructure/INF-20260705-00.pulumi-state-and-import.md)),
and applying it regenerates the reference documents below, so they never drift from what is deployed.

> \[!NOTE] Even if this project is the "root" one, it relies on the [`amiya.akn`](../amiya.akn/README.md) project to
> provide the Kubernetes cluster used by `OpenBao` and `Pulumi` _(IaC)_.

## 📚 Documentation

Start here — one auto-generated reference per managed system, each with its own quick-reference table and procedures:

| Document                                                         | System                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`docs/PROXMOX-VE.md`](docs/PROXMOX-VE.md)                       | `pve-01.pve.chezmoi.sh` — the hypervisor: access control, SDN, pools, ACME, firewall |
| [`docs/PROXMOX_BACKUP_SERVER.md`](docs/PROXMOX_BACKUP_SERVER.md) | `pbs.pve.chezmoi.sh` — offsite VM/LXC backups (S3-backed datastore on Backblaze B2)  |
| [`docs/TRUENAS.md`](docs/TRUENAS.md)                             | `nas.chezmoi.sh` — datasets, shares, permissions, snapshots, offsite sync, Garage    |

These three files are **generated from the live Pulumi state** (`toolbox/*-docs/` in the stack) — never edit them by
hand; `mise run pulumi:apply` regenerates them automatically.

For the code behind them:

- [`src/infrastructure/pulumi/README.md`](src/infrastructure/pulumi/README.md) — the stack itself, directory layout,
  tasks
- [`src/infrastructure/pulumi/stack/proxmox/README.md`](src/infrastructure/pulumi/stack/proxmox/README.md) — Proxmox VE
  scope, access model, bootstrapping (incl. the `root@pam` Keychain setup)
- [`src/infrastructure/pulumi/stack/proxmox-backup-server/README.md`](src/infrastructure/pulumi/stack/proxmox-backup-server/README.md)
  — PBS scope, datastore architecture, bootstrapping (incl. the client-side encryption key)
- [`src/infrastructure/pulumi/stack/truenas/README.md`](src/infrastructure/pulumi/stack/truenas/README.md) — TrueNAS
  scope and conventions

## 🏗️ Project structure

| Path                              | Contents                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/infrastructure/pulumi/`      | The `chezmoi-sh-infra` Pulumi stack — Proxmox VE, PBS, TrueNAS, cloud tokens — and the doc generators                       |
| `src/infrastructure/proxmox/lxc/` | Platform LXC appliances (Nix-built): `omni`, `omni-infra-provider-proxmox`, `observability`, `oci-registry`, `pve-exporter` |
| `src/infrastructure/omni/`        | Omni machine classes for the Talos clusters                                                                                 |
| `src/infrastructure/ansible/`     | **Legacy** — superseded by the Pulumi stack (see below)                                                                     |
| `docs/`                           | The generated reference documents above                                                                                     |
| `dist/`                           | Rendered outputs (regenerate with `dist:render`, never edit)                                                                |

### Legacy: Ansible TrueNAS collection

`src/infrastructure/ansible/` (the `chezmoidotsh.truenas.scale` collection and the `ansible:truenas*` mise tasks) was
the previous management path for the NAS. It has been **superseded by the Pulumi stack**
([`stack/truenas/`](src/infrastructure/pulumi/stack/truenas/README.md)) and is kept only as reference until it is
removed — do not use it to configure the NAS, and do not add new roles to it. [`docs/TRUENAS.md`](docs/TRUENAS.md) is
the single source of truth for how the NAS is managed today.

## 🛡️ License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION] This is a personal project intended for my own use. Feel free to explore and use the code, but please note
> that it comes with no warranties or guarantees. Use it at your own risk.
