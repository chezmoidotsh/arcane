# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Arcane is a comprehensive homelab infrastructure-as-code project that has evolved through multiple iterations (ages) to reach its current GitOps-focused approach. Originally starting as "Nex.RPi" (NEXus Raspberry Pi) with Docker Compose, it now manages multiple Kubernetes clusters and applications across different environments.

### Project Evolution History

**Stone Age (A0 - 2023-2024)**: Initial Docker Compose implementation with direct device deployment
**Bronze Age (A1 - 2024)**: First major rewrite using Pulumi for orchestration\
**Iron Age (A2 - 2024-Q1 2025)**: Transition to native Kubernetes tools (Helm/Kustomize) with kubectl + FluxCD
**Steel Age (A3 - Q1 2025-current)**: Focus on maintainability and ArgoCD-based GitOps

### Current Architecture Philosophy (Steel Age - A3)

> **Core Principles (Adjusted for Practicality)**
>
> * **Everything MUST be declarative** (GitOps rule #1) - using Kubernetes + ArgoCD
> * **Everything MUST be versioned and immutable** (GitOps rule #2) - Git + container images
> * **SOME parts SHOULD be tested** - only critical infrastructure components
> * **Focus on maintainability over universal deployment** - prioritizing personal use over reusability
> * **The infrastructure COULD be understood by anyone** - through documentation like this

This represents a shift toward **practicality over perfectionism**, emphasizing ease of use and maintainability over exhaustive testing and universal deployability.

## Technology Stack

**Container Orchestration**: Kubernetes on Talos Linux (primary), K3s (legacy/transitioning)
**GitOps**: ArgoCD (standardizing across all clusters)
**Infrastructure as Code**: Crossplane, Helm, Kustomize
**Secret Management**: OpenBao (Vault fork)
**Service Mesh**: Cilium, Envoy Gateway (migrated from Traefik)
**Authentication**: Authelia (OIDC/SAML), yaLDAP
**Networking**: Tailscale for secure cluster connectivity (mandatory for external clusters)
**Development**: mise for tool management, Nix for reproducible builds

## Project Structure

```
catalog/          # Reusable components and compositions
├── ansible/      # Ansible roles for infrastructure provisioning
├── crossplane/   # XRDs and compositions for infrastructure
├── flakes/       # Nix-built OCI images
├── fluxcd/       # FluxCD Kustomize components
├── kairos-bundles/ # Kairos OS bundle configurations
├── kustomize/    # Reusable Kustomize bases
└── talos/        # Talos Linux manifests

projects/         # Individual cluster/project definitions
├── amiya.akn/    # Core platform cluster - Mission-critical services required for all other clusters (Talos Linux + ArgoCD, OpenBao, Authelia) - Production
├── chezmoi.sh/   # Shared infrastructure resources (Crossplane providers)
├── hass/         # Home Assistant application project (not a cluster)
├── kazimierz.akn/ # Proxy/firewall/WAF cluster (Talos Linux + ArgoCD) - Planning
├── lungmen.akn/  # Home applications cluster (Talos Linux + ArgoCD) - Active development
├── maison/       # Home applications cluster (K3s + FluxCD) - Legacy, being replaced by lungmen.akn
└── shodan.akn/   # Future cluster project - Planning

scripts/          # Operational scripts
```

## Key Commands and Development Workflow

### Essential Scripts

* `./scripts/argocd:app:sync <app-path>` - Sync ArgoCD applications from project structure
* `./scripts/cnpg:backup:create.sh <yaml-file>` - Create CloudNative-PG backups
* `./scripts/folderinfo` - Generate repository structure overview
* `./scripts/nix:build:image` - Build Nix-based container images
* `./scripts/nix:hash:update` - Update Nix package hashes

### Tool Management

Uses `mise` for tool version management (.mise.toml):

* `mise install` - Install all required tools (kubectl, helm, argocd, etc.)
* Tools are automatically configured with appropriate environment variables
* KUBECONFIG, VAULT\_ADDR, and other environment variables are managed by mise

### Development Environment

* **DevContainer support** with comprehensive tooling
* **Nix flakes** for reproducible development environments
* **VSCode/Cursor integration** with Go toolchain and SOPS support

## GitOps Architecture Patterns

### ArgoCD (Standardizing Across All Clusters)

**Target Architecture**: All clusters will use ArgoCD for GitOps deployment

**Core Platform Cluster (amiya.akn)**:

* **Role**: Mission-critical services required for all other clusters to function (authentication, secrets management, monitoring platform)
* **App-of-Apps pattern** via ApplicationSets
* **Seed application** bootstraps the entire cluster (seed.application.yaml)
* **Project structure**: `projects/<cluster>/src/apps/*<name>/` (asterisk indicates ArgoCD-managed)
* **Multi-source applications** for complex deployments
* **OIDC integration** with Authelia for authentication
* **Talos Linux** as the Kubernetes distribution
* **Status**: Production - must remain operational for infrastructure to function

**Active Development (lungmen.akn)**:

* **Talos Linux + ArgoCD** replacing maison (K3s + FluxCD)
* **Same ArgoCD patterns** as amiya.akn for consistency
* **Currently deployed apps**: actual-budget, atuin
* **Migration from maison** in progress

**Planned Clusters**:

* **kazimierz.akn**: Proxy/firewall/WAF cluster (infrastructure defined, apps pending)
* **shodan.akn**: Future cluster (architecture planned)

**Application Projects** (not clusters):

* **hass**: Home Assistant application project with infrastructure definitions

### FluxCD (Legacy - maison cluster)

**Being Phased Out**: Current maison cluster uses FluxCD but will be replaced by lungmen.akn

* **GitRepository + Kustomization** pattern
* **Cluster composition** in `projects/maison/src/clusters/production/`
* **Application catalogs** separate apps from system components
* **Automatic sync** from main branch every 6 hours

### Crossplane Infrastructure

* **Shared providers** in chezmoi.sh project (AWS, Cloudflare, Vault)
* **Project-specific compositions** for IAM, DNS, and secrets
* **XRD definitions** in catalog/crossplane/ for reusability

## Path and Naming Conventions

### Application Paths

* **ArgoCD Apps**: `projects/<cluster>/src/apps/*<name>/`
* **Infrastructure**: `projects/<cluster>/src/infrastructure/kubernetes/<name>/`
* **Crossplane**: `projects/<cluster>/src/infrastructure/crossplane/<name>/`

### Secret Management

* **OpenBao paths**: `projects-<cluster>/` and `shared/` mounts
* **External Secrets Operator** syncs to Kubernetes secrets
* **SOPS encryption** for sensitive files in Git

### Commit Conventions

Uses **Gitmoji** with structured scopes (.commitlintrc.js):

* Format: `:emoji:(scope): Description`
* Scopes: `project:<name>`, `catalog:<type>`, `deps`, `gh`
* Example: `:truck:(project:amiya.akn): Migrate from Traefik to Envoy Gateway`

## Application Deployment Patterns

### Helm Chart Management

* **Charts stored in Git** under `charts/` directories within apps
* **Values overlays** using helmvalues/ subdirectories (default.yaml, hardened.yaml)
* **Kustomization integration** for additional resource patching

### Network and Security

* **Cilium network policies** for microsegmentation
* **Envoy Gateway** for ingress (HTTPRoute, TCPRoute)
* **Tailscale integration** for secure connectivity
  * **Mandatory for external clusters** (outside homelab)
  * **Secure mesh networking** between distributed clusters
  * **Zero-trust access** for administrative interfaces
* **Certificate management** via cert-manager with DNS-01 validation

### Database Management

* **CloudNative-PG** for PostgreSQL clusters
* **Automated S3 backups** with retention policies
* **Network policies** for database access control

## Troubleshooting and Operations

### Application Sync Issues

1. Check ArgoCD application status: `argocd app get <namespace>/<name>`
2. Use sync script with path: `./scripts/argocd:app:sync projects/<cluster>/src/apps/<name>`
3. Verify secrets are synced: `kubectl get externalsecrets -n <namespace>`

### Infrastructure Problems

1. Check Crossplane resources: `kubectl get composite,claim,xr`
2. Verify provider configurations: `kubectl get providerconfig,provider`
3. Review OpenBao authentication: `vault auth -method=oidc`

### Network Connectivity

1. Verify Cilium health: `cilium status`
2. Check network policies: `kubectl get netpol -A`
3. Test Envoy Gateway routes: `kubectl get httproute,gateway -A`

## Important File Locations

### Bootstrap Documentation

* `projects/*/docs/BOOTSTRAP_*.md` - Cluster setup procedures
* `projects/*/docs/bootstrap/` - Bootstrap configurations

### Architecture Diagrams

* `projects/*/architecture.d2` - D2 diagram sources
* `projects/*/assets/architecture.svg` - Generated diagrams
* `docs/assets/d2/architecture-styles.d2` - Shared D2 styles

### Configuration Overrides

* `defaults/kubernetes/*/` - Default configurations for common services
* `projects/*/src/infrastructure/kubernetes/*/override.helmvalues.yaml` - Project-specific overrides

## Security Considerations

* **Never commit secrets to Git** - use OpenBao + External Secrets Operator
* **SOPS encryption** for sensitive configuration files
* **Network policies** are mandatory for all applications
* **OIDC authentication** required for all administrative interfaces
* **Tailscale connectivity requirements**:
  * **Mandatory for external clusters** (any cluster deployed outside the homelab)
  * **Secure mesh networking** for inter-cluster communication
  * **Tailscale Funnel** for secure external access when needed

## Testing and Validation

* **Selective testing approach** (Steel Age philosophy - practical over perfect)
  * **Critical infrastructure components only** - not comprehensive testing
  * **Manual validation** using operational scripts for non-critical parts
* **ArgoCD health checks** for application status monitoring
* **Renovate** for automated dependency updates
* **No testing for universal deployability** - focus is on personal homelab use

## Development Philosophy and Approach

### Steel Age (A3) Priorities

1. **Maintainability over universality** - designed for personal use, not universal deployment
2. **Practical over perfect** - accept trade-offs between security/reproducibility and usability
3. **Standardization on ArgoCD + Talos** - unified GitOps and Kubernetes distribution
4. **Mandatory Tailscale for external clusters** - secure connectivity for distributed infrastructure
5. **Selective complexity** - add complexity only where it provides clear value
6. **External dependencies acceptable** - use external Helm charts when beneficial
7. **Documentation for understanding** - but not exhaustive user guides

### Historical Context

This project has undergone significant architectural evolution:

* **Started with Docker Compose** (Stone Age) for simplicity
* **Experimented with Pulumi** (Bronze Age) for programming language benefits but faced maintenance complexity
* **Adopted Helm/Kustomize** (Iron Age) for Kubernetes-native tooling
* **Currently using ArgoCD** (Steel Age) for improved GitOps automation

When working with this codebase, understand that **architectural decisions prioritize maintainability and personal use over universal applicability**. The project embraces pragmatic trade-offs rather than pursuing theoretical perfection.

***

## CLAUDE Code Rules and Guidelines

This project includes specific rules for CLAUDE Code interactions in `.claude/rules/`. Reference these files for detailed guidance.

### GitHub Templates

This repository includes comprehensive GitHub templates for streamlined issue and pull request creation:

#### Pull Request Templates (`.github/PULL_REQUEST_TEMPLATE/`)

* **Default template**: `.github/pull_request_template.md` - Standard PR format
* **Feature**: `feature.md` - New feature implementation PRs
* **Bugfix**: `bugfix.md` - Bug fix PRs
* **Refactoring**: `refactoring.md` - Code refactoring PRs

#### Issue Templates (`.github/ISSUE_TEMPLATE/`)

* **Application Addition**: `application-addition.yml` - Request new application deployment
* **Bug Report**: `bug-report.yml` - Report infrastructure or application bugs
* **Enhancement Request**: `enhancement-request.yml` - Suggest improvements

#### AI Agent Templates (`.github/ISSUE_TEMPLATE/AGENT_TEMPLATES/`)

Specialized templates for AI-assisted issue creation:

* `application-addition.AGENT.md` - AI-generated application requests
* `bug-report.AGENT.md` - AI-generated bug reports
* `enhancement-request.AGENT.md` - AI-generated enhancement requests

**Note**: AI agents should use these AGENT templates when creating issues to ensure proper formatting and required information.

### Available Rules

#### Git Operations (`.claude/rules/git-commits.md`)

Comprehensive commit guidelines for Arcane infrastructure:

* **Mandatory format**: `:emoji:(scope): Description` with signoff (-s) and GPG signature (-S)
* **Gitmoji semantic emojis**: Synchronized with `.commitlintrc.js` (`:sparkles:`, `:bug:`, `:memo:`, `:wrench:`, etc.)
* **Exact scopes**:
  * Catalog: `catalog:ansible`, `catalog:crossplane`, `catalog:flakes`, `catalog:kustomize`, `catalog:kairos-bundle`, `catalog:talos`
  * Project: `project:amiya.akn`, `project:chezmoi.sh`, `project:hass`, `project:kazimierz.akn`, `project:lungmen.akn`, `project:maison`, `project:shodan.akn`
  * Repository: `gh` (GitHub/CI), `deps` (dependencies)
  * Note: `catalog:fluxcd` exists in catalog/ but not in `.commitlintrc.js` (legacy catalog being phased out)
* **AI Co-author attribution**: Mandatory `Co-authored-by: Claude <claude@anthropic.com>` trailer
* **Atomic commits**: One logical change per commit, multiple scopes allowed when atomic (format: `scope1,scope2`)
* **Body requirements**: Explain WHY not WHAT, UPPERCASE start for sentences, max 80 chars/line
* **Never** auto-update GitHub issues without user confirmation

#### Collaborative Workflow Documentation (`.claude/rules/workflow-documentation.md`)

Session management for complex multi-step work:

* **Session documents**: Create in `.claude/sessions/` with `YYYYMMDD-description.md` format
* **Always create for**: Multi-step implementations (3+ steps), architecture decisions, complex debugging, feature development
* **Skip for**: Simple questions, single file edits, trivial changes
* **Permission management**: Always request user permission before creating/deleting sessions or GitHub actions
* **Standard template**: Includes 🎯 Objective, 🧠 Context & Reflections, 📝 Change History, ⚠️ Attention Points, 🔄 Next Steps
* **Context maintenance**: Document AI thoughts/decisions, auto-update on significant changes, re-read every 15±5 exchanges
* **Scope management**: Provide status updates, alert on deviations, propose GitHub issues for unrelated discoveries

#### CLI and Terminal Operations (`.claude/rules/cli-limitations.md`)

AI agent limitations for interactive tools:

* **Never use**: Interactive commands (`git rebase -i`, `git add -p`, `less`, `more`, `man`)
* **Always use**: Non-interactive flags (`git --no-pager log`, `| cat`)
* **Pager avoidance**: Append `| cat` or use `--no-pager` for git commands
* **Preferred approaches**: Batch operations, specific file patterns, automated sequences
* **Communication**: Clearly explain limitations and propose non-interactive alternatives
