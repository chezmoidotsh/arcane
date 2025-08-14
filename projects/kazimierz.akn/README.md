<h1 align="center">
  Kazimierz · Arknights
</h1>

<h4 align="center">Kazimierz·AKN - Sacrificial Bastion Proxy</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](../../LICENSE)

<a href="#about">About</a> · <a href="#services-overview">Services Overview</a> · <a href="#current-project-structure">Project Structure</a> · <a href="#security-considerations">Security Considerations</a> · <a href="#license">License</a>

</div>

***

## About

Kazimierz·AKN is a **sacrificial bastion proxy** designed to act as a secure gateway between the internet and other homelab clusters. Named after the knight nation of Kazimierz from Arknights, this cluster serves as the first line of defense and reverse proxy for exposing selected services to the internet.

The cluster is intentionally designed to be **compromisable without impacting critical infrastructure**. It acts as a security buffer, ensuring that even if this cluster is breached, other clusters containing sensitive data and critical services remain protected.

## Services Overview

![Architecture diagram](./assets/architecture-dark.svg#gh-dark-mode-only)
![Architecture diagram](./assets/architecture-light.svg#gh-light-mode-only)

***

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/system/cilium.svg" alt="Cilium Logo" width="120" align="left" style="margin-right: 16px;">

### [Cilium](https://cilium.io/)

eBPF-based networking, observability, and security solution for Kubernetes.

***Why this choice**: Advanced networking capabilities with eBPF provide superior performance and security compared to traditional CNI solutions.*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/system/tailscale.svg" alt="Tailscale Logo" width="120" align="right" style="margin-left: 16px;">

### [Tailscale Operator](https://tailscale.com/)

Mesh VPN solution providing secure connectivity between homelab clusters.

***Why this choice**: Already in use across the homelab as the de-facto method for secure inter-cluster connectivity with ACL rules.*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/system/external-secret.svg" alt="External Secrets Operator Logo" width="120" align="left" style="margin-right: 16px;">

### [External Secrets Operator](https://external-secrets.io/)

Integrates external secret management systems with Kubernetes.

***Why this choice**: Industry standard with excellent Kubernetes integration and secure secret management capabilities.*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/system/cert-manager.svg" alt="Cert-Manager Logo" width="120" align="right" style="margin-left: 16px;">

### [Cert-Manager](https://cert-manager.io/)

Kubernetes controller that automates TLS certificate management and renewal.

***Why this choice**: Industry standard for Kubernetes certificate management with robust Let's Encrypt integration and DNS-01 challenge support.*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/system/external-dns.png" alt="ExternalDNS Logo" width="120" align="left" style="margin-right: 16px;">

### [ExternalDNS](https://github.com/kubernetes-sigs/external-dns)

Automatically configures DNS records for services exposed through ingress controllers.

***Why this choice**: Industry standard for automated DNS management with excellent Kubernetes integration.*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/apps/crowdsec.svg" alt="CrowdSec Logo" width="120" align="right" style="margin-left: 16px;">

### [CrowdSec](https://crowdsec.net/)

Collaborative intrusion prevention system with behavioral detection and community threat intelligence.

***Why this choice**: Community-driven threat intelligence provides better protection than traditional rule-based systems, with seamless Traefik integration.*

</div>
</div>

<br/><br/>

<div align="center" style="max-width: 1000px; margin: 0 auto;">
<div align="left">
<img src="../../docs/assets/icons/system/traefik.svg" alt="Traefik Logo" width="120" align="left" style="margin-right: 16px;">

### [Traefik](https://traefik.io/)

Modern reverse proxy and load balancer serving as the main entry point from the internet.

***Why this choice**: Gateway-capable proxy with excellent Kubernetes integration, middleware support for CrowdSec and Coraza WAF.*

</div>
</div>

***

## Current Project Structure

The project is currently in its initial phase with the following structure:

```txt
kazimierz.akn/
├── README.md                           # This documentation
├── architecture.d2                     # Architecture diagram source
├── assets/                             # Generated assets (will be created)
├── src/
│   ├── seed.application.yaml          # ArgoCD seed application
│   └── infrastructure/
│       └── kubernetes/
│           └── envoy-gateway/
│               └── override.helmvalues.yaml  # Disables Envoy Gateway
```

## Integration with ArgoCD

This cluster will be automatically discovered and managed by the ArgoCD instance running on `amiya.akn` through cluster-based ApplicationSets. The system components will be deployed automatically, with custom overrides applied where needed (such as disabling Envoy Gateway in favor of Traefik).

## Security Considerations

> \[!WARNING]
> This cluster is designed to be **sacrificial** and potentially compromisable.

### Isolation & Segmentation

* **Network policies**: All services protected with Cilium NetworkPolicies for microsegmentation
* **Network segmentation**: Cluster has no direct access to internal networks
* **Tailscale mesh**: All backend services accessed via encrypted VPN, never directly

### Data & Secrets Protection

* **No critical data storage**: No persistent volumes containing sensitive information
* **Secrets isolation**: All secrets retrieved from external systems (amiya.akn/OpenBao), not stored locally
* **Minimal attack surface**: Only essential services for proxying and security

### Sacrificial Design Philosophy

* The cluster acts as a **security buffer** - designed to absorb and contain potential attacks without compromising critical homelab infrastructure. Even if fully breached, sensitive systems **should** remain protected.

## License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION]
> This is a personal project intended for my own use. Feel free to explore and use the code,
> but please note that it comes with no warranties or guarantees. Use it at your own risk.
>
> This cluster is specifically designed as a **sacrificial bastion** - it may be compromised
> as part of its security design and should never contain critical data or direct access to
> sensitive systems.
