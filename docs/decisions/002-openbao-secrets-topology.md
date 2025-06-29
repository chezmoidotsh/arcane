<!--
status: "proposed"
date: 2025-01-28
decision-makers: ["Alexandre"]
consulted: ["ai/claude-4-sonnet", "ai/chatgpt-4o"]
informed: []
-->

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

### Current Infrastructure Context

OpenBao is operational with the following enterprise-grade setup:

* **Storage**: PostgreSQL backend with CloudNativePG for high availability
* **Security**: Auto-unseal via PKCS#11/SoftHSM with encrypted token storage
* **Integration**: ExternalSecret Operator for Kubernetes-native secret distribution
* **Authentication**: OIDC integration with Authelia for centralized access control
* **Network**: Dual access via Tailscale (internal) and HTTPRoute (external)

### The Strategic Challenge

The core challenge is designing a secret organization strategy that balances competing architectural requirements. According to HashiCorp's [Vault Architecture Guide](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure), secret organization directly impacts security boundaries and operational overhead.

**Security Requirements:**

* Isolation between projects to prevent credential leakage ([Zero Trust Architecture principles](https://www.nist.gov/publications/zero-trust-architecture))
* Blast radius containment for security incidents
* Principle of least privilege access control

**Operational Requirements:**

* Minimize administrative overhead for daily operations
* Support shared infrastructure secrets (certificates, external APIs)
* Enable project autonomy while maintaining central governance
* Facilitate secret rotation and lifecycle management

**Integration Requirements:**

* Optimal compatibility with [ExternalSecret Operator patterns](https://external-secrets.io/latest/provider/hashicorp-vault/)
* Seamless integration with Kubernetes RBAC
* Efficient secret distribution to multiple clusters

## Decision Drivers

* **Security Isolation**: Prevent unauthorized cross-project access and contain security incidents
* **Operational Efficiency**: Minimize administrative overhead while maintaining security posture
* **Access Control Clarity**: Implement intuitive RBAC with clear audit boundaries
* **Shared Resource Strategy**: Efficient management of cross-project dependencies
* **Scalability**: Support growth without fundamental architectural changes
* **Integration Optimization**: Maximize compatibility with Kubernetes and ExternalSecret Operator
* **Future Flexibility**: Enable evolution toward advanced patterns when needed

## Considered Options

### Option 1: Single KV Mount with Path-Based Organization (Monolithic)

Store all secrets in one KV v2 engine with hierarchical paths following the [single namespace pattern](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure#single-namespace):

```text
secrets/
├── projects/
│   ├── amiya-akn/
│   ├── maison/
│   └── ...
└── shared/
```

**Rationale**: Simplest approach with unified secret organization, commonly used in smaller deployments.

### Option 2: Multiple KV Mounts per Project + Shared Mount (Mount Isolation)

Dedicated KV v2 mount per project plus centralized shared mount following [mount-based isolation patterns](https://developer.hashicorp.com/vault/docs/enterprise/namespaces#use-cases):

```text
projects-amiya-akn/    (dedicated KV v2 mount)
projects-maison/       (dedicated KV v2 mount)  
shared/               (centralized KV v2 mount)
```

**Rationale**: Provides policy-level isolation without namespace complexity, following HashiCorp's recommended [multi-mount strategy](https://developer.hashicorp.com/vault/tutorials/policies/policies#policy-syntax).

### Option 3: OpenBao Namespaces with Mount Isolation

Leverage OpenBao namespaces for maximum isolation following [namespace isolation patterns](https://developer.hashicorp.com/vault/docs/enterprise/namespaces):

```text
amiya-akn/     (dedicated namespace)
maison/        (dedicated namespace)
shared/        (root namespace for shared resources)
```

**Rationale**: Maximum security isolation with delegated administration capabilities, suitable for enterprise multi-tenancy.

### Option 4: Federated OpenBao Instances (Instance Per Project)

Deploy separate OpenBao instance per project/cluster with replication for shared secrets.

**Rationale**: Complete operational independence, following microservices patterns but at infrastructure level.

## Decision Outcome

**Chosen option**: "Multiple KV Mounts per Project + Shared Mount" (Option 2), because it provides optimal balance of security isolation, operational simplicity, and integration compatibility while avoiding the complexity overhead of namespaces for our current scale.

This decision aligns with HashiCorp's [recommended practices for medium-scale deployments](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure#when-to-use-namespaces) where mount-level isolation provides sufficient security boundaries without namespace administrative overhead.

### Implementation Architecture

**Mount Structure:**

```text
OpenBao Instance (root namespace)
├── amiya.akn/     (KV v2 mount)
├── hass/          (KV v2 mount)
├── maison/        (KV v2 mount)
├── shodan.akn/    (KV v2 mount)
└── shared/        (KV v2 mount)
    ├── certificates/       (Let's Encrypt, internal CAs)
    ├── third-party/        (GitHub tokens, cloud provider keys)
    ├── infrastructure/     (monitoring, backup credentials)
    └── network/            (VPN keys, service mesh certificates)
```

### Key Design Principles

Based on [Vault Security Best Practices](https://developer.hashicorp.com/vault/tutorials/operations/production-hardening) and [Zero Trust principles](https://www.nist.gov/publications/zero-trust-architecture):

* **Mount-level isolation**: Each project has dedicated KV v2 mount for complete policy separation
* **Consistent naming**: `{project-name}` format for clarity and automation
* **Shared resource centralization**: Single `shared/` mount with organized subpaths for cross-project dependencies
* **Future compatibility**: Structure supports evolution to namespaces if delegation needs arise

### Access Control Architecture

The access control strategy implements [role-based access control (RBAC)](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) principles with clear separation of concerns:

**Project Isolation Pattern:**
Each project mount has dedicated policies preventing cross-project access, following the [principle of least privilege](https://csrc.nist.gov/glossary/term/least_privilege).

**Shared Resource Governance:**
Centralized administration for shared secrets with read-only project access, implementing [separation of duties](https://csrc.nist.gov/glossary/term/separation_of_duty).

**Authentication Strategy:**

1. **Kubernetes Auth**: Primary method for ExternalSecret Operator integration
2. **OIDC Auth**: Human access via Authelia with group-based role mapping
3. **Token Auth**: Service accounts and automation with time-limited tokens

## Consequences

### Positive Consequences

* ✅ **Security Isolation**: Complete policy separation prevents accidental cross-project access and contains security incidents ([Defense in Depth](https://csrc.nist.gov/glossary/term/defense_in_depth))
* ✅ **Access Control Clarity**: Mount-level boundaries make RBAC intuitive and auditable
* ✅ **Operational Resilience**: Mount-specific issues don't cascade to other projects
* ✅ **Integration Efficiency**: Dedicated SecretStore configurations optimize [ExternalSecret Operator performance](https://external-secrets.io/latest/provider/hashicorp-vault/#performance-considerations)
* ✅ **Growth Scalability**: Linear scaling through standardized mount creation and policy templates
* ✅ **Shared Resource Governance**: Centralized management with controlled access patterns
* ✅ **Architecture Evolution**: Compatible with future namespace adoption for delegation scenarios
* ✅ **Compliance Readiness**: Clear audit boundaries support regulatory requirements

### Negative Consequences

* **Infrastructure Complexity**: Additional automation required for mount lifecycle management
* **Coordination Overhead**: Shared secret changes require cross-team communication
* **Initial Setup Cost**: Higher complexity compared to single-mount approach
* **Mount Limits**: Potential scaling constraints at very large scale ([>4500 mounts per instance](https://developer.hashicorp.com/vault/docs/internals/limits))

### Risk Mitigation

* **Automation Framework**: Comprehensive Infrastructure-as-Code for consistent management
* **Documentation Standards**: Clear operational procedures for shared resources
* **Monitoring Infrastructure**: Proactive alerting for mount health and access patterns

## Pros and Cons of the Options

### Multiple KV Mounts per Project + Shared Mount ✅ (Selected)

**Pros:**

* **Security**: Complete policy isolation prevents unauthorized cross-project access
* **Operational Clarity**: Mount-level boundaries provide intuitive access control and audit trails
* **ESO Integration**: Optimal compatibility with [ExternalSecret Operator SecretStore patterns](https://external-secrets.io/latest/provider/hashicorp-vault/#secretstore)
* **Scalability**: Linear growth model with standardized mount creation automation
* **Future-Proof**: Evolution path to OpenBao namespaces for delegation scenarios
* **Compliance**: Clear audit boundaries support regulatory requirements

**Cons:**

* **Automation Dependency**: Requires Infrastructure-as-Code for mount lifecycle management
* **Initial Complexity**: Higher setup complexity compared to single-mount approach

### Single KV Mount (Monolithic)

**Pros:**

* Simplest initial setup and configuration
* Single point of management for all secrets
* No mount count concerns
* Unified secret organization

**Cons:**

* **High blast radius**: Single error can impact all projects
* **Complex ACL management**: Path-based permissions difficult to audit and maintain
* **Poor isolation**: Security incidents affect all projects
* **Integration challenges**: [ESO patterns less efficient](https://external-secrets.io/latest/provider/hashicorp-vault/#performance-considerations) with path-based access

### OpenBao Namespaces

**Pros:**

* Maximum isolation with complete separation
* Delegated administration capabilities
* Built-in audit trail separation
* Excellent for multi-tenant scenarios

**Cons:**

* **Significant operational complexity** overhead for current scale
* **Higher resource usage**: [Memory usage and unseal time impact](https://developer.hashicorp.com/vault/docs/enterprise/namespaces#performance-standby-nodes)
* **Over-engineering**: Complex for current 6-project scale
* **Cross-namespace complexity**: [Sharing secrets requires complex patterns](https://developer.hashicorp.com/vault/docs/enterprise/namespaces#cross-namespace-secret-access)

### Multiple OpenBao Instances

**Pros:**

* Complete operational independence
* Maximum security isolation
* Independent upgrade and maintenance cycles

**Cons:**

* **Operational fragmentation**: Multiple systems to secure, backup, and maintain
* **Complex synchronization**: [Cross-instance secret sharing challenges](https://developer.hashicorp.com/vault/docs/enterprise/replication)
* **Infrastructure overhead**: Resource multiplication without proportional value
* **Audit consolidation**: Fragmented security and compliance monitoring

## Alternatives Considered and Rejected

### Why Not OpenBao Namespaces?

While OpenBao namespaces provide maximum isolation, they were rejected due to [complexity vs. value trade-off](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure#when-to-use-namespaces):

* **Operational overhead**: Namespace management complexity outweighs benefits for 6-project scale
* **Resource impact**: [Additional memory usage and unseal time](https://developer.hashicorp.com/vault/docs/enterprise/namespaces#performance-standby-nodes)
* **Current requirements satisfied**: Mount-level isolation meets security requirements
* **Future flexibility maintained**: Architecture supports namespace evolution when scale justifies complexity

### Why Not Single KV Mount?

* **Security concerns**: High blast radius violates [Defense in Depth principles](https://csrc.nist.gov/glossary/term/defense_in_depth)
* **Operational challenges**: Path-based ACLs difficult to audit and maintain
* **Integration inefficiency**: [ESO performance impact](https://external-secrets.io/latest/provider/hashicorp-vault/#performance-considerations) with complex path patterns

### Why Not Multiple OpenBao Instances?

* **Operational fragmentation**: Multiple systems violate [infrastructure consolidation principles](https://kubernetes.io/docs/concepts/overview/what-is-kubernetes/)
* **Complexity overhead**: Cross-instance synchronization more complex than mount isolation
* **Resource inefficiency**: Infrastructure multiplication without proportional security benefit

## Future Considerations

### Namespace Evolution Path

If delegation requirements emerge, the current structure can evolve to use OpenBao namespaces following [HashiCorp's migration patterns](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure#migration-strategies):

```text
platform/ (root namespace)
├── projects/ (current mounts remain)
└── delegated/
    ├── external-team-a/ (child namespace)  
    └── external-team-b/ (child namespace)
```

### Advanced Secret Engine Integration

Future architectural expansion may include:

* **PKI engine**: For certificate lifecycle automation
* **Database engine**: For dynamic credential management
* **Transit engine**: For encryption-as-a-service capabilities

## Related Decisions

* [ADR-001: Centralized Secret Management](./001-centralized-secret-management.md) - Establishes OpenBao as the chosen secret management solution

## References and Further Reading

### Architecture and Best Practices

* [HashiCorp Vault Namespace Structure Guide](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure) - Official guidance on namespace vs mount strategies
* [Vault Security Best Practices](https://developer.hashicorp.com/vault/tutorials/operations/production-hardening) - Production security hardening guide
* [NIST Zero Trust Architecture](https://www.nist.gov/publications/zero-trust-architecture) - Zero trust security principles
* [Kubernetes RBAC Documentation](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) - Role-based access control principles

### Integration Documentation

* [ExternalSecret Operator - Vault Provider](https://external-secrets.io/latest/provider/hashicorp-vault/) - Integration patterns and performance considerations
* [Vault Kubernetes Authentication](https://developer.hashicorp.com/vault/docs/auth/kubernetes) - Kubernetes integration architecture
* [Vault OIDC Authentication](https://developer.hashicorp.com/vault/docs/auth/jwt) - OIDC integration patterns

### OpenBao Community Resources

* [OpenBao Official Documentation](https://openbao.org/docs/) - Community fork documentation
* [OpenBao GitHub Repository](https://github.com/openbao/openbao) - Source code and community discussions
* [OpenBao KV v2 Engine](https://openbao.org/docs/secrets/kv/kv-v2/) - Key-Value secrets engine documentation

### Security and Compliance

* [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework) - Security framework principles
* [Secret Management in Kubernetes](https://kubernetes.io/docs/concepts/configuration/secret/) - Kubernetes native secret management

***

**Note**: This ADR builds upon the infrastructure established in ADR-001 and focuses specifically on the organizational structure of secrets within the operational OpenBao instance. The chosen approach balances immediate operational needs with future scalability while leveraging proven patterns from the HashiCorp Vault ecosystem.
