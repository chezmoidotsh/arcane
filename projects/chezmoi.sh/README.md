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
[`INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md`](../../docs/procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md)),
and applying it regenerates the reference documents below, so they never drift from what is deployed.

> \[!NOTE] Even if this project is the "root" one, it relies on the [`rhodes.akn`](../rhodes.akn/README.md) project to
> provide the Kubernetes cluster used by `OpenBao` and `Pulumi` _(IaC)_.

## 📚 Documentation

Start here — one auto-generated reference per managed system, each with its own quick-reference table and procedures:

| Document                                                                          | System                                                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`PROXMOX-VE.md`](../../fleet/hosts/core.pve-01/PROXMOX-VE.md)                    | `pve-01.pve.chezmoi.sh` — the hypervisor: access control, SDN, pools, ACME, firewall |
| [`PROXMOX_BACKUP_SERVER.md`](../../fleet/hosts/core.pbs/PROXMOX_BACKUP_SERVER.md) | `pbs.pve.chezmoi.sh` — offsite VM/LXC backups (S3-backed datastore on Backblaze B2)  |
| [`TRUENAS.md`](../../fleet/hosts/core.nas/TRUENAS.md)                             | `nas.chezmoi.sh` — datasets, shares, permissions, snapshots, offsite sync, Garage    |

These three files are **generated from the live Pulumi state** (`pulumi/toolbox/*-docs/` of each host) — never edit them
by hand; `mise run pulumi:apply` in the host's `pulumi/` regenerates them automatically.

For the code behind them:

- [`src/infrastructure/pulumi/README.md`](src/infrastructure/pulumi/README.md) — the stack itself, directory layout,
  tasks
- [`fleet/hosts/core.pve-01/README.md`](../../fleet/hosts/core.pve-01/README.md) (project `pve-01-core`) — Proxmox VE
  scope, access model, bootstrapping (incl. the `root@pam` Keychain setup), files installed on the node
- [`fleet/hosts/core.pbs/README.md`](../../fleet/hosts/core.pbs/README.md) (project `pbs-core`) — PBS scope, datastore
  architecture, bootstrapping (incl. the client-side encryption key)
- [`fleet/hosts/core.nas/README.md`](../../fleet/hosts/core.nas/README.md) (project `nas-core`) — TrueNAS scope and
  conventions

## 🏗️ Project structure

| Path                              | Contents                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/infrastructure/pulumi/`      | The `chezmoi-sh-infra` Pulumi stack — cloud tokens, parent OCI compartment, Pocket-Id groups                                        |
| `src/infrastructure/proxmox/lxc/` | The `o11y-datastore` LXC appliance (Nix-built) and the shared LXC build library; the other appliances moved to `fleet/hosts/core.*` |
| `docs/`                           | Icons used by the generated reference documents above                                                                               |
| `dist/`                           | Rendered outputs (regenerate with `dist:render`, never edit)                                                                        |

## 🛡️ License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION] This is a personal project intended for my own use. Feel free to explore and use the code, but please note
> that it comes with no warranties or guarantees. Use it at your own risk.
