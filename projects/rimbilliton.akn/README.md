<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/logo.dark.svg">
      <img alt="Stylized letter 'R' with a futuristic font and a subscript 11, representing Rimbilliton·AKN branding" src="./docs/assets/logo.light.svg" width="200">
  </picture>
</h1>

<h4 align="center">Rimbilliton·AKN - Minecraft Server with Crafty Controller</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git&logoColor=white&logoWidth=20)](../../LICENSE)

<a href="#about">About</a> · <a href="#services-overview">Services Overview</a> ·
<a href="#current-project-structure">Project Structure</a> · <a href="#security-considerations">Security
Considerations</a> · <a href="#license">License</a>

</div>

---

## About

Rimbilliton·AKN is a **Minecraft Java server** declared entirely as code and running on a single OCI Always Free ARM
instance. Named after Rim Billiton, the mining city from Arknights, this project documents the setup of a NixOS host
that runs [Crafty Controller](https://craftycontrol.com/) as its management interface, protected by Pocket-ID SSO, with
daily off-site backups to Backblaze B2.

### Architecture Overview

The solution is a **single VM** (no Kubernetes) provisioned by Pulumi and configured by NixOS:

**VM Layer (Oracle Cloud Infrastructure - eu-paris-1, Always Free ARM)**:

- **NixOS**: Installed over a bootstrap Ubuntu image with `nixos-anywhere`, fully declarative
- **Crafty Controller**: Web UI to create, run and back up Minecraft servers (Podman container)
- **Caddy + oauth2-proxy**: TLS and OIDC gate in front of Crafty, restricted to the Pocket-ID `admin` group
- **restic**: Daily encrypted backups of Crafty archives to Backblaze B2
- **Tailscale**: Mesh VPN for SSH access and deployments
- **Pulumi**: Provisions the OCI compartment, dedicated VCN/subnet/NSG, the instance, DNS records, the B2 bucket and the
  Pocket-ID OIDC client

This architecture provides:

- **Declarative setup** from the cloud resources down to the OS, rebuildable from this repository
- **SSO-protected administration** with admins managed in Pocket-ID
- **Free hosting** within the Always Free quota (1 OCPU / 6 GB, shared with kazimierz.akn)
- **Resilient data** with backups outside OCI, so losing the VM never loses the world

## Services Overview

![Architecture diagram](./docs/assets/architecture-dark.svg#gh-dark-mode-only)
![Architecture diagram](./docs/assets/architecture-light.svg#gh-light-mode-only)

---

### VM Components

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">

### [Crafty Controller](https://craftycontrol.com/)

Web-based Minecraft server manager: server creation (Paper, Fabric, ...), console, file manager, scheduled backups and
per-user permissions. Runs as a Podman container, listening on loopback only.

**\*Why this choice**: Best fit among the panels evaluated for a single self-hosted server. It has no native OIDC, so
SSO is enforced in front of it (see [Security Considerations](#security-considerations)).\*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/caddy.svg" alt="Caddy Logo" width="120" align="right" style="margin-left: 16px;">

### [Caddy](https://caddyserver.com/)

HTTP reverse proxy with automatic Let's Encrypt certificates (HTTP-01), exposing the panel on `minecraft.chezmoi.sh`.

**\*Why this choice**: Native NixOS module and zero-config TLS.\*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">

### [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/)

OIDC authentication proxy between Caddy and Crafty. Only members of the Pocket-ID `admin` group get through.

**\*Why this choice**: Adds SSO to an application without OIDC support, with a native NixOS module.\*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">

### [restic](https://restic.net/)

Encrypted, deduplicated backups of Crafty's backup archives and configuration to Backblaze B2 every day (7 daily, 4
weekly, 6 monthly snapshots kept).

**\*Why this choice**: Native S3 support (B2 compatible), and it ships the consistent archives Crafty produces rather
than snapshotting a live world.\*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/platform/tailscale.svg" alt="Tailscale Logo" width="120" align="left" style="margin-right: 16px;">

### [Tailscale](https://tailscale.com/)

Mesh VPN providing SSH access and `nixos-rebuild` deployments. SSH is closed on the OCI network security group.

**\*Why this choice**: Already used across the homelab, and keeps the VM free of any public management surface.\*

</div>
</div>

<br/><br/>

---

### External Services

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/pocket-id.svg" alt="Pocket-ID Logo" width="120" align="right" style="margin-left: 16px;">

### [Pocket-ID](https://pocket-id.org/) (auth.chezmoi.sh)

OIDC/OAuth2 provider serving as the SSO solution for the admin panel.

**\*Why this choice**: This is the single identity provider of the homelab.\*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">

### [Backblaze B2](https://www.backblaze.com/cloud-storage)

S3-compatible object storage holding the restic repository, in a private bucket with a key scoped to that bucket only.

**\*Why this choice**: Cheap, already used for the Proxmox Backup Server datastore, and independent from OCI.\*

</div>
</div>

<br/><br/>

---

## Current Project Structure

This project contains documentation and infrastructure-as-code (Pulumi and NixOS) for the Minecraft server:

```txt
rimbilliton.akn/
├── README.md                                   # This documentation
├── architecture.d2                             # Architecture diagram source (D2 format)
├── docs/
│   ├── assets/                                 # Generated diagrams and assets
│   │   ├── architecture-dark.svg               # Dark theme architecture diagram
│   │   ├── architecture-light.svg              # Light theme architecture diagram
│   │   ├── logo.dark.svg                       # Dark theme logo
│   │   └── logo.light.svg                      # Light theme logo
│   └── BOOTSTRAP.md                            # Complete bootstrap procedure
└── src/
    └── infrastructure/
        ├── nixos/                              # NixOS flake (infrastructure-as-code)
        │   ├── flake.nix                       # Inputs and host definition
        │   ├── disko.nix                       # Disk layout
        │   ├── configuration.nix               # Base system (boot, network, SSH, Tailscale, sops)
        │   ├── modules/
        │   │   ├── crafty.nix                  # Crafty Controller container
        │   │   ├── sso.nix                     # Caddy + oauth2-proxy (Pocket-ID)
        │   │   └── backup.nix                  # restic to Backblaze B2
        │   └── secrets/                        # SOPS secrets (template only)
        └── pulumi/                             # Provisions the OCI VM, network, DNS, B2 and SSO client
            └── stack/
                ├── oci/                        # Compartment, VCN/NSG, instance
                ├── backblaze.ts                # Backup bucket and scoped key
                ├── dns.ts                      # Cloudflare DNS records
                ├── pocket-id.ts                # OIDC client for the admin panel
                └── tailscale.ts                # First-boot auth key
```

## Installation and Setup

The OCI resources are provisioned first via the Pulumi stack in `src/infrastructure/pulumi/`. NixOS is then installed
over the bootstrap image and managed with `nixos-rebuild` from then on:

```bash
nix run github:nix-community/nixos-anywhere -- --flake ./src/infrastructure/nixos#rimbilliton \
  --extra-files ./src/infrastructure/nixos/extra --target-host ubuntu@<public-ip>
```

See [docs/BOOTSTRAP.md](./docs/BOOTSTRAP.md) for the complete bootstrap procedure.

## Security Considerations

> \[!NOTE] Crafty Controller has no native OIDC support that could be confirmed. SSO is enforced in front of the panel,
> which keeps its own local login behind it.

### Authentication & Access Control

- **SSO Integration**: The admin panel is only reachable through Pocket-ID (auth.chezmoi.sh), `admin` group only
- **SSH Access**: VM management via Tailscale only, SSH never exposed to the public internet
- **Exposed ports**: 25565 (Minecraft), 80 and 443 (Caddy) only, on both IPv4 and IPv6

### Data & Secrets Protection

- **Secrets**: SOPS + age (sops-nix), nothing in plaintext in Git
- **Backups**: Encrypted client-side by restic, stored in a private B2 bucket with a bucket-scoped key
- **Isolation**: Dedicated OCI compartment and VCN, separate from kazimierz.akn

## License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION] This is a personal project intended for my own use. Feel free to explore and use the code, but please note
> that it comes with no warranties or guarantees. Use it at your own risk.
