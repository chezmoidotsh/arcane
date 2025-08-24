<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo.dark.svg">
      <img alt="Stylized logo with traditional Chinese characters 龙门 (Lungmen) and subtitle, representing Lungmen·AKN branding" src="./assets/logo.light.svg" width="200">
  </picture>
</h1>

<h4 align="center">Lungmen·AKN - Home Services Platform</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](../../LICENSE)

<a href="#about">About</a> · <a href="#services-overview">Services Overview</a> · <a href="#how-to-use--how-to-develop-on-it">How to use</a> · <a href="#disaster-recovery-plan-drp">Recovery</a> · <a href="#roadmap">Roadmap</a> · <a href="#license">License</a>

</div>

***

> \[!NOTE]
> **Why Lungmen?** In Arknights lore, Lungmen (龙门) is a prosperous city-state known for its advanced infrastructure, sophisticated urban services, and technological innovation. Just like the fictional city provides comprehensive services to its citizens, this platform delivers all essential home services through modern infrastructure and automation.

## About

Lungmen is a personal self-hosted platform for home services, designed to provide a complete ecosystem for media management, life organization, and automation. The platform runs on a Kubernetes cluster and is accessible through both local network and VPN, allowing secure access to services from anywhere while maintaining control over data and infrastructure.

## Services Overview

![Architecture diagram](./assets/architecture-dark.svg#gh-dark-mode-only)
![Architecture diagram](./assets/architecture-light.svg#gh-light-mode-only)

***

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/jellyfin.svg" alt="Jellyfin Logo" width="120" align="right" style="margin-left: 16px;">

### [Jellyfin](https://jellyfin.org/)

Volunteer-built media solution that puts you in control of your media streaming experience.

***Why this choice**: Open-source alternative to Plex with no premium features locked behind paywalls and complete control over media libraries.*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/jellyseerr.svg" alt="Jellyseerr Logo" width="120" align="left" style="margin-right: 16px;">

### [Jellyseerr](https://github.com/Fallenbagel/jellyseerr)

Free and open source software application for managing requests for media libraries.

***Why this choice**: Seamless integration with Jellyfin for automated media acquisition workflows with user-friendly request interface.*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/immich.svg" alt="Immich Logo" width="120" align="right" style="margin-left: 16px;">

### [Immich](https://immich.app/)

High-performance self-hosted photo and video management solution with mobile app support.

***Why this choice**: Modern Google Photos alternative with AI-powered features, mobile sync, and Cloudflare Tunnel integration for secure external access.*

</div>
</div>

***

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/actual-budget.png" alt="Actual Budget Logo" width="120" align="left" style="margin-right: 16px;">

### [Actual Budget](https://actualbudget.com/)

Personal finance app that helps you track your spending and save money with privacy-first approach.

***Why this choice**: Open-source budgeting tool with local-first data storage, end-to-end encryption, and intuitive envelope budgeting methodology.*

</div>
</div>

<br/><br/>

<!-- trunk-ignore-begin(markdown-link-check/403): Paperless documentation is behind Cloudflare -->

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/paperless.svg" alt="Paperless-ngx Logo" width="120" align="right" style="margin-left: 16px;">

### [Paperless-ngx](https://docs.paperless-ngx.com/)

Document management system to store, search and share documents with OCR and machine learning capabilities.

***Why this choice**: Advanced document digitization with automatic tagging, full-text search, and comprehensive workflow automation for paperless office.*

</div>
</div>

<!-- trunk-ignore-end(markdown-link-check/403) -->

***

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/linkding.svg" alt="Linkding Logo" width="120" align="left" style="margin-right: 16px;">

### [Linkding](https://github.com/sissbruecker/linkding)

Self-hosted bookmarking and link aggregation service with tagging and search capabilities.

***Why this choice**: Minimalist bookmark manager with full-text search, archive integration, and browser extension for seamless link collection.*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/atuin.svg" alt="Atuin Logo" width="120" align="right" style="margin-left: 16px;">

### [Atuin](https://docs.atuin.sh/)

Encrypted shell history sync, storing all your shell commands in one place with powerful search.

***Why this choice**: Enhanced shell history with encryption, synchronization across devices, and intelligent command search with context preservation.*

</div>
</div>

***

## How to use / How to develop on it

This project uses [ArgoCD](https://argoproj.github.io/cd/) for GitOps-based deployment and [Kustomize](https://kustomize.io/) for configuration management. Here's how to work with it:

## Disaster Recovery Plan (DRP)

The recovery process is largely automated through the `amiya.akn` project, which hosts ArgoCD and automatically bootstraps any Kubernetes clusters it detects.

### Recovering process

> \[!NOTE]
> If the system cannot be managed using Talosctl, reboot on a live CD

1. **Reset/Reinstall Talos OS**:

   See [Talos Recovery](https://www.talos.dev/v1.10/advanced/disaster-recovery/) for more information about recovering from a Talos cluster and the [Bootstrap documentation](docs/HOW_TO_BOOTSTRAP.md) for more information about bootstrapping the cluster.

2. **Link to ArgoCD**:

   > \[!NOTE]
   > This is only required if the cluster is not already linked to ArgoCD or if the cluster has been reset.\
   > You also need to have the context `admin@amiya.akn` in your kubeconfig.

   Because this project is designed to be runned in the same "network" as the `amiya.akn` project, we must link the cluster manually to ArgoCD.

   ```bash
   argocd --kube-context admin@akiya.akn cluster add admin@lungmen.akn --name lungmen.akn --label device.tailscale.com/os=linux
   ```

3. **Automatic Detection** - Once the cluster joins the Tailscale mesh, `amiya.akn` detects it automatically

### Manual Verification

* Check cluster status: `kubectl get pods --all-namespaces`
* Verify Tailscale connectivity: `tailscale status`
* Confirm ArgoCD sync status in the `amiya.akn` console

> The entire platform is designed for zero-touch recovery once Tailscale is configured.

## Roadmap

<!-- trunk-ignore-begin(remark-lint/list-item-content-indent) -->

* [x] **Step 0**: Define project scope and architecture
  * [x] List all services to be deployed
  * [x] Create architecture diagram
* [ ] **Step 1**: Initial deployment
  * [ ] Deploy base infrastructure (Talos, Cilium)
  * [ ] Configure core services (External Secrets, DNS, cert-manager)
  * [ ] Deploy Longhorn for distributed storage
  * [ ] Deploy Envoy Gateway as API Gateway
* [ ] **Step 2**: Data Layer
  * [ ] Deploy CloudNativePG operator
  * [ ] Deploy PostgreSQL for application data
* [ ] **Step 3**: Services Deployment
  * [ ] Deploy media services (Jellyfin, Jellyseerr)
  * [ ] Deploy Immich with Cloudflare Tunnel for external access
  * [ ] Deploy life management services (Actual Budget, Paperless-ngx)
  * [ ] Configure n8n for automation
  * [ ] Deploy Linkding for bookmarks
* [ ] **Step 4**: Security and Optimization
  * [ ] Implement network policies
  * [ ] Configure backup solutions
  * [ ] Optimize resource usage

<!-- trunk-ignore-end(remark-lint/list-item-content-indent) -->

## License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION]
> This is a personal project intended for my own use. Feel free to explore and use the code,
> but please note that it comes with no warranties or guarantees. Use it at your own risk.
