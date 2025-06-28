<!--
status: "proposed"
date: 2025-01-29
decision-makers: ["Alexandre"]
consulted: ["ai/claude-4-sonnet", "ai/chatgpt-4o", "HashiCorp Vault Documentation", "OpenBao Community"]
informed: ["Infrastructure Team", "Security Team", "Project Teams"]
tags: ["security", "secrets-management", "vault", "openbao", "kubernetes", "rbac"]
-->

<!-- markdownlint-disable MD036 -->

# OpenBao Secrets Mount Topology and Organizational Structure

## Context and Problem Statement

Following the successful implementation of OpenBao as our centralized secret management solution (documented in [ADR-001](./001-centralized-secret-management.md)), we need to determine the optimal organizational structure for secrets within the OpenBao instance. This decision impacts security isolation, operational complexity, and long-term scalability.

The Arcane infrastructure project manages multiple independent clusters and projects with varying security and operational requirements:

* **amiya.akn** - Primary production Kubernetes cluster with comprehensive infrastructure stack
* **chezmoi.sh** - Domain identity and external services project with external dependencies
* **hass** - Home Assistant infrastructure project with IoT device integrations
* **maison** - Home services and applications cluster with family-accessible services
* **shodan.akn** - Gaming and entertainment cluster with high-performance workloads
* **sof.akn** - "Spirit of Fire" project (future cluster) for experimental workloads

### Current State and Infrastructure Context

OpenBao is deployed and operational with enterprise-grade capabilities:

* **Storage**: PostgreSQL backend with CloudNativePG for high availability and automated backups
* **Security**: Auto-unseal via PKCS#11/SoftHSM with encrypted token storage
* **Integration**: ExternalSecret Operator ready for Kubernetes-native secret distribution
* **Authentication**: OIDC integration with Authelia planned for centralized access control
* **Network**: Dual access via Tailscale (internal) and HTTPRoute (external)

### The Strategic Challenge

We need to design a secret organization strategy that addresses multiple competing requirements:

**Security Requirements:**

* Isolation between projects to prevent credential leakage
* Blast radius containment for security incidents
* Audit trail granularity for compliance
* Principle of least privilege access control

**Operational Requirements:**

* Minimize administrative overhead for daily operations
* Support shared infrastructure secrets (certificates, external APIs)
* Enable project autonomy while maintaining central governance
* Facilitate secret rotation and lifecycle management

**Integration Requirements:**

* Optimal compatibility with ExternalSecret Operator patterns
* Seamless integration with Kubernetes RBAC
* Support for future multi-tenancy scenarios
* Efficient secret distribution to multiple clusters

**Scale Considerations:**

* Support for future project growth without architectural changes
* Potential external team collaboration and delegation
* Performance at scale (secret access latency, mount limits)
* Maintainable automation and infrastructure-as-code

## Decision Drivers

* **Security Isolation**: Prevent unauthorized cross-project access and contain security incidents
* **Operational Efficiency**: Minimize administrative overhead while maintaining security
* **Access Control Clarity**: Implement intuitive RBAC with clear audit boundaries
* **Shared Resource Strategy**: Efficient management of cross-project dependencies
* **Scalability**: Support growth without fundamental architectural changes
* **Integration Optimization**: Maximize compatibility with Kubernetes and ExternalSecret Operator
* **Future Flexibility**: Enable evolution toward advanced patterns (namespaces, delegation) when needed

## Considered Options

### Option 1: Single KV Mount with Path-Based Organization

Store all secrets in one KV v2 engine with hierarchical paths:

* `secrets/projects/amiya-akn/*`
* `secrets/projects/maison/*`
* `secrets/shared/*`

### Option 2: Multiple KV Mounts per Project + Shared Mount

Dedicated KV v2 mount per project plus centralized shared mount:

* `projects-amiya-akn/` (dedicated mount)
* `projects-maison/` (dedicated mount)
* `shared/` (centralized mount)

### Option 3: OpenBao Namespaces with Mount Isolation

Leverage OpenBao Enterprise namespaces for maximum isolation:

* `amiya-akn/` namespace with internal mounts
* `maison/` namespace with internal mounts
* `shared/` namespace for cross-project resources

### Option 4: Federated OpenBao Instances

Deploy separate OpenBao instance per project/cluster with replication for shared secrets.

## Decision Outcome

**Chosen option**: "Multiple KV Mounts per Project + Shared Mount", because it provides optimal balance of security isolation, operational simplicity, and integration compatibility while avoiding the complexity overhead of namespaces for our current scale.

### Implementation Architecture

**Mount Structure:**

```text
OpenBao Instance (root namespace)
├── projects-amiya-akn/     (KV v2 mount)
├── projects-chezmoi-sh/    (KV v2 mount)  
├── projects-hass/          (KV v2 mount)
├── projects-maison/        (KV v2 mount)
├── projects-shodan-akn/    (KV v2 mount)
├── projects-sof-akn/       (KV v2 mount)
└── shared/                 (KV v2 mount)
    ├── certificates/
    ├── external-apis/
    ├── infrastructure/
    └── monitoring/
```

**Key Design Principles:**

* **Mount-level isolation**: Each project has dedicated KV v2 mount for complete policy separation
* **Consistent naming**: `projects-{project-name}` format for clarity and automation
* **Shared resource centralization**: Single `shared/` mount with organized subpaths
* **Future compatibility**: Structure supports evolution to namespaces if delegation needs arise

### Access Control Strategy

**Project-Specific Policies:**

```hcl
# Example policy for amiya.akn project team
path "projects-amiya-akn/*" {
  capabilities = ["read", "list", "create", "update", "delete"]
}

# Read-only access to shared resources
path "shared/*" {
  capabilities = ["read", "list"]
}

# Allow mount discovery for tooling
path "sys/mounts" {
  capabilities = ["read"]
}
```

**Shared Resource Administration:**

```hcl
# Dedicated policy for shared secret administrators
path "shared/*" {
  capabilities = ["read", "list", "create", "update", "delete"]
}

# Read access to all project mounts for coordination
path "projects-*/*" {
  capabilities = ["read", "list"]
}
```

**Authentication Method Strategy:**

* **Kubernetes Auth**: Primary method for ExternalSecret Operator and in-cluster access
* **OIDC Auth**: Human access via Authelia integration with group-based role mapping
* **Token Auth**: Service accounts and automation (time-limited, renewable)

**RBAC Integration:**

* Project teams mapped to OIDC groups: `arcane-{project-name}-admins`
* Shared administrators group: `arcane-vault-admins`
* Read-only access group: `arcane-vault-readers`

### Consequences

**Positive Consequences:**

* ✅ **Security Isolation**: Complete policy separation prevents accidental cross-project access and contains security incidents
* ✅ **Access Control Clarity**: Mount-level boundaries make RBAC intuitive and auditable
* ✅ **Operational Resilience**: Mount-specific issues don't cascade to other projects
* ✅ **Integration Efficiency**: Dedicated SecretStore configurations optimize ExternalSecret Operator performance
* ✅ **Growth Scalability**: Linear scaling through standardized mount creation and policy templates
* ✅ **Shared Resource Governance**: Centralized management with controlled access patterns
* ✅ **Architecture Evolution**: Compatible with future namespace adoption for delegation scenarios
* ✅ **Compliance Readiness**: Clear audit boundaries support regulatory requirements

**Negative Consequences:**

* **Infrastructure Complexity**: Additional automation required for mount lifecycle management
* **Coordination Overhead**: Shared secret changes require cross-team communication
* **Initial Setup Cost**: Higher complexity compared to single-mount approach
* **Mount Limits**: Potential scaling constraints at very large scale (>4500 mounts)

**Risk Mitigation Strategies:**

* **Automation Framework**: Comprehensive Terraform modules for consistent mount and policy management
* **Documentation Standards**: Clear operational procedures and troubleshooting guides for shared resources
* **Monitoring Infrastructure**: Proactive alerting for mount health, access patterns, and policy violations
* **Migration Planning**: Phased rollout with rollback capabilities and extensive testing
* **Governance Process**: Established procedures for shared secret lifecycle and change management

### Implementation Plan

#### Phase 1: Foundation Setup (Days 1-3)

**Mount Creation and Basic Configuration:**

```bash
# Create project-specific KV v2 mounts with consistent naming
vault secrets enable -path=projects-amiya-akn kv-v2
vault secrets enable -path=projects-chezmoi-sh kv-v2
vault secrets enable -path=projects-hass kv-v2
vault secrets enable -path=projects-maison kv-v2
vault secrets enable -path=projects-shodan-akn kv-v2
vault secrets enable -path=projects-sof-akn kv-v2

# Create shared mount with metadata
vault secrets enable -path=shared kv-v2

# Configure mount metadata and options
vault secrets tune -max-versions=10 projects-amiya-akn/
vault secrets tune -max-versions=10 shared/
```

**Prerequisites:**

* OpenBao instance healthy and accessible
* Administrative access configured
* Backup verification completed

#### Phase 2: Authentication and Policy Framework (Days 4-7)

**Kubernetes Authentication Setup:**

```bash
# Enable and configure Kubernetes auth for each cluster
vault auth enable -path=kubernetes-amiya-akn kubernetes
vault write auth/kubernetes-amiya-akn/config \
    kubernetes_host="https://amiya-akn-api.cluster.local:6443" \
    kubernetes_ca_cert=@k8s-ca.crt \
    issuer="https://kubernetes.default.svc.cluster.local"
```

**OIDC Authentication Setup:**

```bash
# Configure Authelia OIDC integration
vault auth enable oidc
vault write auth/oidc/config \
    oidc_discovery_url="https://auth.chezmoi.sh" \
    oidc_client_id="openbao" \
    oidc_client_secret="<secret>" \
    default_role="default"
```

**Policy Deployment via Terraform:**

* Project-specific policies with mount-level isolation
* Shared resource administration policies
* Cross-cutting roles for monitoring and automation

#### Phase 3: Integration Testing and Validation (Days 8-10)

**ExternalSecret Operator Integration:**

* Deploy SecretStore resources for each project
* Test secret retrieval and Kubernetes secret creation
* Validate policy enforcement and access controls

**Access Validation:**

* Test OIDC authentication with Authelia groups
* Verify Kubernetes auth from each cluster
* Validate policy isolation between projects

#### Phase 4: Pilot Migration - amiya.akn (Days 11-14)

**Controlled Migration Process:**

* Select non-critical secrets for initial migration
* Implement parallel access (SOPS + OpenBao) during transition
* Update ExternalSecret configurations incrementally
* Monitor access patterns and performance metrics

**Validation Criteria:**

* All migrated secrets accessible via ESO
* Policy enforcement working correctly
* No service disruptions during migration
* Backup and disaster recovery procedures tested

#### Phase 5: Remaining Projects Migration (Days 15-21)

**Sequential Project Migration:**

* Apply lessons learned from amiya.akn pilot
* Project-by-project migration with dedicated go/no-go decisions
* Maintain SOPS fallback until full validation

**Quality Gates:**

* Secret access latency < 100ms P95
* Zero unauthorized access attempts
* Complete audit trail validation
* Successful backup/restore test per project

#### Phase 6: Operational Hardening (Days 22-28)

**Automation and Monitoring:**

* Terraform modules for mount and policy lifecycle
* Monitoring dashboards for secret access patterns
* Alerting for policy violations and unusual access
* Documentation and runbook completion

**Security Hardening:**

* Regular access review procedures
* Secret rotation validation
* Network policy enforcement
* Vulnerability scanning integration

## Pros and Cons of the Options

### Multiple KV Mounts per Project + Shared Mount ✅ (Selected)

**Advantages:**

* **Security**: Complete policy isolation prevents unauthorized cross-project access
* **Operational Clarity**: Mount-level boundaries provide intuitive access control and audit trails
* **ESO Integration**: Optimal compatibility with ExternalSecret Operator SecretStore patterns
* **Scalability**: Linear growth model with standardized mount creation automation
* **Shared Resource Strategy**: Centralized management for cross-project dependencies (certificates, APIs)
* **Future-Proof**: Evolution path to OpenBao namespaces for delegation scenarios
* **Blast Radius Control**: Mount-specific incidents don't affect other projects
* **Compliance**: Clear audit boundaries support regulatory and security requirements

**Disadvantages:**

* **Automation Dependency**: Requires Terraform infrastructure for mount lifecycle management
* **Initial Complexity**: Higher setup complexity compared to single-mount approach
* **Coordination Requirements**: Shared secret changes need cross-team communication protocols
* **Scale Limitations**: Mount count constraints at very large scale (>4500 mounts)
* **Operational Overhead**: Multiple mount monitoring and maintenance tasks

### Single KV Mount (Monomount)

**Pros:**

* Simplest initial setup and configuration
* Single point of management for all secrets
* No mount count concerns
* Unified secret organization

**Cons:**

* **High blast radius**: Single error can impact all projects
* Complex ACL management with path-based permissions
* Difficult to implement project-specific access controls
* Poor isolation for security incidents
* Challenging to delegate project-specific administration

### OpenBao Namespaces (Enterprise Features)

**Pros:**

* Maximum isolation with complete separation
* Delegated administration capabilities
* Built-in audit trail separation
* Excellent for multi-tenant scenarios

**Cons:**

* Significant operational complexity overhead
* Higher memory usage and unseal time impact
* Over-engineering for current project scale
* Complex cross-namespace secret sharing
* Administrative burden for namespace lifecycle

### Multiple OpenBao Instances

**Pros:**

* Complete operational independence
* Maximum security isolation
* Independent upgrade and maintenance cycles

**Cons:**

* **Operational fragmentation**: Multiple systems to maintain
* Complex shared secret synchronization
* Increased infrastructure overhead
* Fragmented backup and disaster recovery
* Loss of centralized audit capabilities

## More Information

### Technical Implementation Details

**Mount Configuration with Terraform:**

```hcl
# Local values for consistent project definition
locals {
  projects = {
    "amiya-akn"   = { description = "Primary production Kubernetes cluster" }
    "chezmoi-sh"  = { description = "Domain identity and external services" }
    "hass"        = { description = "Home Assistant infrastructure" }
    "maison"      = { description = "Home services and applications" }
    "shodan-akn"  = { description = "Gaming and entertainment cluster" }
    "sof-akn"     = { description = "Spirit of Fire experimental workloads" }
  }
}

# Project-specific KV v2 mounts
resource "vault_mount" "project_mounts" {
  for_each = local.projects
  
  path = "projects-${each.key}"
  type = "kv-v2"
  
  options = {
    version      = "2"
    max_versions = "10"
    cas_required = "false"
  }
  
  description = "Secrets for ${each.value.description}"
  
  # Security configuration
  seal_wrap               = true
  external_entropy_access = true
}

# Shared secrets mount
resource "vault_mount" "shared" {
  path = "shared"
  type = "kv-v2"
  
  options = {
    version      = "2"
    max_versions = "20"  # Higher retention for shared secrets
    cas_required = "true" # Require check-and-set for shared secrets
  }
  
  description = "Shared secrets across all projects"
  seal_wrap   = true
}
```

**Complete Policy Framework:**

```hcl
# Project-specific access policies
resource "vault_policy" "project_policy" {
  for_each = local.projects
  
  name = "project-${each.key}-access"
  
  policy = <<EOT
# Full access to project-specific mount
path "projects-${each.key}/*" {
  capabilities = ["read", "list", "create", "update", "delete"]
}

# Read-only access to shared secrets
path "shared/*" {
  capabilities = ["read", "list"]
}

# Mount discovery for tooling
path "sys/mounts" {
  capabilities = ["read"]
}

# Self-token management
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}
EOT
}

# Shared resource administration policy
resource "vault_policy" "shared_admin" {
  name = "shared-admin"
  
  policy = <<EOT
# Full access to shared mount
path "shared/*" {
  capabilities = ["read", "list", "create", "update", "delete"]
}

# Read access to all project mounts for coordination
path "projects-*/*" {
  capabilities = ["read", "list"]
}

# System administration capabilities
path "sys/mounts" {
  capabilities = ["read", "list"]
}

path "sys/policies/acl/*" {
  capabilities = ["read", "list"]
}
EOT
}

# Read-only policy for monitoring and audit
resource "vault_policy" "readonly" {
  name = "readonly-access"
  
  policy = <<EOT
# Read access to all mounts
path "projects-*/*" {
  capabilities = ["read", "list"]
}

path "shared/*" {
  capabilities = ["read", "list"]
}

# System metadata access
path "sys/mounts" {
  capabilities = ["read"]
}
EOT
}
```

**Kubernetes Authentication Configuration:**

```hcl
# Kubernetes auth method for each cluster
resource "vault_auth_backend" "kubernetes" {
  for_each = local.projects
  
  type = "kubernetes"
  path = "kubernetes-${each.key}"
  
  description = "Kubernetes auth for ${each.key} cluster"
}

resource "vault_kubernetes_auth_backend_config" "kubernetes" {
  for_each = local.projects
  
  backend                = vault_auth_backend.kubernetes[each.key].path
  kubernetes_host        = var.kubernetes_clusters[each.key].api_server
  kubernetes_ca_cert     = var.kubernetes_clusters[each.key].ca_cert
  token_reviewer_jwt     = var.kubernetes_clusters[each.key].token
  issuer                 = "https://kubernetes.default.svc.cluster.local"
  disable_iss_validation = false
}

# Kubernetes auth roles for ExternalSecret Operator
resource "vault_kubernetes_auth_backend_role" "eso" {
  for_each = local.projects
  
  backend                          = vault_auth_backend.kubernetes[each.key].path
  role_name                        = "eso-${each.key}"
  bound_service_account_names      = ["external-secrets-operator"]
  bound_service_account_namespaces = ["external-secrets"]
  token_ttl                        = 3600
  token_max_ttl                    = 7200
  token_policies                   = [vault_policy.project_policy[each.key].name]
  audience                         = "vault"
}
```

**ExternalSecret Operator Integration:**

```yaml
# SecretStore per project with proper authentication
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: openbao-projects-amiya-akn
  namespace: external-secrets
spec:
  provider:
    vault:
      server: "https://vault.chezmoi.sh"
      path: "projects-amiya-akn"
      version: "v2"
      caProvider:
        type: "Secret"
        name: "vault-ca-cert"
        key: "ca.crt"
      auth:
        kubernetes:
          mountPath: "kubernetes-amiya-akn"
          role: "eso-amiya-akn"
          serviceAccountRef:
            name: "external-secrets-operator"
            namespace: "external-secrets"
---
# Separate SecretStore for shared resources (read-only)
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: openbao-shared
  namespace: external-secrets
spec:
  provider:
    vault:
      server: "https://vault.chezmoi.sh"
      path: "shared"
      version: "v2"
      caProvider:
        type: "Secret"
        name: "vault-ca-cert"
        key: "ca.crt"
      auth:
        kubernetes:
          mountPath: "kubernetes-amiya-akn"
          role: "eso-amiya-akn"
          serviceAccountRef:
            name: "external-secrets-operator"
            namespace: "external-secrets"
```

### Operational Procedures

**Adding New Project:**

1. Create new KV mount: `vault secrets enable -path=projects/new-project kv-v2`
2. Deploy project-specific policy via Terraform
3. Configure OIDC role mapping for project team
4. Create ExternalSecret SecretStore for the project
5. Update monitoring and backup configurations

**Managing Shared Secrets:**

1. Coordinate changes through designated shared secret administrators
2. Communicate changes to affected project teams
3. Update secrets in `shared/` mount with appropriate versioning
4. Validate access across affected projects

**Secret Lifecycle:**

* **Creation**: Via OpenBao UI, CLI, or automation
* **Rotation**: Automated where possible, coordinated manual process for complex secrets
* **Archival**: Use KV v2 versioning for historical access
* **Deletion**: Soft delete with recovery period, hard delete after approval

### Security Considerations

**Access Control:**

* OIDC integration with Authelia for centralized authentication
* Group-based role mapping for project teams
* Principle of least privilege for cross-project access
* Regular access reviews and policy audits

**Audit and Monitoring:**

* Comprehensive audit logging for all secret operations
* Alerting on unusual access patterns or bulk operations
* Regular secret usage analysis and cleanup
* Backup verification and disaster recovery testing

**Network Security:**

* TLS encryption for all OpenBao communications
* Network isolation via Kubernetes NetworkPolicy
* Tailscale-based access for external administration
* Regular security scanning and vulnerability assessment

### Migration Strategy from Current SOPS

**Phase 1: Project amiya.akn (Pilot)**

* Migrate non-critical secrets first
* Validate ExternalSecret integration
* Test backup/restore procedures
* Document lessons learned

**Phase 2: Remaining Projects**

* Apply lessons learned from pilot
* Migrate projects in order of complexity/criticality
* Maintain SOPS as fallback during transition

**Phase 3: Cleanup**

* Remove SOPS secrets after validation period
* Update documentation and procedures
* Archive old secret management tooling

### Future Considerations

#### Namespace Evolution

If delegation requirements emerge, the current structure can evolve to use OpenBao namespaces:

```text
platform/ (root namespace)
├── projects/ (current mounts remain)
└── delegated/
    ├── external-team-a/ (child namespace)
    └── external-team-b/ (child namespace)
```

#### Advanced Secret Engines

Consider future integration of:

* PKI engine for certificate management
* Database engine for dynamic credentials
* SSH engine for infrastructure access
* Transit engine for encryption-as-a-service

#### Integration Expansion

* Terraform integration for infrastructure secret injection
* CI/CD pipeline integration for deployment secrets
* Application-native secret consumption patterns

### Success Metrics and KPIs

#### Security and Compliance

* **Zero unauthorized cross-project access incidents** (measured via audit log analysis)
* **Complete audit trail coverage** for all secret operations (100% audit log retention)
* **Policy compliance rate > 99%** (automated policy violation detection)
* **Secret rotation compliance > 95%** within defined rotation windows
* **Successful disaster recovery tests** executed quarterly with < 4 hour RTO

#### Operational Performance

* **Secret access latency < 200ms P95** for ExternalSecret Operator retrievals
* **Vault availability > 99.9%** (excluding planned maintenance)
* **Secret provisioning time < 15 minutes** for new projects (automated pipeline)
* **Mount creation automation success rate > 95%** via Terraform

#### Developer Experience

* **Self-service capabilities** for 80% of secret management tasks
* **Documentation completeness** measured by support ticket reduction
* **Onboarding time < 2 hours** for new project teams
* **Zero manual secret distribution** (100% via ExternalSecret Operator)

#### Operational Efficiency

* **Reduced SOPS maintenance overhead** by 90% post-migration
* **Centralized backup strategy** covering all secrets with automated verification
* **Policy update propagation time < 30 minutes** across all projects

## Alternatives Considered and Rejected

### Why Not OpenBao Namespaces Now?

While OpenBao namespaces provide maximum isolation, they were rejected for current implementation due to:

**Complexity vs. Value Trade-off:**

* Namespace overhead is significant for our current 6-project scale
* Additional memory usage and unseal time impact
* Complex cross-namespace secret sharing mechanisms
* Administrative burden for namespace lifecycle management

**Current Requirements Satisfaction:**

* Mount-level isolation meets our security requirements
* Project autonomy achieved through dedicated mounts
* Shared resource strategy adequately addressed via central mount

**Future Flexibility Maintained:**

* Architecture supports evolution to namespaces when scale or delegation needs justify complexity
* Mount structure compatible with namespace adoption
* Clear migration path available when requirements change

### Why Not Single KV Mount?

* **High blast radius**: Security incidents would affect all projects
* **Complex path-based ACLs**: Difficult to audit and maintain
* **Poor delegation model**: Cannot provide project-level autonomy
* **Integration challenges**: ESO patterns less efficient with path-based access

### Why Not Multiple OpenBao Instances?

* **Operational fragmentation**: Multiple systems to secure, backup, and maintain
* **Shared secret complexity**: Cross-instance synchronization challenges
* **Infrastructure overhead**: Resource multiplication without proportional value
* **Audit consolidation**: Fragmented security and compliance monitoring

## Related Decisions

* [ADR-001: Centralized Secret Management](./001-centralized-secret-management.md) - Establishes OpenBao as the chosen secret management solution

## References and Further Reading

### Primary References

* [ADR-001: Centralized Secret Management](./001-centralized-secret-management.md)
* [OpenBao Official Documentation](https://openbao.org/docs/)
* [OpenBao KV v2 Secrets Engine](https://openbao.org/docs/secrets/kv/kv-v2/)

### Integration Documentation

* [ExternalSecret Operator - Vault Provider](https://external-secrets.io/latest/provider/hashicorp-vault/)
* [Kubernetes Authentication Method](https://openbao.org/docs/auth/kubernetes/)
* [OIDC Authentication Method](https://openbao.org/docs/auth/jwt/)

### Architecture and Best Practices

* [HashiCorp Vault Mount Strategies](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure)
* [Vault Security Best Practices](https://developer.hashicorp.com/vault/tutorials/operations/production-hardening)
* [Secret Management in Kubernetes](https://kubernetes.io/docs/concepts/configuration/secret/)

### Community Resources

* [OpenBao GitHub Repository](https://github.com/openbao/openbao)
* [Vault Community Forum Discussions on Mount Strategies](https://discuss.hashicorp.com/c/vault/)
* [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/)

***

**Note**: This ADR builds upon the infrastructure established in ADR-001 and focuses specifically on the organizational structure of secrets within the operational OpenBao instance. The chosen approach balances immediate operational needs with future scalability and enterprise capabilities available through the OpenBao community fork.
