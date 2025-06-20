<!-- markdownlint-disable MD033 -->

<h1 align="center">
「 Shodan 」<sub>(Sentient Hyper-Optimized Data Access Network)</sub>
</h1>

<h4 align="center">Shodan - AI Services Platform</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](../../LICENSE)

<!-- trunk-ignore-begin(markdown-link-check/404) -->

<a href="#ℹ%EF%B8%8F-about">About</a> · <a href="#%EF%B8%8F-architecture">Architecture</a> · <a href="#-how-to-use--how-to-develop-on-it">How to use</a> · <a href="#-recovery--bootstrap">Recovery</a> · <a href="#%EF%B8%8F-roadmap">Roadmap</a> · <a href="#%EF%B8%8F-license">License</a>

<!-- trunk-ignore-end(markdown-link-check/404) -->

</div>

***

## ℹ️ About

Shodan[^1] is a personal self-hosted platform for AI services, designed to reduce costs and keep sensitive data private. While I'll still use external LLM providers (ChatGPT/Claude/Mistral) for cost-effectiveness, this platform hosts everything else: RAG systems, MCP servers, automation workflows, and other AI tooling.

The platform runs on a VM with Talos OS and is accessible through VPN, allowing me to use these tools from anywhere while maintaining control over my data and infrastructure.

> For sensitive data processing, I have a separate Ollama instance running locally on a Mac Mini, but that's outside the scope of this platform.

## 🏗️ Architecture

![Architecture diagram](./assets/architecture.svg)

### 🏗️ Platform Infrastructure

* **[Cilium](https://cilium.io/)**: Container Network Interface (CNI). <br/>
  Advanced networking, security policies, and observability for Kubernetes clusters.

* **[Tailscale](https://tailscale.com/)**: Mesh VPN network. <br/>
  Zero-config VPN mesh for secure remote access to the entire platform.

* **[External Secrets](https://external-secrets.io/)**: Secrets management operator. <br/>
  Kubernetes operator that integrates external secret management systems.

* **[External DNS](https://github.com/kubernetes-sigs/external-dns)**: DNS automation. <br/>
  Automatically configures DNS records for Kubernetes services.

* **[cert-manager](https://cert-manager.io/)**: Certificate automation. <br/>
  Automatic provisioning and management of TLS certificates in Kubernetes.

* **[kgateway](https://github.com/kgateway-dev/kgateway)**: Cloud-native API Gateway and AI Gateway. <br/>
  Envoy-based gateway with Kubernetes Gateway API support, optimized for AI workloads and LLM routing.

* **[Longhorn](https://longhorn.io/)**: Distributed block storage. <br/>
  Lightweight, reliable, and powerful distributed block storage system for Kubernetes.

* **[CloudNativePG](https://cloudnativepg.io/)**: PostgreSQL operator. <br/>
  Comprehensive platform designed to seamlessly manage PostgreSQL databases within Kubernetes environments.

### 🤖 AI Infrastructure

* **[OpenWebUI](https://github.com/open-webui/open-webui)**: Web interface for LLM interactions. <br/>
  Extensible, feature-rich, and user-friendly self-hosted WebUI designed to operate entirely offline.

* **[AgentGateway](https://github.com/agentgateway/agentgateway)**: MCP Gateway for AI agents. <br/>
  Unified gateway for routing requests to Model Control Protocol (MCP) servers.

* **[n8n](https://n8n.io/)**: Workflow automation platform. <br/>
  Fair-code licensed workflow automation tool for connecting AI services and external APIs.

* **MCP Servers**: Various AI tools and integrations. <br/>
  [Collection of MCP servers](https://glama.ai/mcp/servers) for specific AI tasks and external service integrations.

### 🗄️ Data & Storage

* **[PostgreSQL](https://www.postgresql.org/)** with **[pgvector](https://github.com/pgvector/pgvector)**: Vector database for RAG. <br/>
  Open-source vector similarity search for storing and querying AI embeddings, managed by CloudNativePG operator.

* **[Longhorn](https://longhorn.io/)**: Persistent volume storage. <br/>
  Provides reliable distributed block storage for all stateful applications and database persistence.

## 🚀 How to use / How to develop on it

This project uses [ArgoCD](https://argoproj.github.io/cd/) for GitOps-based deployment and [Kustomize](https://kustomize.io/) for configuration management. Here's how to work with it:

### Development Workflow

1. **Clone the repository**:
   ```bash
   git clone https://github.com/chezmoidotsh/arcane.git
   cd arcane/projects/shodan.akn
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

## 💀 Disaster Recovery Plan (DRP)

The recovery process is largely automated through the `amiya.akn` project, which hosts ArgoCD and automatically bootstraps any Kubernetes clusters it detects in the Tailscale mesh.

### Automated Recovery Process

> \[!NOTE]
> If the system cannot be managed using Talosctl, reboot on a live CD

1. **Reset/Reinstall Talos OS**:
   ```bash
   # If the system is still accessible
   talosctl reset --nodes $TALOS_NODE_IP --endpoints $TALOS_NODE_IP --graceful=false --reboot

   # Otherwise, reinstall from ISO/PXE and bootstrap the cluster
   talosctl bootstrap --nodes $TALOS_NODE_IP --endpoints $TALOS_NODE_IP
   ```

2. **Install Tailscale Operator** - the only manual step required:
   ```bash
   # Install via Helm
   helm repo add tailscale https://pkgs.tailscale.com/helmcharts
   helm upgrade --install tailscale-operator tailscale/tailscale-operator \
     --namespace=tailscale --create-namespace \
     --set-string oauth.clientId="<OAuth client ID>" \
     --set-string oauth.clientSecret="<OAuth client secret>" \
     --wait
   ```

3. **Automatic Detection** - Once the cluster joins the Tailscale mesh, `amiya.akn` detects it automatically

4. **Auto-Bootstrap** - ArgoCD deploys all applications and configurations via GitOps

### Manual Verification

* Check cluster status: `kubectl get pods --all-namespaces`
* Verify Tailscale connectivity: `tailscale status`
* Confirm ArgoCD sync status in the `amiya.akn` console

> The entire platform is designed for zero-touch recovery once Tailscale is configured.

## 🗺️ Roadmap

<!-- trunk-ignore-begin(remark-lint/list-item-content-indent) -->

* [x] **Step 0**: Define project scope and architecture
  * [x] List all AI services to be deployed
  * [x] Create architecture diagram
* [ ] **Step 1**: Initial deployment
  * [ ] Deploy base infrastructure (Talos, Cilium)
  * [ ] Configure core services (External Secrets, DNS, cert-manager)
  * [ ] Deploy Longhorn for distributed storage
  * [ ] Deploy kgateway as API/AI Gateway
* [ ] **Step 2**: Data Layer
  * [ ] Deploy CloudNativePG operator
  * [ ] Deploy PostgreSQL with pgvector for vector storage
* [ ] **Step 3**: AI Services Deployment
  * [ ] Deploy OpenWebUI for LLM interactions
  * [ ] Set up AgentGateway for MCP routing
  * [ ] Configure n8n for AI workflows
  * [ ] Deploy selected MCP servers
* [ ] **Step 4**: Security and Optimization
  * [ ] Implement network policies
  * [ ] Configure backup solutions
  * [ ] Optimize resource usage

<!-- trunk-ignore-end(remark-lint/list-item-content-indent) -->

## 🛡️ License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION]
> This is a personal project intended for my own use. Feel free to explore and use the code,
> but please note that it comes with no warranties or guarantees. Use it at your own risk.

[^1]: SHODAN is a fictional AI from the System Shock series of video games, known for its advanced capabilities and complex personality. This project takes inspiration from its name and concept while focusing on practical AI service deployment.
