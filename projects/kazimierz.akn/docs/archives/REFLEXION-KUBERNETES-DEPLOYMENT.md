# Kazimierz.AKN - Kubernetes Deployment Attempts (Historical Document)

> **⚠️ This document is ARCHIVED and for historical reference only.**
>
> **Final decision**: Kazimierz.AKN uses **Ansible + Docker Compose** (not Kubernetes).
>
> See [ADR-008](../../../../docs/decisions/008-kazimierz-ansible-over-kubernetes.md) for rationale.

***

## Purpose

This document traces the multiple attempts to deploy Kazimierz.AKN on Kubernetes and the lessons learned. It documents the evolution from initial Kubernetes designs through various iterations (FluxCD, ArgoCD) to the final decision to use Ansible + Docker Compose.

**Key learnings**:

* Kubernetes adds complexity without benefits for single-stack deployments
* Pangolin is Docker Compose-first; Kubernetes adaptation adds maintenance burden
* Gerbil's IPTables requirements bypass Kubernetes networking anyway
* Resource constraints on VPS (\~1GB for K3s + ArgoCD = 25% overhead)

***

## Summary of Attempts

This document contains 8 major architecture iterations attempting to deploy Pangolin on Kubernetes:

## 0. Project Structure → Apps directory

**Previous**: Pangolin in `infrastructure/kubernetes/pangolin/`
**Current**: Pangolin in `apps/pangolin/`

**Rationale**: Following project conventions where applications go in `apps/` and infrastructure components (CNPG, cert-manager) stay in `infrastructure/kubernetes/`

**Changes**:

* Moved entire `pangolin/` directory from `infrastructure/kubernetes/` to `apps/`
* Updated root `kustomization.yaml` to reference new path
* All subdirectories maintained: `database/`, `pangolin-app/`, `traefik/`, `gerbil/`, `crowdsec/`

## 1. Traefik → Helm-based deployment

**Previous**: Combined Gerbil + Traefik deployment using raw manifests
**Current**: Traefik deployed via Helm chart with custom configuration

**Changes**:

* `traefik/traefik.helmrelease.yaml`
  * HelmRepository pointing to <https://traefik.github.io/charts>
  * HelmRelease with version `>=31.0.0`
  * Custom `additionalArguments` for Pangolin HTTP provider integration
  * CrowdSec bouncer plugin configuration (`github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin`)
  * Persistent volume mount for access logs (`/var/log/traefik/access.log`)
  * JSON-formatted access logs for CrowdSec parsing

* `traefik/traefik-logs.pvc.yaml`
  * 2Gi PVC for Traefik access logs
  * Shared with CrowdSec for log parsing

* `traefik/traefik-dynamic-config.configmap.yaml`
  * File provider for supplementary configuration

**Benefits**:

* Easier upgrades via Helm
* Better separation of concerns
* Official Traefik chart maintenance

## 2. Gerbil → Standalone deployment

**Previous**: Gerbil bundled with Traefik in same pod
**Current**: Separate Gerbil deployment

**Changes**:

* `gerbil/gerbil.deployment.yaml`
  * Standalone Deployment with `NET_ADMIN` capability
  * Mounts shared `pangolin-data` PVC for WireGuard keys

* `gerbil/gerbil.service.yaml`
  * LoadBalancer Service exposing WireGuard ports:
    * `51820/UDP` - Client connections
    * `21820/UDP` - Peer connections

**Benefits**:

* Independent scaling and lifecycle management
* Clearer resource allocation
* Easier troubleshooting

## 3. CloudNative-PG → Helm chart

**Previous**: OCIRepository-based deployment from GitHub releases
**Current**: Official Helm chart from <https://cloudnative-pg.github.io/charts>

**Changes**:

* `cloudnative-pg/release.yaml`
  * HelmRepository + HelmRelease resources
  * Version `>=0.22.0`
  * Security context configurations
  * Resource limits and monitoring disabled

**Benefits**:

* Consistent deployment method with other components
* Better configuration management via Helm values
* Official chart maintenance

## 4. CNPG Backups → Barman Cloud plugin

**Previous**: In-tree `barmanObjectStore` configuration
**Current**: Barman Cloud plugin (modern approach)

**Changes**:

* `cloudnative-pg/barman-cloud-plugin.yaml`
  * Kustomization to install plugin from GitHub release
  * Version `v0.9.0`
  * Installed in `cnpg-system` namespace (same as operator)
  * `dependsOn` CNPG operator

* `pangolin/database/backblaze-objectstore.yaml`
  * ObjectStore CRD defining Backblaze B2 configuration
  * S3-compatible endpoint: `https://s3.us-west-002.backblazeb2.com`
  * Destination: `s3://kazimierz-backups/pangolin/`
  * WAL compression: gzip
  * Server-side encryption: AES256

* `pangolin/database/pangolin-database.cluster.yaml` - Updated
  * Removed in-tree `barmanObjectStore` configuration
  * Added `plugins` section with `barman-cloud.cloudnative-pg.io`
  * References ObjectStore `backblaze-b2`
  * ScheduledBackup updated to use `method: plugin`

**Secret rename**:

* `backblaze-credentials.secret.yaml` → `backblaze-b2-credentials.secret.yaml`

**Benefits**:

* Modern plugin architecture (future-proof)
* Better error handling (CNPG 1.27+)
* Separation of configuration from cluster definition
* Multiple ObjectStore support for different backup targets

**Documentation references**:

* <https://cloudnative-pg.io/plugin-barman-cloud/docs/intro/>
* <https://cloudnative-pg.io/plugin-barman-cloud/docs/usage/>
* <https://cloudnative-pg.io/plugin-barman-cloud/docs/installation/>

## 5. CrowdSec → Added deployment + Traefik bouncer

**Previous**: Not deployed
**Current**: Full CrowdSec security engine with Traefik integration

**Changes**:

* `crowdsec/crowdsec.deployment.yaml`
  * CrowdSec v1.6.4 deployment
  * Collections: `traefik`, `http-cve`, `whitelist-good-actors`
  * Parsers: `traefik-logs`
  * Scenarios: `http-sensitive-files`, `http-bad-user-agent`, `http-path-traversal-probing`
  * Mounts `traefik-logs` PVC (read-only) for log parsing
  * Persistent volumes for CrowdSec data and config
  * Optional CrowdSec Console enrollment

* `crowdsec/crowdsec.service.yaml`
  * ClusterIP Service for LAPI (Local API)
  * Port 8080 for bouncer queries
  * Port 6060 for metrics

* `crowdsec/crowdsec-acquisition.configmap.yaml`
  * Acquisition configuration for Traefik logs
  * JSON format parsing
  * File path: `/var/log/traefik/access.log`

* `crowdsec/crowdsec-data.pvc.yaml` - 1Gi storage

* `crowdsec/crowdsec-config.pvc.yaml` - 100Mi storage

* `crowdsec/traefik-bouncer-middleware.yaml`
  * Traefik Middleware using CrowdSec plugin
  * ForwardAuth to CrowdSec LAPI
  * Trusted IPs configuration for private networks

**Traefik integration**:

* Plugin added to Traefik HelmRelease: `github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin v1.3.5`
* Access logs in JSON format for CrowdSec parsing

**Benefits**:

* Real-time threat detection and blocking
* Collaborative threat intelligence
* Automated IP reputation management
* WAF-like protection for web applications

**New secrets required**:

* `crowdsec-bouncer-key` - API key for Traefik bouncer authentication
* `crowdsec-console` (optional) - Enrollment key for CrowdSec Console

## 6. Cert-Manager → Added for TLS certificate management

**Previous**: Not deployed (Pangolin manages its own certificates was incorrect assumption)
**Current**: Full cert-manager deployment with Let's Encrypt issuers

**Changes**:

* `cert-manager/release.yaml`
  * HelmRepository: <https://charts.jetstack.io>
  * HelmRelease with version `>=1.16.0`
  * CRDs auto-installation enabled
  * Single replica for VPS (minimal resources)
  * Resource limits: 100m CPU / 128Mi RAM for controller
  * Webhook and CA injector with reduced resources (50m CPU / 64Mi RAM)

* `cert-manager/letsencrypt-issuers.yaml`
  * ClusterIssuer for Let's Encrypt staging (testing)
  * ClusterIssuer for Let's Encrypt production
  * HTTP-01 challenge solver via Traefik ingress class
  * Email: `noreply@chezmoi.sh` for expiration notifications

**Benefits**:

* Automated TLS certificate provisioning
* Free certificates from Let's Encrypt
* Automatic renewal before expiration
* HTTP-01 challenge (no DNS provider needed)

**Usage example**:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: pangolin-tls
  namespace: pangolin
spec:
  secretName: pangolin-tls
  issuerRef:
    name: letsencrypt-production
    kind: ClusterIssuer
  dnsNames:
    - pangolin.chezmoi.sh
```

## 7. Updated main Pangolin kustomization

`pangolin/kustomization.yaml`

**Resources order**:

1. `namespace.yaml`
2. `database/` (CNPG cluster + ObjectStore)
3. `pangolin-app/` (Pangolin application)
4. `traefik/` (Ingress controller)
5. `gerbil/` (WireGuard tunnel manager)
6. `crowdsec/` (Security engine)

## Manual Steps Required

### 1. Update SOPS age key

No changes required - same process as before.

### 2. Rename Backblaze credentials secret

```bash
# If you already created backblaze-credentials.secret.yaml:
mv projects/kazimierz.akn/src/infrastructure/kubernetes/pangolin/database/backblaze-credentials.secret.yaml \
   projects/kazimierz.akn/src/infrastructure/kubernetes/pangolin/database/backblaze-b2-credentials.secret.yaml
```

Already done automatically during restructuring.

### 3. Generate CrowdSec bouncer key

```bash
# Generate random API key for Traefik bouncer
openssl rand -base64 32

# Create secret file
cat > projects/kazimierz.akn/src/apps/pangolin/crowdsec/crowdsec-bouncer-key.secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: crowdsec-bouncer-key
  namespace: pangolin
type: Opaque
stringData:
  BOUNCER_KEY: <generated-key-here>
EOF

# Encrypt with SOPS
sops -e -i projects/kazimierz.akn/src/apps/pangolin/crowdsec/crowdsec-bouncer-key.secret.yaml
```

### 4. (Optional) CrowdSec Console enrollment

If you want to use CrowdSec Console for centralized management:

```bash
# Get enrollment key from https://app.crowdsec.net/

# Create secret file
cat > projects/kazimierz.akn/src/apps/pangolin/crowdsec/crowdsec-console.secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: crowdsec-console
  namespace: pangolin
type: Opaque
stringData:
  ENROLL_KEY: <your-enrollment-key>
EOF

# Encrypt with SOPS
sops -e -i projects/kazimierz.akn/src/apps/pangolin/crowdsec/crowdsec-console.secret.yaml
```

## Deployment Order

FluxCD will automatically handle dependencies, but the logical order is:

1. **CNPG operator** (Helm) → **Barman Cloud plugin**
2. **Cert-Manager** (Helm, with CRDs)
3. **Pangolin database** (using Barman Cloud plugin)
4. **Pangolin application** (depends on database)
5. **Traefik** (Helm, with CrowdSec plugin)
6. **Gerbil** (standalone, WireGuard tunnels)
7. **CrowdSec** (depends on Traefik logs PVC)

## Verification

After deployment, verify each component:

```bash
# CNPG operator
kubectl get deployment -n cnpg-system cnpg-controller-manager
kubectl get deployment -n cnpg-system barman-cloud

# Cert-Manager
kubectl get deployment -n cert-manager cert-manager
kubectl get clusterissuer letsencrypt-staging letsencrypt-production

# Pangolin database
kubectl get cluster -n pangolin pangolin-database
kubectl get objectstore -n pangolin backblaze-b2

# Pangolin application
kubectl get deployment -n pangolin pangolin

# Traefik
kubectl get helmrelease -n pangolin traefik
kubectl get svc -n pangolin traefik

# Gerbil
kubectl get deployment -n pangolin gerbil
kubectl get svc -n pangolin gerbil

# CrowdSec
kubectl get deployment -n pangolin crowdsec
kubectl get svc -n pangolin crowdsec-lapi
```

## Migration Notes

**Breaking changes**:

* Old `gerbil-traefik/` directory removed
* Pangolin moved from `infrastructure/kubernetes/pangolin/` to `apps/pangolin/`
* Backblaze secret renamed: `backblaze-credentials` → `backblaze-b2-credentials`
* CNPG backup method changed from in-tree to plugin
* Cert-manager added (required for Barman Cloud plugin)

**Non-breaking**:

* Pangolin database data persists (no data loss)
* Pangolin application configuration unchanged
* Same namespace (`pangolin`) for all components

## Questions Answered

1. ✅ **PostgreSQL password**: CNPG auto-generates (no change)
2. ✅ **Traefik logs**: Persistent volume for CrowdSec parsing
3. ✅ **Pangolin UI exposure**: Via Traefik (same as docker-compose)
4. ✅ **Network policies**: Not needed for minimalist approach

***

## 8. Major Architecture Pivot: Kubernetes → Ansible (2025-01-13)

**Decision**: After multiple attempts to deploy Pangolin under Kubernetes, switching to Ansible-based deployment.

### Rationale

**Simplicity and Clarity**:

* Ansible provides simpler, more straightforward deployment model
* Configuration is clearer and easier to understand
* Less abstraction overhead compared to Kubernetes

**Technical Constraints**:

* Gerbil requires IPTables manipulation for WireGuard tunnel management
* IPTables operations are much simpler with host networking
* Official docker-compose approach is better suited for this use case
* Kubernetes networking abstractions add unnecessary complexity

**Operational Benefits**:

* Direct host access simplifies troubleshooting
* Easier to debug network issues
* Better alignment with Gerbil's architecture
* Standard Docker Compose workflow familiar to most operators

### New Architecture

**Deployment Method**: Ansible playbooks deploying Docker Compose stacks

**Components**:

1. **Pangolin** - Docker Compose deployment
   * Pangolin application container
   * PostgreSQL database
   * Traefik reverse proxy
   * Gerbil WireGuard manager (with IPTables access)
   * CrowdSec security engine

2. **ArgoCD** - Lightweight Kubernetes deployment
   * Minimal ArgoCD for GitOps visibility
   * App-of-Apps pattern
   * Single replica configuration for VPS constraints
   * Extensions: application-map for visualization

**Infrastructure Stack**:

```text
┌─────────────────────────────────────────┐
│        Kazimierz.AKN VPS (K3s)          │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐  │
│  │   ArgoCD (Kubernetes)             │  │
│  │   - GitOps monitoring only        │  │
│  │   - Application map extension     │  │
│  │   - Minimal resources             │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │   Pangolin Stack (Docker Compose) │  │
│  │   - Deployed via Ansible          │  │
│  │   - Host networking for Gerbil    │  │
│  │   - IPTables management           │  │
│  │   - CrowdSec + Traefik            │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### Changes From Previous Kubernetes Approach

**Removed**:

* All Kubernetes manifests for Pangolin components
* CNPG PostgreSQL operator and cluster
* Barman Cloud backup plugin
* Cert-manager (replaced by Traefik ACME)
* FluxCD/ArgoCD application deployments for Pangolin
* Complex networking and security policies

**Added**:

* Ansible inventory for Kazimierz.AKN VPS
* Ansible playbooks for Docker Compose deployment
* Official Pangolin docker-compose.yml
* Simplified backup strategy using PostgreSQL tools
* Direct Traefik ACME certificate management

**Kept**:

* ArgoCD infrastructure (minimal deployment)
* GitOps principles (configuration in Git)
* Security focus (CrowdSec, Traefik)

### Directory Structure Changes

**New Structure**:

```text
projects/kazimierz.akn/
├── src/
│   ├── infrastructure/
│   │   ├── ansible/
│   │   │   ├── inventory/
│   │   │   │   └── hosts.yml
│   │   │   └── playbooks/
│   │   │       ├── bootstrap.yml
│   │   │       ├── k3s-install.yml
│   │   │       └── pangolin-deploy.yml
│   │   └── kubernetes/
│   │       ├── argocd/              # Minimal ArgoCD
│   │       └── (other K8s infra)
│   └── apps/
│       └── pangolin/                # Docker Compose configs
│           ├── docker-compose.yml
│           ├── .env.template
│           └── config/
└── docs/
    ├── BOOTSTRAP_ANSIBLE.md         # New
    └── ARCHITECTURE_CHANGES.md      # This file
```

**Removed Directories**:

* `src/apps/pangolin/` (Kubernetes manifests)
* `src/infrastructure/kubernetes/cloudnative-pg/`
* `src/infrastructure/kubernetes/cert-manager/`
* All Pangolin Kubernetes components

### Migration Path

For existing deployments, migration steps:

1. **Backup Pangolin data** from Kubernetes deployment
2. **Deploy new infrastructure** using Ansible playbooks
3. **Restore data** to Docker Compose PostgreSQL
4. **Update DNS** to point to new deployment
5. **Decommission** Kubernetes Pangolin resources

### Benefits of This Approach

**Technical**:

* Native IPTables access for Gerbil
* Simpler networking model
* Standard Docker Compose workflow
* Easier to debug and troubleshoot

**Operational**:

* Lower learning curve for operators
* Faster deployment and updates
* Less resource overhead
* Better alignment with Pangolin's design

**Maintenance**:

* Official docker-compose.yml from Pangolin project
* Standard PostgreSQL backup tools
* Traefik ACME for certificates (no cert-manager complexity)
* CrowdSec integration remains the same

### Trade-offs Accepted

**Lost Capabilities**:

* Kubernetes-native health checks and restarts (replaced by Docker Compose restart policies)
* CNPG automated backup to object storage (replaced by standard pg\_dump)
* Kubernetes network policies (replaced by iptables + Docker network isolation)
* Cert-manager automation (replaced by Traefik ACME)

**Gained Simplicity**:

* Single Ansible playbook deployment
* Direct host access for troubleshooting
* Standard Docker Compose operations
* Clearer configuration files
* Better Gerbil integration

### Configuration Management Tool Selection

**Decision**: Using **Ansible** over pyinfra and alternatives.

#### Analysis

**Options Considered**:

1. **Ansible** - Industry standard, YAML-based automation
2. **pyinfra** - Python-based, faster execution, lighter requirements
3. **SaltStack** - Event-driven, complex agent architecture
4. **Chef/Puppet** - Traditional CM tools, heavy agents

#### Comparison: Ansible vs pyinfra

| Criteria                | Ansible                        | pyinfra                      |
| ----------------------- | ------------------------------ | ---------------------------- |
| **Language**            | YAML (declarative)             | Python (imperative)          |
| **Performance**         | Adequate for single VPS        | 10x faster (not needed here) |
| **Target Requirements** | Python + deps                  | POSIX shell only             |
| **Ecosystem**           | Massive (thousands of modules) | Smaller but growing          |
| **Learning Curve**      | Moderate (YAML complexity)     | Lower (Python familiarity)   |
| **GitOps Support**      | `ansible-pull` native          | Custom cron + git.repo       |
| **Debugging**           | Abstract, harder to debug      | Direct shell output          |
| **Community**           | Very large, enterprise         | Smaller, enthusiast          |
| **Maturity**            | 10+ years, battle-tested       | Newer, evolving              |

#### Why Ansible Was Chosen

**Ecosystem and Modules**:

* `community.docker` collection for Docker Compose management
* Native modules for K3s, systemd, cron, etc.
* Better integration with existing infrastructure (already used in Arcane for other clusters)

**GitOps with ansible-pull**:

* Native pull-based deployment: `ansible-pull -U <repo> -i localhost,`
* No custom cron logic needed (ansible-pull handles it)
* Can be scheduled via systemd timer or cron
* Idempotent by design (safe to run repeatedly)

**Consistency Across Projects**:

* Other Arcane clusters may use Ansible for node bootstrapping
* Unified tooling simplifies maintenance
* Team familiarity (if project grows)

**Production Stability**:

* Battle-tested in production environments
* Enterprise support available if needed
* Better documentation and troubleshooting resources

#### Why NOT pyinfra

Despite pyinfra's advantages (speed, Python, lighter requirements):

* **Overkill performance**: 10x speed improvement not needed for single VPS
* **Smaller ecosystem**: Fewer ready-made modules for Docker Compose, K3s
* **Custom GitOps**: Would need to build cron + git pull logic manually
* **Less mature**: Newer tool, potentially breaking changes
* **Team knowledge**: Python skills available, but YAML Ansible playbooks are clearer for infrastructure

#### GitOps Implementation with Ansible

**Pattern**: Pull-based deployment with systemd timer

```bash
# Install ansible-pull on VPS
ansible-pull -U https://github.com/chezmoidotsh/arcane \
  -i projects/kazimierz.akn/src/infrastructure/ansible/inventory/hosts.yml \
  projects/kazimierz.akn/src/infrastructure/ansible/playbooks/site.yml

# Schedule with systemd timer (every 15 minutes)
systemctl enable ansible-pull.timer
systemctl start ansible-pull.timer
```

**Benefits**:

* No SSH keys stored on developer machines (VPS pulls from Git)
* Idempotent: safe to run on schedule
* Git as source of truth
* Automatic convergence to desired state
* Audit trail via Git commits

**Security**:

* VPS only needs read access to public Git repository
* Secrets managed via SOPS (encrypted in Git)
* No inbound SSH required (Tailscale for emergency access)

### Future Considerations

This architecture is specific to **Kazimierz.AKN** due to:

* Gerbil's IPTables requirements
* VPS resource constraints
* Pangolin's Docker Compose-first design

Other clusters (amiya.akn, lungmen.akn) remain Kubernetes-native as they don't have these specific constraints.

**Potential Future Exploration**:
If performance becomes critical or Python integration is heavily needed, pyinfra could be reconsidered. For now, Ansible provides the best balance of ecosystem maturity, GitOps support, and project consistency.
