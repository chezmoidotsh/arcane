<!-- markdownlint-disable MD033 -->

<h1 align="center">
  Amiya · Arknights <sub>(Amiya · AKN)</sub>
</h1>

<h4 align="center">Amiya·AKN - Mission-critical services</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](../../LICENSE)

<!-- trunk-ignore-begin(markdown-link-check/404) -->

<a href="#ℹ%EF%B8%8F-about">About</a> · <a href="#%EF%B8%8F-mission-critical-services">Services</a> · <a href="#-how-to-use--how-to-develop-on-it">How to use</a> · <a href="#-disaster-recovery-plan-drp">Disaster Recovery Plan (DRP)</a> · <a href="#%EF%B8%8F-roadmap">Roadmap</a> · <a href="#%EF%B8%8F-license">License</a>

<!-- trunk-ignore-end(markdown-link-check/404) -->

</div>

***

## ℹ️ About

Amiya·AKN is a project that aims to transform a mini PC into the most critical component of my homelab.
This project integrates several essential components to allow other projects to be deployed and managed securely,
without[^1] the need of third-party services.

## 🛠️ Mission-Critical services

![Architecture diagram](./assets/architecture.svg)

### 🌐 Infrastructure

* **ArgoCD**: GitOps-based deployment tool for Kubernetes. <br/>
  **Why is it mission-critical?** It ensures that all services are deployed and managed in a declarative way, making it easier to maintain and recover from failures.

* **Crossplane**: Infrastructure as Code (IaC) tool for Kubernetes. <br/>
  **Why is it mission-critical?** It provides a way to manage cloud/3rd party services using the same IaC tools, ensuring consistency and auditability.

* **Talos Omni** *(not deployed)*: Platform for managing Talos Linux clusters. <br/>
  **Why is it mission-critical?** It provides a simplified interface for managing the underlying Talos Linux cluster, ensuring proper cluster operations and maintenance.

### 🔐 Authentication and Authorization

* **Authelia**: Centralized authentication with 2FA and SSO support. <br/>
  **Why is it mission-critical?** It provides a centralized authentication system that can be used by other services in the homelab and ensures that all services are secure.

* **yaLDAP**: Modern LDAP server. <br/>
  **Why is it mission-critical?** It provides a centralized directory service for user management and authentication.

* **SmallStep CA** *(not deployed)*: Zero-trust certificate authority. <br/>
  **Why is it mission-critical?** It provides a secure way to manage and issue TLS certificates for all services, ensuring secure communication between components.

### 🗄️ Storage

* **MinIO** *(not deployed)*: S3-compatible object storage. <br/>
  **Why is it mission-critical?** It provides a local S3-compatible storage for backups and other objects, ensuring data availability even when external services are down.

* **zot registry** *(not deployed)*: Docker image registry. <br/>
  **Why is it mission-critical?** It stores all Docker images used by other services locally, ensuring that services can be deployed even when external registries are unavailable.

### 📦 Others

* **Glance**: Home dashboard. <br/>
  **Why is it mission-critical?** It provides a single page with all services and their status, making it easier to monitor and manage the homelab.

## 🚀 How to use / How to develop on it

This project uses [ArgoCD](https://argoproj.github.io/cd/) for GitOps-based deployment and [Kustomize](https://kustomize.io/) for configuration management. Here's how to work with it:

### Development Workflow

1. **Clone the repository**:
   ```bash
   git clone https://github.com/chezmoi-sh/atlas.git
   cd atlas/projects/amiya.akn
   ```

2. **Make changes to application configurations**:
   * All applications are defined in the `src/apps/` directory
   * Each application has its own Kustomize base and overlays

3. **Test your changes locally**:
   ```bash
   # Validate Kustomize build
   kubectl kustomize src/apps/your-app/overlays/dev --enable-helm

   # Validate against the live cluster (if you have access)
   kubectl kustomize src/apps/your-app/overlays/dev --enable-helm | kubectl apply --dry-run=server -f -
   ```

4. **Commit and push your changes**:
   ```bash
   git add .
   git commit -m "feat(app): your descriptive commit message"
   git push
   ```

5. **ArgoCD will automatically detect and apply changes** to the cluster based on the configured sync policies.

### Adding a New Application

1. Create a new directory in `src/apps/` with the following structure:
   ```text
   src/apps/new-app/
   ├── base/
   │   ├── kustomization.yaml
   │   └── [app manifests]
   └── overlays/
       ├── dev/
       │   └── kustomization.yaml
       └── prod/
           └── kustomization.yaml
   ```

2. Create an ArgoCD Application manifest in `src/apps/argocd/applications/`:
   ```yaml
   apiVersion: argoproj.io/v1alpha1
   kind: Application
   metadata:
     name: new-app
     namespace: argocd
   spec:
     project: default
     source:
       repoURL: https://github.com/chezmoi-sh/atlas.git
       targetRevision: HEAD
       path: projects/amiya.akn/src/apps/new-app/overlays/prod
     destination:
       server: https://kubernetes.default.svc
       namespace: new-app
     syncPolicy:
       automated:
         prune: true
         selfHeal: true
   ```

For more detailed information about the setup, refer to the [bootstrap documentation](./docs/BOOTSTRAP_ARGOCD.md).

## 💀 Disaster Recovery Plan (DRP)

In case of a disaster requiring complete system recovery, follow these steps:

### 1. Reset the Talos system

> \[!WARNING]
> If the system cannot be managed using Talosctl, reboot on a live CD

1. Reset the system using the following command:
   ```bash
   talosctl reset --nodes $TALOS_NODE_IP --endpoints $TALOS_NODE_IP --graceful=false --wipe-mode all --reboot
   ```

### 2. Reinstall the Base Operating System

First, reinstall Talos Linux on the mini PC following the instructions in [BOOTSTRAP\_TALOS.md](./docs/BOOTSTRAP_TALOS.md):

1. Apply the Talos configuration to the node
2. Bootstrap the Talos cluster
3. Retrieve the kubeconfig file

### 3. Restore Core Services

Once the base cluster is running, restore ArgoCD and core applications:

1. Create necessary secrets for ArgoCD (GitHub integration, SOPS keys)
2. Deploy ArgoCD using the bootstrap kustomization as detailed in [BOOTSTRAP\_ARGOCD.md](./docs/BOOTSTRAP_ARGOCD.md)
3. Access ArgoCD UI and ensure applications are syncing properly

### 4. Verify Recovery

1. Check that core services are functioning properly:
   ```bash
   kubectl get pods --all-namespaces
   ```
2. Verify networking components (AdGuard Home, Tailscale) are operational
3. Test authentication services (Authelia, yaLDAP)
4. Confirm storage services are available and populated

For detailed step-by-step recovery procedures, refer to the bootstrap documentation in the `docs/` directory.

## 🗺️ Roadmap

* \[X] **Step 0**: Think of what this project should host.
  * \[X] List all services that should be deployed on this project.
  * \[X] Create a diagram of the architecture.
* \[X] **Step 1**: Install all services on the mini PC in a "dirty" way.
  * \[X] Configure the system by hand (no automation).
  * \[X] Install and configure the k3s cluster.
  * \[ ] ~~Install and configure all services using only raw Kubernetes manifests~~.
  * \[X] Install and configure all services using raw Kubernetes manifests or public Helm Charts.
* \[ ] **Step 2**: Improve quality and security.
  * \[X] Configure k3s to use the ZOT registry as mirror/proxy for all images[^2].
  * \[ ] Make my own images for all services.
  * \[ ] Develop my own Helm charts for all services.
  * \[ ] ... probably more, but I don't know yet.

## 🛡️ License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION]
> This is a personal project intended for my own use. Feel free to explore and use the code,
> but please note that it comes with no warranties or guarantees. Use it at your own risk.

[^1]: Except for TailScale and SMTP services, which are used for external communication. However, these services are
    optional and everything *should* work without them.

[^2]: See for more details <https://docs.k3s.io/installation/private-registry>.
