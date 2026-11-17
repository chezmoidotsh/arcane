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

`chezmoi.sh` was the root infrastructure project. Its content moved to the fleet layout (see
[Migrer vers la flotte](../../docs/migrations/MIGR-20261114-00-Migrer-vers-la-Flotte.md)): the Pulumi stack
(`chezmoi-sh-infra`, now `base`) to [`fleet/base/`](../../fleet/base/README.md), the Proxmox VE host, the Proxmox Backup
Server, the TrueNAS SCALE NAS and the other LXC appliances to `fleet/hosts/core.*`.

Only the `o11y-datastore` LXC appliance is left here, until step 10 of the migration moves it to `akn.ptilopsis`.

## 📚 Documentation

| Document                                                                              | System                                                                                   |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`fleet/base/README.md`](../../fleet/base/README.md)                                  | The `base` Pulumi stack — parent OCI compartment, Pocket-Id groups, observability tokens |
| [`o11y-datastore/README.md`](src/infrastructure/proxmox/lxc/o11y-datastore/README.md) | The observability LXC appliance (`data.o11y.chezmoi.sh`)                                 |
| [`PROXMOX-VE.md`](../../fleet/hosts/core.pve-01/PROXMOX-VE.md)                        | `pve-01.pve.chezmoi.sh` — the hypervisor: access control, SDN, pools, ACME, firewall     |
| [`PROXMOX_BACKUP_SERVER.md`](../../fleet/hosts/core.pbs/PROXMOX_BACKUP_SERVER.md)     | `pbs.pve.chezmoi.sh` — offsite VM/LXC backups (S3-backed datastore on Backblaze B2)      |
| [`TRUENAS.md`](../../fleet/hosts/core.nas/TRUENAS.md)                                 | `nas.chezmoi.sh` — datasets, shares, permissions, snapshots, offsite sync, Garage        |

## 🏗️ Project structure

| Path                              | Contents                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/infrastructure/proxmox/lxc/` | The `o11y-datastore` LXC appliance (Nix-built) and the shared LXC build library used by every `fleet/hosts/core.*` LXC    |
| `.mise.toml`                      | `pulumi:cloudflare-token:observability`, `pulumi:tailscale-oauth:observability`: copy the `base` outputs into its secrets |
| `.sops.yaml`                      | SOPS rule for the LXC build-time secrets                                                                                  |

## 🛡️ License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION] This is a personal project intended for my own use. Feel free to explore and use the code, but please note
> that it comes with no warranties or guarantees. Use it at your own risk.
