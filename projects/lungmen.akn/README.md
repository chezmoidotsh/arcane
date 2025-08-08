<h1 align="center">
  「 龙门 」 <sub>(Lungmen)</sub>
</h1>

<h4 align="center">Lungmen - Home Services Platform</h4>

<div align='center'>
  <a href="#about">About</a> · <a href="#architecture">Architecture</a> · <a href="#how-to-use--how-to-develop-on-it">How to use</a> · <a href="#disaster-recovery-plan-drp">Recovery</a> · <a href="#roadmap">Roadmap</a> · <a href="#license">License</a>
</div>

***

> \[!NOTE]
> **Why Lungmen?** In Arknights lore, Lungmen (龙门) is a prosperous city-state known for its advanced infrastructure, sophisticated urban services, and technological innovation. Just like the fictional city provides comprehensive services to its citizens, this platform delivers all essential home services through modern infrastructure and automation.

## About

Lungmen is a personal self-hosted platform for home services, designed to provide a complete ecosystem for media management, life organization, and automation. The platform runs on a Kubernetes cluster and is accessible through both local network and VPN, allowing secure access to services from anywhere while maintaining control over data and infrastructure.

## Architecture

![Architecture diagram](./assets/architecture.svg)

### 🏗️ Platform-required Services

* **[cert-manager](https://cert-manager.io/)**: Certificate automation. <br/>
  Automatic provisioning and management of TLS certificates in Kubernetes.

* **[Cilium](https://cilium.io/)**: Container Network Interface (CNI). <br/>
  Advanced networking, security policies, and observability for Kubernetes clusters.

* **[CloudNativePG](https://cloudnativepg.io/)**: PostgreSQL operator. <br/>
  Comprehensive platform designed to seamlessly manage PostgreSQL databases within Kubernetes environments.

* **[Cloudflare Operator](https://github.com/adyanth/cloudflare-operator)**: Cloudflare tunnel operator. <br/>
  Kubernetes operator for managing Cloudflare tunnels, providing secure external access without VPN.

* **[Envoy Gateway](https://gateway.envoyproxy.io/)**: Cloud-native API Gateway. <br/>
  Envoy-based gateway with Kubernetes Gateway API support, optimized for service routing.

* **[External DNS](https://github.com/kubernetes-sigs/external-dns)**: DNS automation. <br/>
  Automatically configures DNS records for Kubernetes services.

* **[External Secrets](https://external-secrets.io/)**: Secrets management operator. <br/>
  Kubernetes operator that integrates external secret management systems.

* **[Longhorn](https://longhorn.io/)**: Distributed block storage. <br/>
  Lightweight, reliable, and powerful distributed block storage system for Kubernetes.

* **[Tailscale](https://tailscale.com/)**: Mesh VPN network. <br/>
  Zero-config VPN mesh for secure remote access to the entire platform.

### 📺 Media Services

* **[Jellyfin](https://jellyfin.org/)**: Media server. <br/>
  Volunteer-built media solution that puts you in control of your media.

* **[Jellyseerr](https://github.com/Fallenbagel/jellyseerr)**: Media requests. <br/>
  Free and open source software application for managing requests for media libraries.

* **[Immich](https://immich.app/)**: Photo and video management. <br/>
  High-performance self-hosted photo and video management solution with mobile app support. Accessible via Cloudflare Tunnel for secure external access.

### 🏠 Life Management

* **[Actual Budget](https://actualbudget.com/)**: Budget management. <br/>
  Personal finance app that helps you track your spending and save money.

<!-- trunk-ignore-begin(markdown-link-check/403): Paperless documentation is behind Cloudflare -->

* **[Paperless-ngx](https://docs.paperless-ngx.com/)**: Document management. <br/>
  Document management system to store, search and share documents.

<!-- trunk-ignore-end(markdown-link-check/403) -->

### 📦 Others

* **[Linkding](https://github.com/sissbruecker/linkding)**: Bookmarking service. <br/>
  Self-hosted bookmarking and link aggregation service.

* **[Atuin](https://docs.atuin.sh/)**: Shell history sync. <br/>
  Encrypted shell history sync, storing all your shell commands in one place.

* **[TaskChampion](https://github.com/GothenburgBitFactory/taskchampion-sync-server)**: Task management sync. <br/>
  Sync server for TaskWarrior, a modern task management system.

## How to use / How to develop on it

This project uses [ArgoCD](https://argoproj.github.io/cd/) for GitOps-based deployment and [Kustomize](https://kustomize.io/) for configuration management. Here's how to work with it:

## Disaster Recovery Plan (DRP)

The recovery process is largely automated through the `amiya.akn` project, which hosts ArgoCD and automatically bootstraps any Kubernetes clusters it detects.

### Recovering process

> \[!NOTE]
> If the system cannot be managed using Talosctl, reboot on a live CD

1. **Reset/Reinstall Talos OS**:

   See [Talos Recovery](https://www.talos.dev/v1.10/advanced/disaster-recovery/) for more information about recovering from a Talos cluster and the [Talos Bootstrap documentation](docs/BOOTSTRAP_TALOS.md) for more information about bootstrapping the cluster.

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
