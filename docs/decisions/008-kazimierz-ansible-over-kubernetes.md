---
status: "implemented"
date: 2025-10-31
implementation-completed: 2025-11-15
decision-makers: ["Alexandre"]
consulted: ["ai/claude-4.5-sonnet"]
informed: []
---

# `kazimierz`.AKN: Ansible + Docker Compose over Kubernetes

## Table of Contents

* [Context and Problem Statement](#context-and-problem-statement)
* [Decision Drivers](#decision-drivers)
  * [Functional Requirements](#functional-requirements)
  * [Non-Functional Requirements](#non-functional-requirements)
  * [Constraints](#constraints)
* [Considered Options](#considered-options)
  * [Option 1: Full Kubernetes Stack (Initial Attempts)](#option-1-full-kubernetes-stack-initial-attempts)
    * [Technology Stack](#technology-stack)
  * [Option 2: Ansible + Docker Compose](#option-2-ansible--docker-compose)
    * [Technology Stack (Ansible)](#technology-stack-ansible)
* [Decision Outcome](#decision-outcome)
  * [Rationale](#rationale)
    * [1. Pangolin Architecture Alignment](#1-pangolin-architecture-alignment)
    * [2. Gerbil Network Requirements](#2-gerbil-network-requirements)
    * [3. No Component Reusability](#3-no-component-reusability)
    * [4. Standalone ArgoCD Resource Waste](#4-standalone-argocd-resource-waste)
    * [5. Operational Context Mismatch](#5-operational-context-mismatch)
* [Consequences \[Optional\]](#consequences-optional)
  * [Positive](#positive)
  * [Negative](#negative)
  * [Neutral](#neutral)
* [Implementation Details / Status \[Optional\]](#implementation-details--status-optional)
  * [Configuration Management Tool Selection](#configuration-management-tool-selection)
  * [GitOps Automation Model](#gitops-automation-model)
  * [Deployment Components](#deployment-components)
  * [Risks and Mitigations](#risks-and-mitigations)
* [Decision Evolution \[Optional\]](#decision-evolution-optional)
  * [Implementation Challenges Encountered (8 major iterations)](#implementation-challenges-encountered-8-major-iterations)
  * [Lessons Learned](#lessons-learned)
    * [When Kubernetes Makes Sense](#when-kubernetes-makes-sense)
    * [When Docker Compose + Ansible Makes Sense](#when-docker-compose--ansible-makes-sense)
* [References and Related Decisions \[Optional\]](#references-and-related-decisions-optional)
* [Changelog](#changelog)

## Context and Problem Statement

`kazimierz`.AKN is a VPS-based public gateway that runs Pangolin (reverse proxy with WAF) to provide secure access to homelab services. The infrastructure question is: should this deployment use Kubernetes (consistent with other Arcane clusters like `amiya` and `lungmen`) or adopt a simpler Docker Compose + Ansible approach?

Multiple attempts were made to deploy Pangolin on Kubernetes with various configurations (FluxCD or ArgoCD, with CNPG and/or cert-manager), but each iteration added complexity without clear benefits for this specific use case. The deployment environment presents unique constraints:

* **Single-application focus**: Pangolin reverse proxy as the primary workload
* **Resource limitations**: VPS with 4GB RAM total
* **Public-facing exposure**: Direct internet access requiring robust security posture
* **Isolation from homelab**: No direct network connectivity to internal clusters
* **Sacrificial infrastructure**: Designed to be quickly destroyed and rebuilt if compromised

The core question is whether consistency with other clusters justifies the operational overhead of Kubernetes for this specific deployment scenario.

## Decision Drivers

### Functional Requirements

* **Application Deployment**: Must support Pangolin reverse proxy with WAF capabilities
* **WireGuard Tunnel Management**: Gerbil requires IPTables manipulation for tunnel routing
* **GitOps Workflow**: Declarative infrastructure management from Git repository
* **Rapid Recovery**: Quick rebuild capability following security incidents

### Non-Functional Requirements

* **Resource Efficiency**: Minimize memory and CPU overhead for single-application deployment
* **Operational Simplicity**: Reduce debugging complexity and maintenance overhead
* **Upstream Alignment**: Follow official deployment patterns from upstream projects
* **Maintainability**: Enable single-operator management

### Constraints

* **VPS Resources**: 4GB RAM, limited CPU allocation
* **Operating System**: OS natively available on the VPS provider (commonly Ubuntu Server, different from Talos Linux used in other clusters)
* **Network Architecture**: Public internet exposure with WireGuard tunnels to homelab
* **Standalone Infrastructure**: No centralized ArgoCD management from `amiya` cluster

## Considered Options

### Option 1: Full Kubernetes Stack (Initial Attempts)

Deploy Pangolin on Kubernetes using industry-standard orchestration patterns consistent with other Arcane clusters.

#### Technology Stack

* **Kubernetes Distribution**: K3s (lightweight) or Talos Linux (immutable OS)

* **GitOps Controller**: FluxCD or ArgoCD for declarative deployments

* **Database**: CloudNative-PG (CNPG) operator for PostgreSQL

* **Certificate Management**: cert-manager with Let's Encrypt integration

* **Networking**: Kubernetes Services with hostNetwork privileges for Gerbil

* **Application Deployment**: Custom Kubernetes manifests or Helm charts for Pangolin

* `+` **Architectural Consistency**: Same deployment patterns as `amiya` and `lungmen` clusters

* `+` **Kubernetes Tooling**: Native kubectl, Helm, Kustomize workflow

* `+` **Resource Management**: Kubernetes scheduler for resource allocation and limits

* `+` **Health Monitoring**: Built-in liveness and readiness probes

* `+` **GitOps Native**: ArgoCD or FluxCD for declarative infrastructure

* `+` **Standardized Debugging**: Kubernetes-native troubleshooting tools

* `-` **Resource Overhead**: Kubernetes control plane consumes \~1GB RAM (25% of VPS capacity) and \~700MB RAM for ArgoCD managing single application

* `-` **Upstream Deviation**: Pangolin lacks official Kubernetes deployment (no Helm chart)

* `-` **Network Abstraction Bypass**: Gerbil requires `hostNetwork: true`, defeating Kubernetes networking benefits

* `-` **OS Inconsistency**: Ubuntu on `kazimierz` vs Talos Linux on other clusters

* `-` **Zero Component Reuse**: No shared infrastructure components with other clusters

* `-` **Maintenance Burden**: Custom manifests diverge from upstream Pangolin updates

* `-` **Complexity Overhead**: Multiple layers (K8s + Docker + Compose) for single-app deployment

### Option 2: Ansible + Docker Compose

> ✔️ **Status**: Accepted

Use Ansible for configuration management with official Pangolin Docker Compose deployment.

#### Technology Stack (Ansible)

* **Configuration Management**: Ansible for system provisioning and application deployment

* **GitOps Automation**: `ansible-pull` via systemd timer (15-minute intervals)

* **Application Deployment**: Official Pangolin `docker-compose.yml` from upstream

* **Networking**: Direct Docker networking with native iptables manipulation

* **Database**: Standard PostgreSQL container from Docker Hub

* **Secret Management**: Ansible variables with encrypted vault files

* `+` **Upstream Alignment**: Uses official Pangolin `docker-compose.yml` maintained by upstream

* `+` **Resource Efficiency**: Docker daemon <256MB RAM vs Kubernetes control plane \~1GB

* `+` **Native IPTables Access**: Gerbil manipulates routing without Kubernetes abstractions

* `+` **Debugging Simplicity**: Standard Docker commands (`docker-compose logs`, `docker ps`)

* `+` **GitOps Maintained**: `ansible-pull` provides declarative infrastructure from Git

* `+` **Rapid Rebuild**: Single Ansible playbook vs multi-step Kubernetes bootstrap

* `+` **Faster Iteration**: Direct deployment without Kubernetes reconciliation loops

* `+` **Minimal Complexity**: Fewer abstraction layers (no K8s scheduler, no operators)

* `-` **Tooling Inconsistency**: Different deployment workflow from other Arcane clusters

* `-` **No Native Health Checks**: Relies on Docker Compose restart policies instead of Kubernetes probes

* `-` **Manual Secret Management**: No External Secrets Operator integration with OpenBao

* `-` **No Centralized Dashboard**: No ArgoCD UI (logs available via `journalctl`)

* `-` **Docker Compose Limitations**: Less sophisticated orchestration than Kubernetes

## Decision Outcome

**Chosen option: "Ansible + Docker Compose" (Option 2)**, because it provides the best balance of simplicity, resource efficiency, and alignment with Pangolin's architecture while meeting all functional requirements for `kazimierz`'s specific deployment scenario.

### Rationale

#### 1. Pangolin Architecture Alignment

Pangolin's official deployment method is `docker-compose.yml` maintained by upstream developers. Adapting this to Kubernetes introduces significant maintenance overhead:

**Kubernetes Adaptation Requirements**:

* Custom Kubernetes manifests or Helm charts (no official chart exists)
* Translation of Docker Compose networking to Kubernetes Services
* Recreation of environment variable injection mechanisms
* Divergent secret management from official documentation
* Ongoing synchronization with upstream `docker-compose.yml` changes

**Impact**: Creates maintenance burden and deviation from upstream, increasing operational risk and reducing ability to leverage upstream support and documentation.

#### 2. Gerbil Network Requirements

Gerbil (WireGuard tunnel manager) requires direct IPTables manipulation for tunnel routing. While technically possible in Kubernetes with `hostNetwork: true`, this configuration:

* Completely bypasses Kubernetes networking abstractions
* Requires privileged container execution
* Defeats Kubernetes network policies (security isolation lost)
* Adds unnecessary complexity for no functional benefit
* Is significantly simpler with standard Docker networking

**Impact**: Kubernetes networking model provides zero value for Gerbil while adding operational complexity.

#### 3. No Component Reusability

`kazimierz` operates in complete isolation from other Arcane clusters with zero shared infrastructure components:

**No Shared Networking**:

* No cross-cluster communication (except WireGuard tunnels)
* No service mesh integration
* No shared ingress controllers

**No Shared GitOps**:

* Not managed by `amiya`'s ArgoCD (different infrastructure)
* Standalone GitOps implementation required
* No centralized application management

**Few Shared Infrastructure Components**:

* `cert-manager`: Used
* `cloudnative-pg`: Used
* `envoy-gateway`: Not used (Pangolin handles routing)
* `external-secrets`: No OpenBao integration planned

**Impact**: Few component reusability benefits from Kubernetes architecture.

#### 4. Standalone ArgoCD Resource Waste

Running ArgoCD on `kazimierz` for a single Docker Compose application:

**Resource Cost**:

* ArgoCD installation: \~700MB RAM
* Kubernetes control plane: \~1GB RAM (additional)
* **Total**: \~1.7GB RAM (42.5% of 4GB VPS)

**Value Provided**:

* Managing single Docker Compose application
* No application-map visualization benefit (only one app)
* No multi-cluster management value
* Dashboard access requires SSH proxy or Tailscale

**Alternative**: `ansible-pull` + `journalctl` provides equivalent GitOps functionality at low overhead.

**Impact**: 25-40% of VPS resources consumed for minimal operational value.

#### 5. Operational Context Mismatch

**Other Arcane Clusters** (`amiya`, `lungmen`):

* **Operating System**: Talos Linux (immutable, Kubernetes-native)
* **Workload Pattern**: Multiple applications with shared infrastructure
* **GitOps Model**: Centralized ArgoCD management from `amiya`
* **Resource Profile**: Dedicated hardware with sufficient capacity

**`kazimierz` Cluster**:

* **Operating System**: Commonly Ubuntu Server (standard mutable OS)
* **Workload Pattern**: Single-stack deployment (Pangolin + dependencies)
* **GitOps Model**: Standalone automation (no centralized management)
* **Resource Profile**: 4GB VPS with strict resource constraints

**Impact**: Forcing Kubernetes deployment contradicts cluster's design constraints and operational requirements.

***

## Consequences \[Optional]

### Positive

* ✅ **Resource Efficiency**: Saves \~750MB RAM (Docker daemon <256MB vs Kubernetes control plane \~1GB)
* ✅ **Operational Simplicity**: Standard Docker Compose commands for debugging and management
* ✅ **Upstream Alignment**: Uses official Pangolin `docker-compose.yml` maintained by upstream developers
* ✅ **GitOps Maintained**: `ansible-pull` systemd timer provides declarative infrastructure from Git repository
* ✅ **Faster Iteration**: Direct deployment without Kubernetes reconciliation loops or operator overhead
* ✅ **Native Network Access**: Gerbil manipulates IPTables without Kubernetes networking abstractions
* ✅ **Rapid Rebuild**: Single Ansible playbook (\~10 minutes) vs multi-step Kubernetes bootstrap
* ✅ **Simpler Forensics**: Standard Docker tooling for incident response and security analysis
* ✅ **Reduced Attack Surface**: Minimal system components compared to full Kubernetes stack
* ✅ **Lower Maintenance Burden**: Fewer moving parts and abstraction layers to maintain

### Negative

* ⚠️ **Tooling Inconsistency**: Different deployment workflow from other Arcane clusters (docker-compose vs kubectl)
* ⚠️ **Manual Secret Management**: No External Secrets Operator integration with OpenBao (relies on Ansible variables)
* ⚠️ **No Centralized Dashboard**: No ArgoCD UI for deployment visualization (logs available via `journalctl`)
* ⚠️ **Docker Compose Limitations**: Less sophisticated orchestration features compared to Kubernetes
* ⚠️ **Limited Observability**: No native Kubernetes metrics and monitoring integration
* ⚠️ **Knowledge Fragmentation**: Operators must maintain expertise in both Kubernetes and Ansible/Docker Compose

### Neutral

* ⚖️ **Docker Restart Policies**: Acceptable replacement for Kubernetes liveness/readiness probes for single-application deployment
* ⚖️ **ansible-pull Logging**: Sufficient replacement for ArgoCD dashboard for single-app deployment (available via `journalctl`)
* ⚖️ **iptables + Docker Networks**: Acceptable replacement for Kubernetes network policies given VPS isolation
* ⚖️ **Ansible Variables for Secrets**: Acceptable for single-node deployment without distributed secret management requirements

***

## Implementation Details / Status \[Optional]

### Configuration Management Tool Selection

**Decision**: Ansible chosen over alternatives (pyinfra, SaltStack, Chef/Puppet)

**Why Ansible**:

* Native `ansible-pull` for GitOps (no custom cron logic needed)
* Rich ecosystem: `community.docker`, `geerlingguy.docker`, `artis3n.tailscale` roles
* Consistency with other Arcane clusters (unified tooling)
* Battle-tested production stability and extensive documentation

### GitOps Automation Model

**Tool**: `ansible-pull` with systemd timer (15-minute interval)

**Workflow**:

1. Systemd timer triggers ansible-pull periodically
2. Repository cloned/updated automatically
3. Playbook execution applies desired state if Git changed
4. Logs available via journalctl for auditing

### Deployment Components

**4-Phase Bootstrap**:

1. **System Installation**: Docker, Tailscale VPN, UFW firewall, unattended upgrades
2. **GitOps Setup**: Ansible installation, ansible-pull systemd service/timer, Galaxy collections
3. **Observability**: ARA Records Ansible for playbook execution tracking (Tailscale Serve HTTPS)
4. **Application Stack**: Pangolin + Gerbil + Traefik via custom Ansible role

### Risks and Mitigations

* **ansible-pull Failure**: Systemd timer configured with retry logic; manual playbook execution procedure documented.
* **Docker Daemon Failure**: Systemd service configuration with automatic restart; health monitoring via systemd watchdog.
* **Upstream Pangolin Changes**: Pin Pangolin container image; subscribe to release notifications; test upstream changes in dev.
* **VPS Compromise**: Sacrificial infrastructure philosophy; rapid rebuild enabled by single Ansible playbook.

***

## Decision Evolution \[Optional]

### Implementation Challenges Encountered (8 major iterations)

1. Project restructure: Pangolin from docker-compose to Kubernetes manifests
2. Traefik migration: Raw manifests to Helm chart deployment
3. Gerbil separation: From bundled Traefik pod to standalone deployment
4. CNPG migration: OCIRepository to official Helm chart
5. Backup modernization: In-tree barmanObjectStore to Barman Cloud plugin
6. CrowdSec addition: Full security engine with Traefik bouncer integration
7. Cert-manager addition: TLS certificate automation with Let's Encrypt
8. Final pivot: Complete abandonment of Kubernetes approach

### Lessons Learned

#### When Kubernetes Makes Sense

* **Multiple applications requiring orchestration**: Coordinated deployment and scaling of many services
* **Shared infrastructure components**: Reusable operators, service meshes, observability stacks
* **Advanced scheduling requirements**: Resource allocation, affinity rules, pod placement policies
* **Centralized GitOps management**: Multi-cluster management (like `amiya` → `lungmen`)
* **High availability requirements**: Multi-node clusters with automatic failover
* **Complex networking requirements**: Service mesh, network policies, advanced routing

#### When Docker Compose + Ansible Makes Sense

* **Single-stack deployments**: Primary application with minimal dependencies (like `kazimierz` + Pangolin)
* **Upstream Docker Compose-first**: Official deployment method is `docker-compose.yml`
* **Resource-constrained environments**: Limited RAM/CPU where Kubernetes overhead is significant
* **Host networking requirements**: Direct IPTables or system-level network manipulation (like Gerbil)
* **Isolated infrastructure**: No cross-cluster dependencies or shared components

***

## References and Related Decisions \[Optional]

* **Technical Documentation**: [Pangolin Official Documentation](https://github.com/fosrl/pangolin), [Ansible Documentation](https://docs.ansible.com/), [ansible-pull Documentation](https://docs.ansible.com/ansible/latest/cli/ansible-pull.html), [ARA Records Ansible](https://ara.recordsansible.org/)
* **Ansible Roles and Collections**: [geerlingguy.docker](https://github.com/geerlingguy/ansible-role-docker), [artis3n.tailscale](https://github.com/artis3n/ansible-role-tailscale), [community.general](https://docs.ansible.com/ansible/latest/collections/community/general/), [community.docker](https://docs.ansible.com/ansible/latest/collections/community/docker/)
* **Architecture References**: [`kazimierz` Ansible README](../../projects/kazimierz.akn/src/infrastructure/ansible/README.md)

***

## Changelog

* **2026-03-19**: **CHORE**: Migrated ADR to the new YAML frontmatter and template format.
* **2025-11-16**: **VALIDATED** - Architecture decision validated through implementation
* **2025-01-13**: **ACCEPTED** - Decision accepted after multiple Kubernetes deployment attempts
