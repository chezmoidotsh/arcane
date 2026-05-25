# Procedures

This directory contains Standard Operating Procedures (SOPs) for various tasks within the project. These documents provide step-by-step instructions to ensure consistency, security, and reliability across operations.

Each procedure is designed to be a clear and actionable guide for a specific technical process, suitable for execution by either a human operator or an AI agent.

## Available Procedures

### Security

* **[SEC-20250808-00: Add OIDC SecurityPolicy to an HTTPRoute](./security/SEC-20250808-00.add-securitypolicy-on-httproute.md)**: Details how to secure an application exposed via a Kubernetes `HTTPRoute` with OIDC authentication using Envoy Gateway, Authelia, and Vault.

### Infrastructure

* **[INF-20260525-00: Upgrade Talos OS on a Single-Node Cluster](./infrastructure/INF-20260525-00.upgrade-talos.md)**: Full lifecycle upgrade of the Talos OS version on a single-node cluster, including pre-upgrade checks, image pre-pull, upgrade execution, post-upgrade verification, and rollback.
* **[INF-20260525-01: Upgrade Kubernetes on a Talos Single-Node Cluster](./infrastructure/INF-20260525-01.upgrade-kubernetes.md)**: Kubernetes version upgrade using `talosctl upgrade-k8s`, covering the six-phase upgrade process with dry-run validation, post-upgrade verification, and interrupted-upgrade recovery.
* **[Bootstrap VPS with Pangolin and CrowdSec](../../projects/kazimierz.akn/docs/bootstrap-vps.md)**: Complete bootstrap process for deploying a VPS with Pangolin VPN and CrowdSec security monitoring using Tailscale for secure remote access.
* **[Add Site to Pangolin VPN](../../projects/kazimierz.akn/docs/add-site-to-pangolin.md)**: Expose applications and services through Pangolin VPN using Helm or Kustomize deployments.
* **[Configure Watchtower for Automatic Updates](../../projects/kazimierz.akn/docs/configure-watchtower.md)**: Add and configure Watchtower for automatic Docker container updates with docker-compose compatibility.
