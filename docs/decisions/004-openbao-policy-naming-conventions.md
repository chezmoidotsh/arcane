<!--
status: "proposed"
date: 2025-06-30
decision-makers: ["Alexandre"]
consulted: ["ai/cursor-auto", "ai/openai-gpt-4o-mini"]
informed: []
-->

# OpenBao Policy Naming and Scope Conventions

## Context and Problem Statement

Following the implementation of our OpenBao secrets mount topology ([ADR-002](./002-openbao-secrets-topology.md)) and path naming conventions ([ADR-003](./003-openbao-path-naming-conventions.md)), we need to establish consistent policy naming and scope conventions. Without standardized policy design, access control becomes inconsistent, security boundaries blur, and operational complexity increases.

The challenge is defining policy conventions that are:

* **Secure enough** to maintain Zero Trust principles
* **Simple enough** for solo homelab operation
* **Consistent** across all clusters and services
* **Scalable** as the infrastructure grows

## Decision Drivers

### Functional Requirements

* **Granular Access Control**: Policies should provide least-privilege access to specific path patterns
* **Cross-Cluster Consistency**: Similar services across clusters should have similar policy structures
* **Operational Clarity**: Policy names should clearly indicate their purpose and scope
* **Security Compliance**: Maintain Zero Trust principles with proper isolation

### Non-Functional Requirements

* **Zero Trust Security**: Enforce mount-level and path-level isolation
* **Operational Simplicity**: Minimize complexity for single-operator environment
* **Audit Trail**: Clear policy names enable better access tracking
* **Evolutionary Design**: Support future scaling without major restructuring

### Constraints

* **Homelab Context**: Single operator, no multi-team collaboration requirements
* **Policy Limitations**: Limited to the capabilities of the policy template system
* **Existing Architecture**: Must align with established mount topology and path conventions
* **Allowed Characters**: Only alphanumeric characters, hyphens, dots and underscores are allowed

## Considered Options

> Note: Several models were considered, but the final solution is a pragmatic hybrid, tailored for a single-operator environment. This approach combines the clarity and security of function-based policies with select elements from service- and role-based models, to maximize operational simplicity and maintain least-privilege boundaries.

### Option 1: Single Policy Per Cluster ❌

* **Policy Pattern**: `{project-name}-policy`
* **Scope**: `/{project-name}/*`, `/shared/*`
* **Pros**: Simple, minimal policy count
* **Cons**: Overly broad access, violates least privilege, difficult to audit

### Option 2: Service-Based Policies ✅

* **Policy Pattern**: `{project-name}-{service}-policy`
* **Scope**: `/{project-name}/{service}/*`
* **Example**: `amiya.akn-argocd-policy`
* **Pros**: Clear service boundaries
* **Cons**: Doesn't handle shared secrets well, complex cross-dependencies

### Option 3: Function-Based Policies ✅

* **Policy Pattern**: `{project-name}-{function}-policy`
* **Scope**: Based on function (cluster secrets, shared SSO, shared certificates, etc.)
* **Pros**: Logical grouping, handles shared resources well
* **Cons**: Requires careful scope definition

### Option 4: Role-Based Policies ✅

* **Policy Pattern**: `{project-name}-{role}-policy`
* **Scope**: Based on operational roles (read-only, admin, cert-renewal)
* **Pros**: Clear operational boundaries
* **Cons**: Doesn't align well with application boundaries

## Decision Outcome

> The chosen solution is primarily inspired by the function-based approach, but deliberately incorporates aspects of service- and role-based models. This hybrid design is intentional: it addresses the unique needs of a solo operator by balancing operational clarity, security, and future scalability. The resulting policy matrix is thus a pragmatic compromise, not a strict application of any single model.

**Chosen Option**: **Function-Based Policy Design** with specific policy families

### Policy Family Matrix

| Policy family          | Name format                     | Typical path scope                                                                           | Capabilities | Example                         |
| ---------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| **ESO – cluster**      | `{project-name}-eso-policy`     | `/${project-name}/*`, `/shared/third-parties/+/+/{project-name}/*`, `/shared/certificates/*` | `read`       | `amiya.akn-eso-policy`          |
| **ESO - crossplane**   | `amiya.akn-crossplane-policy`   | `/shared/third-parties/*`                                                                    | `read,write` | `amiya.akn-crossplane-policy`   |
| **ESO – authelia**     | `amiya.akn-authelia-policy`     | `/+/+/auth/*` (cross-mount SSO access)                                                       | `read`       | `amiya.akn-authelia-policy`     |
| **ESO - cert renewal** | `amiya.akn-cert-renewal-policy` | `/shared/certificates/letsencrypt/*`                                                         | `read,write` | `amiya.akn-cert-renewal-policy` |

### Policy Design Principles

#### 1. **Least Privilege Access**

* Each policy grants only the minimum required capabilities
* Path scopes are as specific as possible while remaining practical
* No cross-mount access unless explicitly required

#### 2. **Ephemeral Admin Tokens**

* Admin actions use short-lived tokens (TTL ≤ 15 minutes)
* Non-renewable tokens prevent long-term admin access
* No persistent admin policies for regular operations

#### 3. **Function-Based Organization**

* Policies align with operational functions rather than technical boundaries
* Shared resources have dedicated policies for their specific use cases
* Clear separation between read-only (ESO) and read-write (Crossplane, Cert-Renewal) access

#### 4. **Consistent Naming**

* All policies follow `{project-name}-{function}-policy` pattern
* Admin tokens use `{project-name}-admin-ephemeral` pattern
* Names clearly indicate purpose and scope

#### 5. **Exceptions policies**

* `amiya.akn-authelia-policy` is a special cross-mount policy that allows Authelia to read SSO credentials from all project mounts.

### Capability Definitions

#### Read-Only Access (`read`)

* `read` - Access to secret data and metadata
* Used by External Secrets Operator for secret synchronization
* No modification capabilities

#### Read-Write Access (`read,write`)

* `read,write` - Full CRUD operations on secrets
* Used by Crossplane for resource management
* Used by Cert-Manager for certificate renewal

#### Administrative Access (`sudo`)

* `sudo` - Full system access including policy management
* Limited to ephemeral tokens with short TTL
* Non-renewable to prevent long-term admin access

## Rationale

### Why Function-Based Policy Design

* **Operational Clarity**: Policies align with how we actually use the secrets (ESO sync, Crossplane management, cert renewal)
* **Security Boundaries**: Clear separation between read-only consumers and read-write managers
* **Shared Resource Handling**: Dedicated policies for shared secrets without breaking isolation
* **Scalability**: Easy to add new functions without restructuring existing policies

### Why Ephemeral Admin Tokens

* **Security**: Prevents long-term admin access that could be compromised
* **Audit Trail**: Short-lived tokens create clear audit boundaries
* **Operational Discipline**: Forces explicit admin actions rather than persistent admin access
* **Zero Trust Compliance**: Aligns with "never trust, always verify" principles

### Why This Policy Matrix

* **Coverage**: Handles all current use cases (ESO shared/cluster, SSO/Authelia, Crossplane, cert renewal, admin)
* **Consistency**: Similar patterns across all clusters
* **Simplicity**: Only 6 policy types to manage (3 per cluster)
* **Security**: SSO secrets isolated per-project while maintaining shared resource access
* **Flexibility**: Easy to extend for new functions or requirements

## Consequences

### Positive

* ✅ **Security Compliance**: Maintains Zero Trust principles with proper isolation
* ✅ **Operational Clarity**: Clear policy purposes and scopes
* ✅ **Audit Trail**: Policy names clearly indicate access patterns
* ✅ **Scalability**: Easy to add new clusters or functions
* ✅ **Least Privilege**: Each policy grants only necessary access
* ✅ **SSO Security**: Eliminates security vulnerability from shared SSO mount

### Negative

* ⚠️ **Learning Curve**: The operator must understand policy purposes and scopes
* ⚠️ **Token Management**: Ephemeral admin tokens require more operational overhead
* ⚠️ **Policy Count**: More policies to manage than single-policy approach
* ⚠️ **Cross-Mount Complexity**: Authelia policy breaks normal mount isolation principles

## Implementation Considerations

### Policy Creation Strategy

1. **Cluster-Specific Policies**: Create policies for each cluster following the matrix
2. **SSO Migration**: Migrate existing `/shared/sso/*` secrets to per-project mounts
3. **Authelia Cross-Mount Policy**: Create dedicated cross-mount policy for Authelia SSO access
4. **Admin Token Workflow**: Establish process for ephemeral admin token generation
5. **Policy Validation**: Automated checks for policy compliance and scope validation

### Cross-Cluster Considerations

* **SSO vs Third-Party Secrets Architecture**: Different isolation models for different risk profiles
  * **SSO Secrets**: Moved to per-project mounts due to identity spoofing risks (`client_secret` enables impersonation)
  * **Third-Party Secrets**: Remain in shared mount but scoped to project (`/shared/third-parties/+/+/{project-name}/*`) because:
    * Multiple apps within same project legitimately share cloud credentials (e.g., S3 information)
    * Risk profile differs: billing/resource access vs identity impersonation
    * Project-scoped access pattern maintains isolation between projects while enabling intra-project sharing
* **Consistency**: Similar services across clusters should have similar policy structures
* **Isolation**: Ensure cluster-specific policies don't accidentally grant cross-cluster access
* **Security Trade-offs**: Accept controlled cross-mount access for Authelia to maintain centralized SSO

### Monitoring and Compliance

* **Access Monitoring**: Track policy usage and access patterns
* **Policy Validation**: Automated checks for policy compliance
* **Audit Reviews**: Regular review of policy scopes and capabilities

## References

### Architecture Documentation

* [ADR-002: OpenBao Secrets Mount Topology](./002-openbao-secrets-topology.md) - Foundational mount structure decisions
* [ADR-003: OpenBao Path and Naming Conventions](./003-openbao-path-naming-conventions.md) - Path organization and metadata standards
* [OpenBao Policy Documentation](https://openbao.org/docs/concepts/policies/) - Technical policy capabilities and syntax

### Security Guidelines

* [HashiCorp Vault Policy Best Practices](https://developer.hashicorp.com/vault/docs/concepts/policies) - Policy design patterns
* [HashiCorp Vault Security Model](https://developer.hashicorp.com/vault/docs/internals/security) - Security architecture principles
* [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework) - Zero Trust principles
* [Principle of Least Privilege](https://csrc.nist.gov/glossary/term/least_privilege) - Security access control principles
* [Scaling HashiCorp Vault - Policy Sprawl Part 1](https://sunil-tailor.medium.com/scaling-hashicorp-vault-policy-sprawl-part-1-1b0f599b6eae) - Policy organization and naming conventions
* [Secret Management Best Practices](https://kubernetes.io/docs/concepts/configuration/secret/) - Kubernetes-native patterns

## Changelog

* **2025-07-05**: **DEPRECATION**: `*-crossplane-policy` is replaced by `amiya.akn-crossplane-policy` as Crossplane is only running in the `amiya.akn` cluster.
* **2025-07-05**: **DEPRECATION**: Integrate `global-eso-policy` into `{project-name}-eso-policy` as it is way easier to manage it like this.
* **2025-07-01**: **CLARIFICATION**: Only 3 of the 6 policy types are instantiated per cluster.
* **2025-07-01**: **CLARIFICATION**: `global-eso-policy` is shared across all clusters.
* **2025-07-01**: **CLARIFICATION**: `amiya.akn-authelia-policy` and `amiya.akn-cert-renewal-policy` are project-specific.
* **2025-07-01**: **SECURITY**: Restrict `global-eso-policy` scope to exclude `/shared/sso/*` and migrate SSO secrets to per-project isolation. Add `amiya.akn-authelia-policy` for legitimate cross-mount SSO access. This change addresses security vulnerability where any cluster could access OIDC `client_secret` credentials from other clusters, enabling potential identity spoofing attacks, while maintaining shared access to legitimate shared resources (certificates, third-parties).
