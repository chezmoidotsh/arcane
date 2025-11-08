<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo.dark.svg">
      <img alt="Stylized letter 'K' with a futuristic font and a subscript 12, representing Kazimierz·AKN branding" src="./assets/logo.light.svg" width="200">
  </picture>
</h1>

<h4 align="center">Kazimierz·AKN - Public Access Gateway with Pangolin</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](../../LICENSE)

<a href="#about">About</a> · <a href="#services-overview">Services Overview</a> · <a href="#current-project-structure">Project Structure</a> · <a href="#security-considerations">Security Considerations</a> · <a href="#license">License</a>

</div>

***

## About

Kazimierz·AKN is a **public access gateway** powered by [Pangolin](https://digpangolin.com/) and designed to provide secure, easy-to-use access to selected homelab services for family and friends. Named after the knight nation of Kazimierz from Arknights, this project documents the setup and configuration of a VPS-based security gateway that serves as the first line of defense for exposing services to the internet.

### Architecture Overview

The solution is a **single VPS** (no Kubernetes) running Pangolin with integrated security:

**VPS Layer (Hetzner Cloud - Europe)**:

* **Pangolin**: Edge node - Identity-aware reverse proxy with WAF and access control
* **CrowdSec**: Collaborative threat intelligence and intrusion prevention
* **Tailscale**: Mesh VPN for secure SSH access and VPS administration

> **Note**: Initially deployed on Hetzner Cloud for flexibility. After 6 months of validation, potential migration to HostUp for cost optimization (annual commitment).

**Backend Cluster Connection**:

* **Newt**: Pangolin service node running on lungmen.akn cluster
* **WireGuard Tunnel**: Secure, encrypted connection between Pangolin (VPS) and Newt (cluster)
* **Backend Services**: Applications (Jellyfin, Immich, etc.) proxied through Newt

**External Integrations**:

* **auth.chezmoi.sh**: Pocket-ID SSO for authentication
* **Mailjet**: SMTP for notifications and user communications

This architecture provides:

* **Simple access** for non-technical users (browser-only, no client installation required)
* **Strong security** with WAF, rate limiting, and threat intelligence (CrowdSec)
* **Self-hosted control** with no third-party MITM risks (unlike Cloudflare)
* **Isolation** with the VPS as a sacrificial layer that can be compromised without impacting internal infrastructure
* **Simple management** with no Kubernetes overhead on the edge

## Services Overview

![Architecture diagram](./assets/architecture-dark.svg#gh-dark-mode-only)
![Architecture diagram](./assets/architecture-light.svg#gh-light-mode-only)

***

### VPS Components

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/system/pangolin.svg" alt="Pangolin Logo" width="120" align="left" style="margin-right: 16px;">

### [Pangolin](https://pangolin.net/)

Identity-aware reverse proxy with WAF and access control running on a European VPS (Hetzner Cloud). Uses WireGuard tunnels to connect to Newt service nodes in the homelab.

***Why this choice**: Distributed architecture (edge node on VPS + service node in cluster) provides secure connectivity without exposing backend infrastructure. Enterprise-grade security with OIDC integration and Let's Encrypt support.*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/system/pangolin.svg" alt="Newt Logo" width="120" align="right" style="margin-left: 16px;">

### Newt (Pangolin Service Node)

Pangolin service node deployed on lungmen.akn cluster, providing secure tunnel endpoint for backend services.

***Why this choice**: Native Pangolin component that establishes WireGuard tunnel to the edge node, enabling secure application delivery without public IP exposure.*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/crowdsec.svg" alt="CrowdSec Logo" width="120" align="right" style="margin-left: 16px;">

### [CrowdSec](https://crowdsec.net/)

Collaborative intrusion prevention system with behavioral detection and community threat intelligence.

***Why this choice**: Community-driven threat intelligence provides better protection than traditional rule-based systems, with native Pangolin integration.*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/platform/tailscale.svg" alt="Tailscale Logo" width="120" align="left" style="margin-right: 16px;">

### [Tailscale](https://tailscale.com/)

Mesh VPN providing secure SSH access for VPS administration and configuration.

***Why this choice**: Already used across the homelab infrastructure. Provides secure, zero-trust access for VPS management without exposing SSH to the public internet.*

</div>
</div>

<br/><br/>

***

### External Services

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/pocket-id.svg" alt="Pocket-ID Logo" width="120" align="left" style="margin-right: 16px;">

### [Pocket-ID](https://pocket-id.org/) (auth.chezmoi.sh)

OIDC/OAuth2 authentication provider serving as the SSO solution for all publicly exposed services.

***Why this choice**: This is the primary authentication method for all users accessing the gateway.*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/platform/mailjet.svg" alt="Mailjet Logo" width="120" align="right" style="margin-left: 16px;">

### [Mailjet](https://www.mailjet.com/)

Transactional email service used by Pangolin for notifications and user communications.

***Why this choice**: Reliable, cost-effective email delivery with excellent deliverability rates and EU data centers.*

</div>
</div>

<br/><br/>

***

## Current Project Structure

This project contains documentation and configuration for the Pangolin VPS gateway:

```txt
kazimierz.akn/
├── README.md                           # This documentation
├── architecture.d2                     # Architecture diagram source (D2 format)
├── assets/                             # Generated diagrams and assets
│   ├── architecture-dark.svg          # Dark theme architecture diagram
│   └── architecture-light.svg         # Light theme architecture diagram
└── docs/
    └── BOOTSTRAP.md                   # Complete VPS bootstrap procedure
```

## Installation and Setup

The VPS is provisioned and configured using Pangolin's official installer. See [docs/BOOTSTRAP.md](./docs/BOOTSTRAP.md) for the complete bootstrap procedure.

## Security Considerations

> \[!WARNING]
> The VPS is designed to be **sacrificial** and potentially compromisable. It acts as a security buffer to protect internal infrastructure.

### Authentication & Access Control

* **SSO Integration**: All public services authenticate via Pocket-ID (auth.chezmoi.sh)
* **Passkey-first**: Modern, phishing-resistant authentication for users
* **Zero Trust**: Every request validated, no implicit trust
* **Read-only modes**: Where applicable, services exposed with limited permissions
* **SSH Access**: VPS management via Tailscale only, SSH never exposed to public internet

### Data & Secrets Protection

* **No critical data on VPS**: VPS only stores proxy configuration, no application data
* **Stateless proxy**: All requests proxied in real-time, no caching of sensitive data
* **No secrets managed**: No secrets or credentials must be stored on the VPS *(or at least nothing too sensitive)*
* **End-to-end encryption**: TLS from internet → VPS, encrypted VPN → backend

### Sacrificial Design Philosophy

The VPS acts as a **security buffer** - designed to absorb and contain potential attacks without compromising critical homelab infrastructure. Even if fully breached:

* Backend cluster (lungmen.akn, ...) remains protected behind WireGuard tunnel (Pangolin ↔ Newt)
* No sensitive data is exposed (everything proxied in real-time through Newt)
* VPS can be destroyed and recreated quickly from bootstrap documentation
* No Kubernetes complexity means smaller attack surface and easier rebuilds
* Newt provides additional isolation layer between internet and backend services

## License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION]
> This is a personal project intended for my own use. Feel free to explore and use the code,
> but please note that it comes with no warranties or guarantees. Use it at your own risk.
>
> This VPS is specifically designed as a **sacrificial bastion** - it may be compromised
> as part of its security design and should never contain critical data or direct access to
> sensitive systems.
