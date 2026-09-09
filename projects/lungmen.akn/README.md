<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/logo.dark.svg">
      <img alt="Stylized logo with traditional Chinese characters 龙门 (Lungmen) and subtitle, representing Lungmen·AKN branding" src="./docs/assets/logo.light.svg" width="200">
  </picture>
</h1>

<h4 align="center">Lungmen·AKN - Home Services Platform</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git&logoColor=white&logoWidth=20)](../../LICENSE)

<a href="#about">About</a> · <a href="#services-overview">Services</a> · <a href="#usage-and-development">Usage</a> ·
<a href="#disaster-recovery">Recovery</a> · <a href="#license">License</a>

</div>

---

> \[!NOTE] **Why Lungmen?** In Arknights lore, Lungmen (龙门) is a prosperous city-state known for its advanced
> infrastructure, sophisticated urban services, and technological innovation. Just like the fictional city provides
> comprehensive services to its citizens, this platform delivers all essential home services through modern
> infrastructure and automation.

## About

Lungmen is a personal self-hosted platform for home services, designed to provide a complete ecosystem for media
management, life organization, and automation. The platform runs on a Kubernetes cluster and is accessible through both
local network and VPN, allowing secure access to services from anywhere while maintaining control over data and
infrastructure.

## Services Overview

![Architecture diagram](./docs/assets/architecture.svg)

---

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/jellyfin.svg" alt="Jellyfin Logo" width="120" align="right" style="margin-left: 16px;">

### [Jellyfin](https://jellyfin.org/)

Volunteer-built media solution that puts you in control of your media streaming experience.

**\*Why this choice**: Open-source alternative to Plex with no premium features locked behind paywalls and complete
control over media libraries.\*

</div>
</div>

<br/><br/>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/immich.svg" alt="Immich Logo" width="120" align="right" style="margin-left: 16px;">

### [Immich](https://immich.app/)

High-performance self-hosted photo and video management solution with mobile app support.

**\*Why this choice**: Modern Google Photos alternative with AI-powered features, mobile sync, and secure external
access via Pangolin/Newt.\*

</div>
</div>

---

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/actual-budget.png" alt="Actual Budget Logo" width="120" align="left" style="margin-right: 16px;">

### [Actual Budget](https://actualbudget.com/)

Personal finance app that helps you track your spending and save money with privacy-first approach.

**\*Why this choice**: Open-source budgeting tool with local-first data storage, end-to-end encryption, and intuitive
envelope budgeting methodology.\*

</div>
</div>

<br/><br/>

<br/><br/>

<!-- trunk-ignore-begin(markdown-link-check/403): Paperless documentation is behind Cloudflare -->

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/paperless.svg" alt="Paperless-ngx Logo" width="120" align="right" style="margin-left: 16px;">

### [Paperless-ngx](https://docs.paperless-ngx.com/)

Document management system to store, search and share documents with OCR and machine learning capabilities.

**\*Why this choice**: Advanced document digitization with automatic tagging, full-text search, and comprehensive
workflow automation for paperless office.\*

</div>
</div>

<!-- trunk-ignore-end(markdown-link-check/403) -->

---

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/linkding.svg" alt="Linkding Logo" width="120" align="left" style="margin-right: 16px;">

### [Linkding](https://github.com/sissbruecker/linkding)

Self-hosted bookmarking and link aggregation service with tagging and search capabilities.

**\*Why this choice**: Minimalist bookmark manager with full-text search, archive integration, and browser extension for
seamless link collection.\*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/spoolman.svg" alt="Spoolman Logo" width="120" align="right" style="margin-left: 16px;">

### [Spoolman](https://github.com/Donkie/Spoolman)

Filament inventory tracker for 3D printing, keeping stock levels and usage in one place.

**\*Why this choice**: Self-hosted, printer-agnostic spool tracking with a simple REST API other tools (slicers, printer
front-ends) can integrate against.\*

</div>
</div>

---

## Usage and Development

This project uses [ArgoCD](https://argoproj.github.io/cd/) for GitOps-based deployment and
[Kustomize](https://kustomize.io/) for configuration management.

Application and infrastructure manifests are hand-written under `src/apps/` and `src/infrastructure/`, then rendered
into `dist/` via `dist:render` — **never hand-edit `dist/`**. ArgoCD syncs `dist/`, not `src/`, to the cluster. To add
or modify a service, update the corresponding sources under `src/`, run `dist:render`, and let ArgoCD pick up the
change. See [`src/apps/`](./src/apps/) for the current, authoritative app inventory — this README highlights a subset
and may lag behind additions/removals there.

## Disaster Recovery

lungmen.akn is provisioned through [Sidero Omni](https://omni.siderolabs.com) and registers as a GitOps **spoke** into
the ArgoCD hub hosted on `rhodes.akn` — it does not run its own ArgoCD instance.

### Recovery Process

See the [Bootstrap documentation](./docs/HOW_TO_BOOTSTRAP.md) for the full, step-by-step Omni-based provisioning
procedure, including cluster identity, machine classes, and registering the cluster into `rhodes.akn`'s ArgoCD.

### Manual Verification

- Check cluster status: `kubectl get pods --all-namespaces`
- Confirm ArgoCD sync status in the `rhodes.akn`-hosted ArgoCD console

## License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION] This is a personal project intended for my own use. Feel free to explore and use the code, but please note
> that it comes with no warranties or guarantees. Use it at your own risk.
