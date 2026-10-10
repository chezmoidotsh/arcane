<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/logo.dark.svg">
      <img alt="Stylized letter 'K' with a futuristic font and a subscript 12, representing Kazimierz·AKN branding" src="./docs/assets/logo.light.svg" width="200">
  </picture>
</h1>

<h4 align="center">Kazimierz·AKN - Public Access Gateway with Pangolin</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git&logoColor=white&logoWidth=20)](../../LICENSE)

<a href="#about">About</a> · <a href="#services-overview">Services Overview</a> ·
<a href="#current-project-structure">Project Structure</a> · <a href="#security-considerations">Security
Considerations</a> · <a href="#license">License</a>

</div>

---

## About

Kazimierz·AKN is a **public access gateway** powered by [Pangolin](https://digpangolin.com/) and designed to provide
secure, easy-to-use access to selected homelab services for family and friends. Named after the knight nation of
Kazimierz from Arknights, this project documents the setup and configuration of a VPS-based security gateway that serves
as the first line of defense for exposing services to the internet.

### Architecture Overview

The solution is a **single VPS** (no Kubernetes) running Pangolin with integrated security:

**VPS Layer (Oracle Cloud Infrastructure - eu-paris-1, Always Free ARM)**:

- **Pangolin**: Tunneled reverse proxy controller with web dashboard
- **Gerbil**: WireGuard tunnel manager (site/client tunnels)
- **Traefik**: HTTP reverse proxy with automatic Let's Encrypt SSL
- **Tailscale**: Mesh VPN for secure SSH access and monitoring
- **Ansible**: Configuration management, run remotely over SSH from an operator machine
- **Pulumi**: Provisions the OCI instance, network (VCN/NSG), and DNS records the VPS runs on

> **Note**: The instance/network itself (compartment, VCN, instance, DNS) is provisioned by a separate Pulumi stack --
> see `src/infrastructure/pulumi/`. No WAF/IPS layer runs on Traefik; Pangolin's own access controls (including its
> GeoIP-based geoblocking) provide edge protection instead (see
> [roles/pangolin/README.md](./src/infrastructure/ansible/roles/pangolin/README.md)).

**Backend Cluster Connection**:

- **Newt**: Pangolin service node running on lungmen.akn cluster
- **WireGuard Site Tunnel**: Secure, encrypted connection between Gerbil (VPS) and Newt (cluster) via UDP 51820
- **Backend Services**: Applications (Jellyfin, Immich, etc.) proxied through Newt
- **Client Tunnels**: Optional WireGuard client connections via UDP 21820 for direct access

**External Integrations**:

- **auth.chezmoi.sh**: Pocket-ID SSO for authentication
- **Mailjet**: SMTP for notifications and user communications

This architecture provides:

- **Simple access** for non-technical users (browser-only, no client installation required)
- **Strong security** with automated SSL, GeoIP geoblocking, and Pangolin's own identity-aware access control
- **Self-hosted control** with no third-party MITM risks (Cloudflare's only role is issuing the DNS-01 token for
  wildcard TLS certs -- it never proxies traffic)
- **Isolation** with the VPS as a sacrificial layer that can be compromised without impacting internal infrastructure
- **Simple management** with no Kubernetes overhead on the edge
- **Declarative configuration** with Ansible, versioned in Git and applied by re-running the playbook

## Services Overview

![Architecture diagram](./docs/assets/architecture-dark.svg#gh-dark-mode-only)
![Architecture diagram](./docs/assets/architecture-light.svg#gh-light-mode-only)

---

### VPS Components

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/system/pangolin.svg" alt="Pangolin Logo" width="120" align="left" style="margin-right: 16px;">

### [Pangolin](https://pangolin.net/)

Self-hosted tunneled reverse proxy controller with web dashboard for account and tunnel management. Provides
identity-aware access control and integrates with Gerbil for WireGuard tunnel orchestration.

**\*Why this choice**: Distributed architecture (edge node on VPS + service node in cluster) provides secure
connectivity without exposing backend infrastructure. Enterprise-grade security with OIDC integration and organization
management.\*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/system/pangolin.svg" alt="Gerbil Logo" width="120" align="right" style="margin-left: 16px;">

### Gerbil (WireGuard Manager)

WireGuard tunnel manager that establishes secure site tunnels (UDP 51820) and client tunnels (UDP 21820). Auto-generates
and manages WireGuard keys, syncing configuration with the Pangolin controller.

**\*Why this choice**: Native Pangolin component that handles all WireGuard complexity, enabling secure encrypted
tunnels to backend services without manual key management.\*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/system/traefik.svg" alt="Traefik Logo" width="120" align="left" style="margin-right: 16px;">

### [Traefik](https://traefik.io/)

Modern HTTP reverse proxy and load balancer with automatic Let's Encrypt SSL certificate management and dynamic routing
configuration in front of Pangolin.

**\*Why this choice**: Dynamic configuration updates without restarts, and native Let's Encrypt integration (HTTP-01
per-domain by default, or a DNS-01 wildcard cert via Cloudflare). Well-suited for managing multiple domains with
automated SSL.\*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/platform/tailscale.svg" alt="Tailscale Logo" width="120" align="left" style="margin-right: 16px;">

### [Tailscale](https://tailscale.com/)

Mesh VPN providing secure SSH access for VPS administration and configuration. Also re-exposes Pangolin's Integration
API on the tailnet via Tailscale Serve, so the Pulumi stacks can reach it without a public endpoint.

**\*Why this choice**: Already used across the homelab infrastructure. Provides secure, zero-trust access for VPS
management without exposing SSH to the public internet. Tailscale Serve keeps the Integration API off the public
internet.\*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/ansible.svg" alt="Ansible Logo" width="120" align="right" style="margin-left: 16px;">

### [Ansible](https://www.ansible.com/)

Configuration management run remotely over SSH from an operator machine (`ansible-playbook`). Configuration lives in Git
and is applied idempotently by re-running the playbook.

**\*Why this choice**: Agentless and simple, no external CI/CD infrastructure and nothing running on the VPS to keep the
configuration in sync.\*

</div>
</div>

<br/><br/>

---

### External Services

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/pocket-id.svg" alt="Pocket-ID Logo" width="120" align="left" style="margin-right: 16px;">

### [Pocket-ID](https://pocket-id.org/) (auth.chezmoi.sh)

OIDC/OAuth2 authentication provider serving as the SSO solution for all publicly exposed services.

**\*Why this choice**: This is the primary authentication method for all users accessing the gateway.\*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/platform/mailjet.svg" alt="Mailjet Logo" width="120" align="right" style="margin-left: 16px;">

### [Mailjet](https://www.mailjet.com/)

Transactional email service used by Pangolin for notifications and user communications.

**\*Why this choice**: Reliable, cost-effective email delivery with excellent deliverability rates and EU data
centers.\*

</div>
</div>

<br/><br/>

---

## Current Project Structure

This project contains documentation, infrastructure-as-code (Ansible), and configuration for the Pangolin VPS gateway:

```txt
kazimierz.akn/
├── README.md                                   # This documentation
├── architecture.d2                             # Architecture diagram source (D2 format)
├── docs/
│   ├── assets/                                 # Generated diagrams and assets
│   │   ├── architecture-dark.svg               # Dark theme architecture diagram
│   │   └── architecture-light.svg              # Light theme architecture diagram
│   ├── BOOTSTRAP.md                            # Complete VPS bootstrap procedure
│   └── archives/                               # Historical documents
│       ├── CROWDSEC-INTEGRATION.md             # CrowdSec integration (tried and dropped)
│       └── REFLEXION-KUBERNETES-DEPLOYMENT.md  # Initial architecture decisions
└── src/
    └── infrastructure/
        ├── ansible/                            # Ansible infrastructure-as-code
        │   ├── site.yml                        # Main playbook (2 steps)
        │   ├── requirements.yml                # External roles and collections
        │   ├── inventory/
        │   │   ├── local.yml                   # Local inventory (run the playbook on the host)
        │   │   ├── remote.yml                  # Remote inventory (manual deployment)
        │   │   └── host_vars/
        │   │       └── kazimierz.yml           # Host-specific variables (vault-encrypted)
        │   └── roles/
        │       ├── system_setup/               # Base system (Docker, Tailscale, UFW, etc.)
        │       └── pangolin/                   # Pangolin stack (Pangolin, Gerbil, Traefik)
        └── pulumi/                             # Provisions the OCI instance, network and DNS
            └── stack/
                ├── oci/                        # Compartment, VCN/NSG, instance, DNS records
                ├── pangolin/                    # Pangolin dashboard OIDC IdP/org/role
                └── pocket-id/                   # Pocket-ID side of the Pangolin SSO client
```

## Installation and Setup

The OCI instance and network are provisioned first via the Pulumi stack in `src/infrastructure/pulumi/`. The VPS itself
is then configured using Ansible, run remotely over SSH from a machine with access to the VPS (the vault password is
stored sops-encrypted in `src/infrastructure/ansible/.vault-password.sops`):

```bash
export ANSIBLE_VAULT_PASSWORD="$(sops --decrypt projects/kazimierz.akn/src/infrastructure/ansible/.vault-password.sops)"
cd projects/kazimierz.akn/src/infrastructure/ansible
ansible-playbook -i inventory/remote.yml site.yml --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")
```

Configuration changes are applied by re-running this command; nothing syncs automatically.

The NixOS definition that replaces this setup is described in [docs/BOOTSTRAP.md](./docs/BOOTSTRAP.md) (fresh install)
and [docs/MIGRATION_NIXOS.md](./docs/MIGRATION_NIXOS.md) (cutover of the running host). See
[src/infrastructure/ansible/README.md](./src/infrastructure/ansible/README.md) for the full Ansible architecture until
then.

## Security Considerations

> \[!WARNING] The VPS is designed to be **sacrificial** and potentially compromisable. It acts as a security buffer to
> protect internal infrastructure.

### Authentication & Access Control

- **SSO Integration**: All public services authenticate via Pocket-ID (auth.chezmoi.sh)
- **Passkey-first**: Modern, phishing-resistant authentication for users
- **Zero Trust**: Every request validated, no implicit trust
- **Read-only modes**: Where applicable, services exposed with limited permissions
- **SSH Access**: VPS management via Tailscale only, SSH never exposed to public internet

### Data & Secrets Protection

- **No critical data on VPS**: VPS only stores proxy configuration, no application data
- **Stateless proxy**: All requests proxied in real-time, no caching of sensitive data
- **No secrets managed**: No secrets or credentials must be stored on the VPS _(or at least nothing too sensitive)_
- **End-to-end encryption**: TLS from internet → VPS, encrypted VPN → backend

### Sacrificial Design Philosophy

The VPS acts as a **security buffer** - designed to absorb and contain potential attacks without compromising critical
homelab infrastructure. Even if fully breached:

- Backend cluster (lungmen.akn, ...) remains protected behind WireGuard tunnel (Pangolin ↔ Newt)
- No sensitive data is exposed (everything proxied in real-time through Newt)
- VPS can be destroyed and recreated quickly from bootstrap documentation
- No Kubernetes complexity means smaller attack surface and easier rebuilds
- Newt provides additional isolation layer between internet and backend services

## License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION] This is a personal project intended for my own use. Feel free to explore and use the code, but please note
> that it comes with no warranties or guarantees. Use it at your own risk.
>
> This VPS is specifically designed as a **sacrificial bastion** - it may be compromised as part of its security design
> and should never contain critical data or direct access to sensitive systems.
