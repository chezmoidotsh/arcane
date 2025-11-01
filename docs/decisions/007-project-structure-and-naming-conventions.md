<!--
status: "proposed"
date: 2025-10-31
decision-makers: ["Alexandre"]
consulted: ["ai/claude-4-sonnet"]
informed: []
-->

# Project Structure and Naming Conventions

## Context and Problem Statement

The Arcane infrastructure has evolved through multiple clusters and applications, with three primary project types now in production or active development:

1. **amiya.akn**: Core platform cluster (Production) - Talos Linux + ArgoCD
2. **lungmen.akn**: Home applications cluster (Active development) - Talos Linux + ArgoCD
3. **chezmoi.sh**: Shared infrastructure resources (Crossplane providers)

During an audit of these projects, significant inconsistencies were identified across application structures, naming conventions, Kubernetes labels, resource organization, and file naming patterns. These inconsistencies create:

* **Maintenance overhead**: Different patterns require context switching between projects
* **Onboarding friction**: No single source of truth for "correct" structure
* **Tooling complexity**: Scripts and automation must handle multiple patterns
* **Migration risks**: Unclear standards make cluster migrations error-prone

Without standardized conventions, each new application or cluster deployment becomes a decision point, increasing cognitive load and reducing operational velocity.

## Decision Drivers

### Functional Requirements

* **Consistency**: Same pattern across all clusters and applications
* **ArgoCD Integration**: Support App-of-Apps pattern and GitOps workflows
* **Discoverability**: Clear structure enables quick location of resources
* **Version Tracking**: Automated dependency updates via Renovate
* **Security Isolation**: Network policies and secret management
* **Sync Control**: Clear mechanism for manual vs automated sync

### Non-Functional Requirements

* **Maintainability**: Reduce cognitive overhead for single-operator homelab
* **Tooling Support**: Enable automation and scripting
* **Migration Friendliness**: Clear path to standardize existing projects
* **Scalability**: Support growth without restructuring
* **Safety**: Protect critical infrastructure from accidental automation

### Constraints

* **ArgoCD Ecosystem**: Must work within ArgoCD's capabilities and patterns
* **Kustomize Integration**: Leverage Kustomize for resource management
* **Helm Support**: Support Helm charts with values overlays
* **Existing Infrastructure**: Must migrate gracefully from current state
* **ApplicationSet Limitations**: Limited control flow in templating

## Considered Options

### Application Directory Naming

**Option 1.1: Asterisk Prefix for Manual-Sync Apps** (Current amiya.akn pattern)

```
projects/amiya.akn/src/apps/
├── *argocd/       # Manual sync - critical infrastructure
├── *vault/        # Manual sync - secrets management
├── *pocket-id/    # Manual sync - authentication
└── home-dashboard/  # Auto sync - user application

projects/amiya.akn/src/infrastructure/kubernetes/
├── *cilium/           # Manual sync - network infrastructure
├── *longhorn/         # Manual sync - storage infrastructure
├── *external-dns/     # Manual sync - DNS management
├── *kube/             # Manual sync - Kubernetes core
├── cert-manager/      # Excluded from system ApplicationSet (deployed in critical wave)
├── envoy-gateway/     # Excluded from system ApplicationSet (deployed in critical wave)
├── external-secrets/  # Excluded from system ApplicationSet (deployed in critical wave)
├── tailscale/         # Excluded from system ApplicationSet (deployed in critical wave)
└── cloudnative-pg/    # Auto sync - database operator
```

**Mechanism**: ArgoCD ApplicationSet template patch uses `hasPrefix "*"` to determine sync policy:

* **With asterisk**: Manual sync only (`prune: false`, `selfHeal: false`)
* **Without asterisk**: Automated sync (`prune: true`, `selfHeal: true`)
* **Applies to**: Both `src/apps/` and `src/infrastructure/kubernetes/` directories

**Implementation** (from `system.applicationset.yaml`):

```yaml
# Generator selects all directories with * prefix
generators:
  - matrix:
      generators:
        - list: { elements: [] }
        - git:
            directories:
              - path: projects/{cluster}/src/infrastructure/kubernetes/*
              # Exclude directories managed by critical sync wave
              - path: projects/{cluster}/src/infrastructure/kubernetes/cert-manager
                exclude: true
              - path: projects/{cluster}/src/infrastructure/kubernetes/envoy-gateway
                exclude: true
              - path: projects/{cluster}/src/infrastructure/kubernetes/external-secrets
                exclude: true
              - path: projects/{cluster}/src/infrastructure/kubernetes/tailscale
                exclude: true

# Conditional sync policy based on asterisk prefix
templatePatch: |
  {{ if not (hasPrefix "*" .path.basename) }}
  spec:
    syncPolicy:
      automated:
        prune: true
        selfHeal: true
  {{ end }}
```

* **Pros**: Clear visual indicator, functional mechanism, safety for critical infrastructure, applies consistently across apps and system components
* **Cons**: Non-standard filesystem naming, requires careful management, exclusion list maintenance for critical components

**Option 1.2: No Prefix with Metadata Labels** (lungmen.akn pattern)

```
projects/lungmen.akn/src/apps/
├── argocd/
├── vault/
├── pocket-id/
└── home-dashboard/
```

Sync policy controlled through Application-level annotations or labels.

* **Pros**: Clean filesystem listing, standard Kubernetes naming
* **Cons**: Requires additional metadata, less obvious sync behavior, harder to implement in ApplicationSets

**Option 1.3: Separate Directories by Sync Policy**

```
projects/cluster/src/
├── apps/manual/
│   ├── argocd/
│   ├── vault/
│   └── pocket-id/
└── apps/automated/
    └── home-dashboard/
```

* **Pros**: Complete separation, very explicit
* **Cons**: Breaks single `apps/` pattern, harder to reorganize, duplicate ApplicationSet logic

**Chosen Option**: **Option 1.1 - Asterisk Prefix** ✅

**Rationale**:

* Functional mechanism already implemented and working
* Clear visual indicator of sync behavior
* Safety protection for critical infrastructure
* Simple to implement in ApplicationSet templates
* Used consistently in production (amiya.akn)

### Label Schema

**Option 2.1: Minimal Labels** (Current amiya.akn pattern)

```yaml
labels:
  - pairs:
      app.kubernetes.io/name: pocket-id
    includeSelectors: true
    includeTemplates: true
  - pairs:
      # renovate: datasource=github-release depName=pocket-id/pocket-id
      app.kubernetes.io/version: v0.2.0
    includeTemplates: true
```

* **Pros**: Simple, explicit version tracking for Renovate
* **Cons**: Missing recommended Kubernetes labels

**Option 2.2: Redundant Labels** (Current lungmen.akn pattern)

```yaml
labels:
  - pairs:
      app.kubernetes.io/name: atuin
      app.kubernetes.io/part-of: atuin
    includeTemplates: true
  - pairs:
      app.kubernetes.io/instance: atuin
    includeTemplates: true
    includeSelectors: true
```

* **Pros**: More complete label set
* **Cons**: No version tracking, redundant `part-of` (same as name)

**Option 2.3: Comprehensive Standard Labels** (Recommended)

```yaml
labels:
  - pairs:
      app.kubernetes.io/name: application-name
      app.kubernetes.io/instance: application-name
      app.kubernetes.io/component: application
    includeSelectors: true
    includeTemplates: true
  - pairs:
      # renovate: datasource=helm depName=repo/chart
      app.kubernetes.io/version: v1.0.0
    includeTemplates: true
```

* **Pros**: Kubernetes recommended labels, Renovate support, clear component typing
* **Cons**: Slightly more verbose

**Chosen Option**: **Option 2.3 - Comprehensive Standard Labels** ✅

**Rationale**:

* Kubernetes recommended practice
* Enables better resource filtering and organization
* Supports Renovate automated updates
* Clear component classification (application, database, storage)

### HTTPRoute Naming

**Option 3.1: Simple Name** (Current amiya.akn pattern)

```yaml
metadata:
  name: pocket-id
```

* **Pros**: Clean, matches service name
* **Cons**: Potential conflicts with other route types

**Option 3.2: Suffixed Name** (Current lungmen.akn pattern)

```yaml
metadata:
  name: atuin-websecure
```

* **Pros**: Explicit protocol indication
* **Cons**: Redundant when only one route exists

**Option 3.3: Context-Aware Naming** (Recommended)

* **Single route**: Use application name (`application-name`)

* **Multiple routes**: Use descriptive suffixes (`application-name-public`, `application-name-websecure`)

* **Pros**: Minimal verbosity when possible, clear when needed

* **Cons**: Requires decision based on context

**Chosen Option**: **Option 3.3 - Context-Aware Naming** ✅

**Rationale**:

* Best of both approaches
* Reduces unnecessary verbosity
* Provides clarity when multiple routes exist

## Decision Outcome

**Chosen Approach**: **Comprehensive Standardization with Kubernetes Best Practices and ArgoCD Sync Control**

This decision establishes a complete, consistent structure across all Arcane projects, prioritizing:

1. **Kubernetes standard compliance** over custom conventions
2. **Safety-first sync control** using asterisk prefix mechanism
3. **Comprehensive labeling** for proper resource management
4. **Consistent organization** across all project types

## Standards Specification

### 1. Directory Structure

#### 1.1 Application Directory Naming

**Standard**: Lowercase with hyphens, asterisk prefix for manual-sync applications

```
projects/{cluster-name}/src/apps/{application-name}/
projects/{cluster-name}/src/infrastructure/kubernetes/{component-name}/
```

**Asterisk Prefix Convention**:

* **With asterisk (`*`)**: Manual sync only - for critical infrastructure
* **Without asterisk**: Automated sync with prune and selfHeal
* **Applies to**: Both user applications (`src/apps/`) and cluster infrastructure (`src/infrastructure/kubernetes/`)

**Examples - User Applications**:

* `projects/amiya.akn/src/apps/*argocd/` - Manual sync (GitOps platform)
* `projects/amiya.akn/src/apps/*vault/` - Manual sync (Secrets management)
* `projects/amiya.akn/src/apps/*pocket-id/` - Manual sync (Authentication)
* `projects/lungmen.akn/src/apps/actual-budget/` - Auto sync (User application)

**Examples - Infrastructure Components**:

* `projects/amiya.akn/src/infrastructure/kubernetes/*cilium/` - Manual sync (Network CNI)
* `projects/amiya.akn/src/infrastructure/kubernetes/*longhorn/` - Manual sync (Storage CSI)
* `projects/amiya.akn/src/infrastructure/kubernetes/*external-dns/` - Manual sync (DNS automation)
* `projects/lungmen.akn/src/infrastructure/kubernetes/cloudnative-pg/` - Auto sync (Database operator)

**Special Case - Critical Components**:

Some infrastructure components are excluded from the `system` ApplicationSet entirely and deployed in a dedicated critical sync wave (wave `-10` or `0`):

* `cert-manager/` - Certificate management (no asterisk, excluded from system ApplicationSet)
* `envoy-gateway/` - Ingress gateway (no asterisk, excluded from system ApplicationSet)
* `external-secrets/` - Secret synchronization (no asterisk, excluded from system ApplicationSet)
* `tailscale/` - VPN connectivity (no asterisk, excluded from system ApplicationSet)

**When to Use Asterisk**:

> \[!WARNING]
> Folders prefixed with '\*' are special folders that should not be automated under any circumstances. They must be manually synchronized to ensure no unwanted changes are made.

**Criteria for Manual Sync** (`*` prefix):

* **Critical user-facing infrastructure**: ArgoCD, Vault, Crossplane, authentication systems
* **Cluster networking**: CNI (Cilium), DNS automation, service mesh
* **Storage infrastructure**: CSI drivers (Longhorn), storage classes
* **Kubernetes core**: Control plane components, kube-system modifications
* **High-impact changes**: Services where automation could cause cluster-wide outages

**Criteria for Automated Sync** (no prefix):

* **User applications**: Productivity tools, media servers, home automation
* **Isolated services**: Applications with limited cluster dependencies
* **Database operators**: CloudNative-PG, Redis operator (if properly configured)
* **Development workloads**: Non-production testing applications

**Criteria for Exclusion from ApplicationSet** (deployed in critical sync wave):

* **Prerequisite infrastructure**: Services required before other services can function
* **Security foundations**: Certificate management, secret operators
* **Network foundations**: Ingress controllers, VPN connectivity

**Rationale**:

* Standard Kubernetes naming with functional safety layer
* Clear visual indication of sync behavior across all infrastructure types
* Protects critical infrastructure from accidental automation
* Consistent convention between apps and system components
* Filesystem-friendly, tooling-compatible

#### 1.2 Application Structure

```
{application-name}/
├── kustomization.yaml          # Main Kustomize configuration
├── {app}.{resource}.yaml       # Resource files
├── {chart}.helmvalues/         # Helm values directory (if using Helm)
│   ├── default.yaml            # Base values
│   ├── hardened.yaml           # Security hardening
│   ├── addon:{name}.yaml       # Optional addons
│   └── extensions.yaml         # Custom extensions
└── security/                   # Security resources
    ├── kustomization.yaml      # Security resource list
    ├── network-policy.*.yaml   # Network policies
    └── reference-grant.*.yaml  # Gateway API reference grants
```

### 2. File Naming Conventions

#### 2.1 Resource Files

**Pattern**: `{application-name}.{resource-type}.yaml`

**Examples**:

* `pocket-id.statefulset.yaml`
* `atuin.deployment.yaml`
* `argocd.httproute.yaml`
* `immich.postgresql.yaml`

**Special Cases**:

* Database backups: `{app}.postgresql-backup.yaml`
* Object storage: `{app}.postgresql-objectstore.yaml`
* Configuration: `{app}.configuration.externalsecret.yaml`

**Exceptions**: When resource has a distinct semantic name:

* `letsencrypt-issuer-credentials.externalsecret.yaml`

#### 2.2 Helmvalues Directory

**Pattern**: `{chart-name}.helmvalues/`

**Structure**:

* `default.yaml` - Base configuration (REQUIRED)
* `hardened.yaml` - Security hardening overlay (RECOMMENDED)
* `extensions.yaml` - Custom CRDs and extensions (OPTIONAL)
* `addon:{name}.yaml` - Optional feature addons (OPTIONAL)

**Examples**:

* `argocd.helmvalues/default.yaml`
* `argocd.helmvalues/hardened.yaml`
* `argocd.helmvalues/addon:crossplane.yaml`
* `argocd.helmvalues/addon:ksops.yaml`

**Kustomization Integration**:

```yaml
helmCharts:
  - name: chart-name
    repo: https://charts.example.com
    releaseName: release-name
    version: 1.0.0
    valuesFile: chart-name.helmvalues/default.yaml
    additionalValuesFiles:
      - chart-name.helmvalues/hardened.yaml
      - chart-name.helmvalues/extensions.yaml
      - chart-name.helmvalues/addon:feature.yaml
```

#### 2.3 Network Policies

**Pattern**: `network-policy.{purpose}.yaml`

**Standard Policies**:

* `network-policy.default-hardened.yaml` - Baseline deny-all (REQUIRED)

**Application Policies**:

* `network-policy.allow-{app}-from-{source}.yaml`
* `network-policy.allow-{app}-to-{destination}.yaml`

**Database Policies**:

* `network-policy.allow-postgres-from-cnpg.yaml`
* `network-policy.allow-postgres-to-kubernetes-api.yaml`
* `network-policy.allow-postgres-to-s3-backup.yaml`

**Examples**:

* `network-policy.allow-pocket-id-from-envoy-gateway.yaml`
* `network-policy.allow-atuin-from-tailscale.yaml`
* `network-policy.allow-pocket-id-to-internet.yaml`

#### 2.4 Reference Grants

**Pattern**: `reference-grant.{source}-gateway-to-{target}.yaml`

**Examples**:

* `reference-grant.envoy-gateway-to-pocket-id.yaml`
* `reference-grant.cloudflare-gateway-to-pocket-id.yaml`

### 3. Kubernetes Labels

#### 3.1 Standard Labels (Application Level)

**Required Labels** (apply to all resources):

```yaml
labels:
  - pairs:
      app.kubernetes.io/name: {application-name}
      app.kubernetes.io/instance: {application-name}
      app.kubernetes.io/component: application
    includeSelectors: true
    includeTemplates: true
```

**Version Labels** (for Renovate tracking):

```yaml
labels:
  - pairs:
      # renovate: datasource={source} depName={package}
      app.kubernetes.io/version: {version}
    includeTemplates: true
```

**Renovate Sources**:

* `datasource=helm depName=repo/chart` - Helm charts
* `datasource=github-release depName=owner/repo` - GitHub releases
* `datasource=docker depName=registry/image` - Container images

#### 3.2 Component-Specific Labels

**Database Resources**:

```yaml
metadata:
  labels:
    app.kubernetes.io/name: {application-name}
    app.kubernetes.io/component: database
    app.kubernetes.io/instance: {application-name}-database
  name: {application-name}-database
```

**Storage Resources**:

```yaml
metadata:
  labels:
    app.kubernetes.io/name: {application-name}
    app.kubernetes.io/component: storage
    app.kubernetes.io/instance: {application-name}-storage
```

#### 3.3 Label Guidelines

* **app.kubernetes.io/name**: Application identifier (REQUIRED)
* **app.kubernetes.io/instance**: Resource instance name (REQUIRED)
* **app.kubernetes.io/component**: Resource type - `application`, `database`, `storage` (REQUIRED)
* **app.kubernetes.io/version**: Version for dependency tracking (RECOMMENDED)
* **app.kubernetes.io/part-of**: Multi-app grouping (OPTIONAL - only when truly part of larger system)

**Do NOT use**:

* `app.kubernetes.io/part-of: {application-name}` when `part-of` equals `name` (redundant)

### 4. Container Image Management

#### 4.1 Centralized Image Configuration

**Standard**: All container images MUST be defined in `kustomization.yaml` using the `images` field, not in individual resource manifests.

**Rationale**:

* **Centralization**: Single source of truth for all images
* **Version Control**: Easy version updates without touching manifests
* **Registry Management**: Simple registry migration (e.g., docker.io → internal registry)
* **Digest Pinning**: Centralized SHA256 digest management for security
* **Renovate Integration**: Automated image updates via Kustomize transformer

#### 4.2 Image Reference Pattern

**In kustomization.yaml**:

```yaml
images:
  - name: {registry}/{image}
    newTag: {version}
    digest: sha256:{hash}
```

**In Deployment/StatefulSet**:

```yaml
spec:
  containers:
    - name: {app}
      image: {registry}/{image}  # No tag/digest - managed by Kustomize
```

**Kustomize Transformation**: The `images` field transforms all matching image references, replacing tags and digests centrally.

#### 4.3 Image Configuration Examples

**Single Image Application**:

```yaml
# kustomization.yaml
images:
  - name: ghcr.io/actualbudget/actual-server
    newTag: 25.10.0
```

```yaml
# actual-budget.statefulset.yaml
containers:
  - name: actual-budget
    image: ghcr.io/actualbudget/actual-server
```

**Image with Digest Pinning** (recommended for production):

```yaml
# kustomization.yaml
images:
  - name: ghcr.io/atuinsh/atuin
    newTag: v18.0.0
    digest: sha256:8a8a8ef4eb5865656072bace5cc49390b56caa81360f9f0869054777155b6ef1
```

```yaml
# atuin.deployment.yaml
containers:
  - name: atuin
    image: ghcr.io/atuinsh/atuin
```

**Multiple Images** (e.g., sidecar containers):

```yaml
# kustomization.yaml
images:
  - name: ghcr.io/pocket-id/pocket-id
    newTag: v1.10.0-distroless
    digest: sha256:53aaee4ded66e2e163cd74b4bcfcf748c912672501346b08fa1bd8f21d295b81
  - name: docker.io/library/nginx
    newTag: 1.27-alpine
    digest: sha256:abcdef1234567890
```

#### 4.4 Image Update Workflow

**Manual Version Update**:

```bash
# Update kustomization.yaml only
sed -i 's/newTag: 1.0.0/newTag: 1.1.0/' kustomization.yaml

# Kustomize automatically applies to all matching images
kubectl kustomize . | kubectl apply -f -
```

**Renovate Automation**:

Renovate Bot can detect and update image versions in `kustomization.yaml`:

```yaml
# kustomization.yaml
images:
  # renovate: datasource=docker depName=actualbudget/actual-server
  - name: ghcr.io/actualbudget/actual-server
    newTag: 25.10.0
```

#### 4.5 Registry Migration

**Before** (changing registry across multiple files):

```yaml
# Multiple files to update
# app.deployment.yaml
image: docker.io/myapp:1.0.0

# sidecar.yaml
image: docker.io/sidecar:2.0.0
```

**After** (single update in kustomization.yaml):

```yaml
# kustomization.yaml
images:
  - name: docker.io/myapp
    newName: registry.internal.chezmoi.sh/myapp
    newTag: 1.0.0
  - name: docker.io/sidecar
    newName: registry.internal.chezmoi.sh/sidecar
    newTag: 2.0.0
```

All manifest references to `docker.io/myapp` are automatically transformed.

#### 4.6 Security Best Practices

**Digest Pinning** (RECOMMENDED for production):

```yaml
images:
  - name: ghcr.io/pocket-id/pocket-id
    newTag: v1.10.0-distroless
    digest: sha256:53aaee4ded66e2e163cd74b4bcfcf748c912672501346b08fa1bd8f21d295b81
```

**Benefits**:

* Immutable image references
* Protection against tag mutation attacks
* Reproducible deployments
* Clear audit trail

**Tag-Only** (acceptable for development):

```yaml
images:
  - name: ghcr.io/actualbudget/actual-server
    newTag: 25.10.0
```

**Latest Tag** (AVOID in production):

```yaml
# ❌ Avoid this pattern
images:
  - name: myapp
    newTag: latest
```

#### 4.7 Helm Chart Image Override

For applications deployed via Helm charts, image configuration should still be centralized:

**Option 1: Helm Values** (when chart supports image overrides):

```yaml
# chart.helmvalues/default.yaml
image:
  repository: ghcr.io/immich-app/immich-server
  tag: v1.119.1
  digest: sha256:abcdef...
```

**Option 2: Kustomize Transformer** (when chart doesn't support):

```yaml
# kustomization.yaml
helmCharts:
  - name: immich
    repo: https://immich-app.github.io/immich-charts
    version: 0.9.2
    valuesFile: immich.helmvalues/default.yaml

images:
  - name: ghcr.io/immich-app/immich-server
    newTag: v1.119.1
    digest: sha256:abcdef...
```

#### 4.8 Exception Cases

**Helm Charts with Embedded Images**:

When using Helm charts that manage images internally (like ArgoCD, Crossplane), image management remains in Helm values to preserve chart compatibility.

```yaml
# argocd.helmvalues/default.yaml
image:
  repository: quay.io/argoproj/argocd
  tag: v2.13.2
```

**Rationale**: Helm chart maintainers test specific image combinations; overriding via Kustomize may break dependencies.

### 5. Kubernetes Annotations

#### 5.1 HTTPRoute Annotations

**Required Annotations**:

```yaml
metadata:
  annotations:
    external-dns.alpha.kubernetes.io/include-unifi: "true"
    link.argocd.argoproj.io/external-link: https://{hostname}
```

**Purpose**:

* `external-dns.alpha.kubernetes.io/include-unifi`: Enable UniFi DNS integration
* `link.argocd.argoproj.io/external-link`: Provide direct access link in ArgoCD UI

#### 4.2 Other Standard Annotations

**Sync Waves** (ArgoCD):

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "{wave-number}"
```

**Sync Options** (ArgoCD):

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-options: "SkipDryRunOnMissingResource=true"
```

### 6. Resource Naming Standards

#### 5.1 HTTPRoute Naming

**Single Route**:

```yaml
metadata:
  name: {application-name}
```

**Multiple Routes**:

```yaml
metadata:
  name: {application-name}-{purpose}
```

**Examples**:

* `pocket-id` - Single route for private access
* `pocket-id-public` - Public route variant
* `atuin-websecure` - HTTPS route (when distinguishing from HTTP)

#### 5.2 PostgreSQL Database Naming

**Cluster Name**: `{application-name}-database`

**Example**:

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  labels:
    app.kubernetes.io/component: database
    app.kubernetes.io/instance: pocket-id-database
  name: pocket-id-database
```

#### 5.3 Secret Naming

**Database Secrets**: `{application-name}-database-{role}`

**Examples**:

* `pocket-id-database-pocket-id` (application role)
* `atuin-database-atuin` (application role)

**ExternalSecret Naming**: Match target secret name

```yaml
metadata:
  name: pocket-id-database-pocket-id  # Matches generated secret
```

#### 5.4 Service Naming

**Standard**: `{application-name}`

**Database Services** (CloudNative-PG generated):

* `{application-name}-database-rw` (read-write service)
* `{application-name}-database-ro` (read-only service)
* `{application-name}-database-r` (read service)

### 7. Kustomization Structure

#### 6.1 Standard Kustomization

```yaml
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: {namespace-name}

labels:
  - pairs:
      app.kubernetes.io/name: {application-name}
      app.kubernetes.io/instance: {application-name}
      app.kubernetes.io/component: application
    includeSelectors: true
    includeTemplates: true
  - pairs:
      # renovate: datasource={source} depName={package}
      app.kubernetes.io/version: {version}
    includeTemplates: true

resources:
  - {application-name}.deployment.yaml
  - {application-name}.service.yaml
  - {application-name}.httproute.yaml
  - {application-name}.postgresql.yaml
  - {application-name}.postgresql-backup.yaml
  - {application-name}.postgresql-objectstore.yaml
  - security/
```

#### 6.2 Helm-Based Kustomization

```yaml
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: {namespace-name}

resources:
  - {application-name}.httproute.yaml
  - {application-name}.externalsecret.yaml
  - security/

helmCharts:
  - name: {chart-name}
    repo: {chart-repository}
    releaseName: {release-name}
    version: {chart-version}
    valuesFile: {chart-name}.helmvalues/default.yaml
    additionalValuesFiles:
      - {chart-name}.helmvalues/hardened.yaml
      - {chart-name}.helmvalues/extensions.yaml
```

**Note**: Labels are typically applied through Helm values rather than Kustomization when using helmCharts.

#### 6.3 Component-Based Kustomization

**Usage**: Infrastructure components that are reusable

```yaml
---
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
```

**When to Use**:

* Reusable infrastructure patterns
* Shared component libraries
* Multi-cluster deployments

**When NOT to Use**:

* Standard applications
* Cluster-specific resources

### 8. Security Directory Structure

#### 7.1 Standard Structure

```
security/
├── kustomization.yaml
├── network-policy.default-hardened.yaml
├── network-policy.allow-{app}-from-{source}.yaml
├── network-policy.allow-{app}-to-{destination}.yaml
├── network-policy.allow-postgres-*.yaml
└── reference-grant.*.yaml
```

#### 7.2 Security Kustomization

```yaml
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - network-policy.default-hardened.yaml
  - network-policy.allow-{app}-from-{source}.yaml
  - network-policy.allow-postgres-from-cnpg.yaml
  - network-policy.allow-postgres-to-kubernetes-api.yaml
  - network-policy.allow-postgres-to-s3-backup.yaml
  - reference-grant.envoy-gateway-to-{app}.yaml
```

### 9. Secret Management

#### 8.1 OpenBao Path Structure

**Per-Application Secrets**:

```
/{cluster-name}/{application-name}/{category}/{secret-name}
```

**Examples**:

* `amiya.akn/pocket-id/database/postgresql`
* `lungmen.akn/atuin/auth/oidc-client`
* `amiya.akn/argocd/auth/github-oauth`

**Categories**:

* `database/` - Database credentials
* `auth/` - Authentication secrets (OIDC, OAuth, JWT)
* `api-keys/` - Third-party API tokens
* `certificates/` - Application-specific TLS certificates

**Reference**: See [ADR-003: OpenBao Path Naming Conventions](./003-openbao-path-naming-conventions.md)

#### 8.2 ExternalSecret Configuration

**Standard Pattern**:

```yaml
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: {secret-name}
spec:
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: vault.chezmoi.sh
  target:
    template:
      data:
        username: {username}
        password: "{{ .password }}"
  dataFrom:
    - extract:
        key: {cluster-name}/{app-name}/{category}/{secret-name}
```

**Refresh Intervals**:

* Production critical: `5m`
* Standard applications: `1h`
* Non-critical: `6h`

#### 8.3 Database Secret Pattern

```yaml
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: {application-name}-database-{role}
spec:
  dataFrom:
    - extract:
        key: {cluster-name}/{application-name}/database/postgresql
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: vault.chezmoi.sh
  target:
    template:
      data:
        username: {role-name}
        password: "{{ .password }}"
        uri: "postgres://{role-name}:{{ .password }}@{app}-database-rw:5432/{database-name}"
```

### 10. Database Management

#### 9.1 CloudNative-PG Cluster

**Standard Configuration**:

```yaml
---
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  labels:
    app.kubernetes.io/component: database
    app.kubernetes.io/instance: {application-name}-database
  name: {application-name}-database
spec:
  description: PostgreSQL database dedicated to {application-name}
  enablePDB: false
  instances: 1
  managed:
    roles:
      - name: {application-name}
        connectionLimit: -1
        comment: PostgreSQL role for {application-name}
        ensure: present
        inherit: true
        login: true
        passwordSecret:
          name: {application-name}-database-{application-name}
  plugins:
    - enabled: true
      isWALArchiver: true
      name: barman-cloud.cloudnative-pg.io
      parameters:
        barmanObjectName: selfhosted
        serverName: {ULID}  # DRP::src_ulid
  storage:
    size: 1Gi
  walStorage:
    size: 1Gi
```

#### 9.2 Database Backup Configuration

**File**: `{application-name}.postgresql-backup.yaml`

```yaml
---
apiVersion: postgresql.cnpg.io/v1
kind: ScheduledBackup
metadata:
  name: {application-name}-database
spec:
  schedule: "0 0 */12 * * *"  # Every 12 hours
  backupOwnerReference: self
  cluster:
    name: {application-name}-database
```

#### 9.3 Object Storage Configuration

**File**: `{application-name}.postgresql-objectstore.yaml`

**See**: CloudNative-PG documentation for Barman object store configuration

### 11. Namespace Management

#### 10.1 Namespace Creation

**ArgoCD-Managed Applications**:

* **No explicit namespace.yaml file**
* ArgoCD creates namespace via Application CR:

```yaml
spec:
  destination:
    namespace: {namespace-name}
  syncPolicy:
    syncOptions:
      - CreateNamespace=true
```

**Infrastructure Components**:

* **Explicit namespace.yaml when**:
  * Namespace requires specific labels or annotations
  * Namespace configuration is complex
  * Namespace is shared across multiple applications

**Example**:

```yaml
---
apiVersion: v1
kind: Namespace
metadata:
  name: {namespace-name}
  labels:
    app.kubernetes.io/name: {namespace-name}
```

### 12. Project Structure Patterns

#### 11.1 Core Platform Cluster (amiya.akn pattern)

```
projects/amiya.akn/
├── README.md
├── architecture.d2
├── src/
│   ├── apps/
│   │   ├── *argocd/             # Manual sync - Core GitOps
│   │   ├── *vault/              # Manual sync - Secret management
│   │   ├── *pocket-id/          # Manual sync - Authentication
│   │   ├── *crossplane/         # Manual sync - Infrastructure provisioning
│   │   └── home-dashboard/      # Auto sync - User application
│   └── infrastructure/
│       ├── kubernetes/          # Cluster infrastructure components
│       │   ├── *cilium/         # Manual sync - Network CNI
│       │   ├── *longhorn/       # Manual sync - Storage CSI
│       │   ├── *external-dns/   # Manual sync - DNS automation
│       │   ├── *kube/           # Manual sync - Kubernetes core
│       │   ├── cert-manager/    # Critical wave - Certificates (excluded from system ApplicationSet)
│       │   ├── envoy-gateway/   # Critical wave - Ingress (excluded from system ApplicationSet)
│       │   ├── external-secrets/# Critical wave - Secrets (excluded from system ApplicationSet)
│       │   ├── tailscale/       # Critical wave - VPN (excluded from system ApplicationSet)
│       │   └── cloudnative-pg/  # Auto sync - Database operator
│       └── crossplane/          # Infrastructure as Code definitions
├── docs/
│   ├── BOOTSTRAP_TALOS.md
│   ├── BOOTSTRAP_ARGOCD.md
│   └── bootstrap/
└── assets/
    └── architecture.svg
```

#### 11.2 Application Cluster (lungmen.akn pattern)

```
projects/lungmen.akn/
├── README.md
├── architecture.d2
├── src/
│   ├── apps/
│   │   ├── actual-budget/       # Auto sync - User applications
│   │   ├── atuin/
│   │   ├── immich/
│   │   ├── jellyfin/
│   │   ├── paperless-ngx/
│   │   └── silverbullet/
│   └── infrastructure/
│       ├── kubernetes/          # Cluster infrastructure components
│       │   ├── *cilium/         # Manual sync - Network CNI
│       │   ├── *longhorn/       # Manual sync - Storage CSI
│       │   ├── *external-dns/   # Manual sync - DNS automation
│       │   ├── cert-manager/    # Critical wave - Certificates
│       │   ├── envoy-gateway/   # Critical wave - Ingress
│       │   ├── external-secrets/# Critical wave - Secrets
│       │   ├── tailscale/       # Critical wave - VPN
│       │   ├── cloudnative-pg/  # Auto sync - Database operator
│       │   └── smb-csi-driver/  # Auto sync - SMB storage driver
│       ├── crossplane/          # Infrastructure as Code definitions
│       └── talos/               # Talos configuration files
├── docs/
│   ├── BOOTSTRAP_TALOS.md
│   └── BOOTSTRAP_ARGOCD.md
└── assets/
    └── architecture.svg
```

#### 11.3 Shared Infrastructure (chezmoi.sh pattern)

```
projects/chezmoi.sh/
├── README.md
└── src/
    └── infrastructure/
        ├── crossplane/
        │   ├── aws/             # AWS provider
        │   ├── cloudflare/      # Cloudflare provider
        │   └── vault/           # Vault provider
        └── ansible/
            └── roles/
```

## Implementation Strategy

### Phase 1: Documentation and Validation

**Actions**:

1. **Publish ADR** as canonical reference
2. **Create migration guide** with before/after examples
3. **Update project READMEs** to reference this ADR
4. **Document asterisk convention** in ArgoCD README

**Timeline**: Immediate

### Phase 2: New Application Compliance

**Actions**:

1. **All new applications** MUST follow these standards
2. **Application templates** created for quick bootstrapping
3. **CI/CD validation** to check compliance (future)
4. **Decision matrix** for asterisk prefix usage

**Timeline**: Immediate for new apps

### Phase 3: Gradual Migration

**Priority Order**:

1. **lungmen.akn** (Active development, smaller scope)
   * Standardize labels across all apps
   * Align HTTPRoute naming
   * Update security directory structure
   * Add Renovate version labels

2. **amiya.akn** (Production, higher impact)
   * Standardize labels (add component, instance)
   * Add version labels for Renovate where missing
   * Standardize ExternalSecret refresh intervals
   * Verify asterisk prefix usage aligns with criteria

3. **chezmoi.sh** (Infrastructure, minimal changes)
   * Ensure Crossplane resource naming consistency

**Timeline**: Incremental, non-breaking changes prioritized

### Phase 4: Tooling and Automation

**Actions**:

1. **Validation scripts** to check compliance
2. **Application generator** (cookiecutter/template)
3. **Documentation generator** for standard structures
4. **Renovate configuration** optimized for label-based tracking

**Timeline**: After Phase 2 completion

## Migration Guidelines

### Safe Migration Approach

**Principle**: Maintain backward compatibility during migration

**Steps**:

1. **Audit current state** of each project
2. **Plan changes** in isolated branches
3. **Test in lungmen.akn** (non-production) first
4. **Apply to amiya.akn** with careful validation
5. **Monitor ArgoCD sync** for issues

### Asterisk Prefix Management

**Adding Asterisk** (to existing auto-sync app):

> \[!CAUTION]
> This changes sync behavior. Application will stop auto-syncing and require manual sync.

```bash
# Rename directory
git mv projects/amiya.akn/src/apps/critical-app \
       projects/amiya.akn/src/apps/*critical-app

# Commit with clear message
git commit -m ":wrench:(project:amiya.akn): Convert critical-app to manual sync per ADR-008"
```

**Removing Asterisk** (to enable auto-sync):

> \[!CAUTION]
> This enables automated prune and selfHeal. Ensure application is stable.

```bash
# Rename directory
git mv projects/lungmen.akn/src/apps/*stable-app \
       projects/lungmen.akn/src/apps/stable-app

# Commit with clear message
git commit -m ":wrench:(project:lungmen.akn): Enable auto-sync for stable-app per ADR-008"
```

### Label Standardization

**Non-Breaking Change**: Labels can be added without disruption

**Approach**:

1. Add missing standard labels to kustomization.yaml
2. ArgoCD will update resources on next sync
3. Verify label propagation with `kubectl get {resource} --show-labels`

**Example Diff**:

```diff
 labels:
   - pairs:
       app.kubernetes.io/name: atuin
-      app.kubernetes.io/part-of: atuin
+      app.kubernetes.io/instance: atuin
+      app.kubernetes.io/component: application
     includeTemplates: true
+    includeSelectors: true
+  - pairs:
+      # renovate: datasource=docker depName=ghcr.io/atuinsh/atuin
+      app.kubernetes.io/version: v18.0.0
+    includeTemplates: true
```

### HTTPRoute Naming

**Breaking Change**: Renaming HTTPRoutes requires coordination

**Approach**:

1. **Assess impact**: Check Gateway API references
2. **Create new route**: Add route with new name
3. **Test access**: Verify routing works
4. **Remove old route**: Delete old HTTPRoute
5. **Update ArgoCD**: Update Application sync status

**Example**:

```bash
# Before: atuin-websecure
# After: atuin (single route, no suffix needed)

# Apply new route
kubectl apply -f atuin.httproute.yaml

# Test access
curl -I https://atuin.chezmoi.sh

# Remove old route (after validation)
kubectl delete httproute atuin-websecure -n atuin
```

## Consequences

### Positive

* ✅ **Consistency**: Single source of truth for all project structures
* ✅ **Safety**: Asterisk prefix protects critical infrastructure from automation
* ✅ **Reduced Cognitive Load**: No context switching between different patterns
* ✅ **Better Tooling**: Automation can rely on predictable structures
* ✅ **Easier Onboarding**: Clear standards for new applications
* ✅ **Improved Discoverability**: Predictable resource locations
* ✅ **Renovate Integration**: Standardized version tracking across all projects
* ✅ **ArgoCD Efficiency**: Predictable application structures improve GitOps workflows
* ✅ **Migration Path**: Clear guidelines for standardizing existing projects

### Negative

* ⚠️ **Migration Effort**: Existing projects require refactoring
* ⚠️ **Learning Curve**: Operators must learn comprehensive standards including asterisk convention
* ⚠️ **Breaking Changes**: Some migrations (HTTPRoute renaming) may cause brief disruptions
* ⚠️ **Documentation Overhead**: Standards require ongoing maintenance as ecosystem evolves
* ⚠️ **Asterisk Mechanism Limitations**: While the asterisk prefix approach is practical and elegant for basic use cases, it has significant extensibility and customization limitations:
  * **Binary Control**: Only supports two states (manual vs auto-sync) with no granular control
  * **No Partial Automation**: Cannot enable selective automation (e.g., auto-sync but no prune, or selfHeal without auto-sync)
  * **Limited Flexibility**: ApplicationSet template patches cannot accommodate complex per-app sync policies
  * **Filesystem Coupling**: Sync behavior tied to directory naming creates coupling between filesystem structure and runtime behavior
  * **No Runtime Overrides**: Changing sync policy requires filesystem rename and Git commit, preventing temporary policy adjustments
  * **Future Refactoring Required**: This mechanism will need rework when more granular sync control becomes necessary (e.g., staged rollouts, partial automation, application-specific sync windows)

### Neutral

* 📝 **Template Maintenance**: Application templates need updates to match standards
* 📝 **CI/CD Updates**: Validation pipelines should enforce new standards
* 📝 **Documentation Updates**: All project READMEs need standard structure references
* 📝 **Decision Matrix**: Need clear criteria for when to use asterisk prefix

## Validation and Compliance

### Automated Validation (Future)

**Validation Checks**:

1. **Directory Naming**: Lowercase with hyphens, optional asterisk prefix
2. **Label Presence**: Required labels on all resources
3. **File Naming**: Consistent patterns across projects
4. **Security Directory**: Presence and structure
5. **Kustomization Structure**: Namespace, labels, resources fields
6. **Asterisk Usage**: Verify sync policy matches prefix

**Implementation**:

* Pre-commit hooks for file naming
* CI/CD pipeline for structure validation
* ArgoCD health checks for deployed resources

### Manual Review Checklist

For each new application:

* [ ] Directory name follows lowercase-hyphen pattern
* [ ] Asterisk prefix decision documented (manual vs auto-sync)
* [ ] kustomization.yaml includes namespace, standard labels
* [ ] Version label includes Renovate comment
* [ ] Files follow `{app}.{resource}.yaml` pattern
* [ ] Security directory exists with standard policies
* [ ] HTTPRoute includes required annotations
* [ ] Database resources use `{app}-database` naming
* [ ] ExternalSecrets reference correct OpenBao paths
* [ ] Helmvalues directory (if Helm) follows structure

### Asterisk Prefix Decision Matrix

**Use `*` prefix when**:

* [ ] Application is critical infrastructure (ArgoCD, Vault, Crossplane)
* [ ] Automated changes could cause cluster-wide outages
* [ ] Application provides authentication/authorization services
* [ ] Manual review required for all changes
* [ ] Application is in early deployment/testing phase

**Omit `*` prefix when**:

* [ ] Application is isolated user-facing service
* [ ] Automated sync/prune is safe
* [ ] Application has minimal cluster dependencies
* [ ] Rapid iteration and updates desired

## References

### Internal Documentation

* [ADR-003: OpenBao Path Naming Conventions](./003-openbao-path-naming-conventions.md) - Secret path structure
* [ADR-004: OpenBao Policy Naming Conventions](./004-openbao-policy-naming-conventions.md) - Policy standards
* [CLAUDE.md](../../CLAUDE.md) - Repository structure overview
* [ArgoCD README](../../projects/amiya.akn/src/apps/*argocd/README.md) - ArgoCD app structure and asterisk convention
* [Renovate Configuration Guide](../RENOVATE.md) - Automated dependency management with label and image tracking

### Kubernetes Standards

* [Kubernetes Recommended Labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/) - Official label standards
* [Kubernetes Object Names](https://kubernetes.io/docs/concepts/overview/working-with-objects/names/) - Naming conventions
* [Kustomize Documentation](https://kubectl.docs.kubernetes.io/references/kustomize/) - Resource management patterns

### ArgoCD Integration

* [ArgoCD Best Practices](https://argo-cd.readthedocs.io/en/stable/user-guide/best_practices/) - GitOps patterns
* [ArgoCD App of Apps Pattern](https://argo-cd.readthedocs.io/en/stable/operator-manual/cluster-bootstrapping/) - Application organization
* [ArgoCD Sync Waves](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/) - Ordered deployments
* [ArgoCD ApplicationSet](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/) - Dynamic application generation

### Dependency Management

* [Renovate Configuration](https://docs.renovatebot.com/configuration-options/) - Automated updates
* [Renovate Kubernetes Manager](https://docs.renovatebot.com/modules/manager/kubernetes/) - Label-based version tracking

## Changelog

* **2025-11-01**: Added Renovate configuration for automated label and image override tracking, including regex managers for `app.kubernetes.io/version` labels and Kustomize `images` field updates
* **2025-10-31**: Initial ADR creation establishing comprehensive project structure and naming standards across all Arcane infrastructure projects, including asterisk prefix convention for ArgoCD sync control
