***

status: "accepted"
date: 2025-01-23
decision-makers: \["Alexandre"]
consulted: \[]
informed: \["team"]
-------------------

# Adopt Centralized Secret Management Solution

## Context and Problem Statement

### Current Architecture Overview

The current secret management for the Arcane infrastructure project (specifically the `amiya.akn` cluster) relies on a distributed Git repository approach with secrets encrypted using [SOPS](https://github.com/getsops/sops). The architecture operates as follows:

1. **Secret Storage**: Secrets are stored in a Git repository, encrypted using SOPS with GPG keys
2. **Synchronization**: An ArgoCD application synchronizes these encrypted secrets into the cluster
3. **Distribution**: The [ExternalSecret Operator](https://external-secrets.io/) retrieves secrets and makes them available to applications
4. **Network Dependency**: The entire workflow depends on Tailscale's network proxy for the ExternalSecret Operator to access the Kubernetes API of the "source" cluster

### Critical Problems Identified

This architecture, while functional, presents **two major critical problems**:

#### 1. Critical Dependency on Tailscale Network Proxy

* **Single Point of Failure**: The entire secret synchronization workflow depends on Tailscale's network proxy
* **Internet Outage Impact**: Any internet or Tailscale service outage completely halts secret synchronization
* **Deployment Blocking**: Outages impact new deployments and application stability
* **Recovery Complexity**: Manual intervention required during network issues

#### 2. Operational Complexity and Cognitive Load

* **Multi-System Management**: Secrets require interaction with multiple, loosely coupled systems:
  * Git for storage and versioning
  * GPG/SOPS for encryption and decryption
  * Tailscale for network access control
  * Kubernetes API for secret distribution
* **Difficult Auditing**: No centralized audit trail across the distributed systems
* **Knowledge Barriers**: Requires deep understanding of multiple technologies
* **Error-Prone Workflows**: Manual processes increase risk of misconfigurations

### Impact on Operations

These limitations directly impact:

* **Reliability**: Service outages due to network dependency
* **Developer Experience**: Complex workflows for routine secret operations
* **Compliance**: Difficulty meeting audit and governance requirements
* **Scalability**: Challenges adding new applications and teams

### Strategic Question

How do we implement a modern, centralized secret management solution that eliminates single points of failure, provides enterprise-grade security controls, and offers better operational capabilities while maintaining self-hosting principles and integration with existing infrastructure (Authelia SSO, Kubernetes, ArgoCD)?

## Decision Drivers

* **Reliability**: Eliminate critical dependency on Tailscale network proxy
* **Security**: Implement fine-grained access controls and comprehensive audit trails
* **Operational Efficiency**: Reduce complexity of multi-system secret management
* **User Experience**: Provide modern web interface for secret operations
* **Integration**: Seamless integration with existing Kubernetes/ArgoCD infrastructure
* **Self-Hosting**: Maintain control over secret management infrastructure
* **SSO/OIDC**: Integration with existing Authelia for centralized authentication

## Considered Options

* **Infisical** - Modern open-source secret management platform
* **HashiCorp Vault** - Industry standard secret management solution
* **AWS Secrets Manager** - Managed cloud service
* **Continue with SOPS** - Maintain current Git-based approach

## Decision Outcome

**Decision Evolution (MADR Pattern):**

### Initial Decision (2025-01-20): Infisical

Chosen option: "Infisical", because it provided modern UI, self-hosting capabilities, and appeared to have OIDC support in the open-source version.

**Implementation Progress:**

* ✅ Phase 1 completed: Infrastructure deployment with PostgreSQL, Redis, NetworkPolicy
* ✅ Comprehensive documentation and disaster recovery procedures
* ✅ Backup/restore testing scripts

### Revised Decision (2025-01-23): HashiCorp Vault

**SUPERSEDED**: During implementation, discovered that **OIDC SSO is an Enterprise-only feature** in Infisical, which fundamentally breaks the integration architecture with Authelia.

**New chosen option**: "HashiCorp Vault", because:

* OIDC/SSO is available in the open-source version
* Industry standard with extensive ecosystem support
* Better long-term viability and community support
* More robust secret management capabilities
* Proven integration with Kubernetes and ExternalSecret Operator

### Consequences

**Positive:**

* Successful OIDC integration with Authelia for centralized authentication
* Industry-standard solution with extensive documentation and community
* Proven scalability and enterprise-grade features in open source
* S3 backend provides simpler infrastructure compared to PostgreSQL
* Auto-unseal capabilities for better operational security

**Negative:**

* Learning curve steeper than Infisical's user-friendly interface
* More complex initial configuration and maintenance
* Infrastructure restart required (previous Infisical work needs to be replaced)
* Additional time investment due to technology change

### Confirmation

Implementation compliance will be confirmed through:

* Successful OIDC authentication test with Authelia
* ExternalSecret Operator integration verification
* Backup and disaster recovery procedure testing
* Security audit of NetworkPolicy and RBAC configurations

## Pros and Cons of the Options

### Infisical

Modern secret management platform with focus on developer experience.

* Good, because modern UI and excellent developer experience
* Good, because simpler deployment with Helm charts
* Good, because PostgreSQL integration with CloudNativePG
* Good, because active development and growing community
* **Bad, because OIDC SSO requires Enterprise license** ❌
* Bad, because smaller ecosystem compared to Vault
* Bad, because less proven in large-scale deployments

### HashiCorp Vault

Industry standard secret management solution with comprehensive features.

* Good, because OIDC/SSO support in open-source version ✅
* Good, because industry standard with extensive ecosystem
* Good, because proven scalability and reliability
* Good, because comprehensive secret management features (PKI, database credentials, etc.)
* Good, because excellent Kubernetes integration
* Good, because S3 backend simplifies infrastructure
* Neutral, because steeper learning curve but better long-term investment
* Bad, because more complex initial setup and configuration
* Bad, because requires more operational expertise

### AWS Secrets Manager

Managed secret management service from AWS.

* Good, because fully managed with no operational overhead
* Good, because seamless AWS integration
* Bad, because external cloud dependency conflicts with self-hosting requirement
* Bad, because vendor lock-in and potential egress costs
* Bad, because compliance and data sovereignty concerns

### Continue with SOPS

Maintain current Git-based encrypted secret approach.

* Good, because no migration required and known solution
* Good, because simple Git-based workflow
* Bad, because critical Tailscale dependency remains unresolved
* Bad, because operational complexity across multiple systems
* Bad, because no fine-grained access controls or audit capabilities
* Bad, because scalability limitations

## More Information

### Implementation Architecture (Vault)

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Developers    │    │   Vault UI       │    │  Applications   │
│   (OIDC/SSO)    │───▶│   (Web)          │    │  (via ESO)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Vault API      │◀───│ ExternalSecret  │
                       │   (Backend)      │    │ Operator        │
                       └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   S3 Backend     │    │  Auto-Unseal    │
                       │   (Storage)      │    │   (CronJob)     │
                       └──────────────────┘    └─────────────────┘
```

### Migration Plan

1. **Clean up Infisical infrastructure** (remove deployed components)
2. **Deploy Vault with S3 backend** and auto-unseal mechanism
3. **Configure OIDC integration** with Authelia
4. **Migrate secrets** from current SOPS to Vault
5. **Update ExternalSecret Operator** configuration
6. **Pilot migration** with non-critical applications

### Lessons Learned from Decision Evolution

**Key Insights:**

* Always verify Enterprise vs Open Source feature boundaries early
* Test critical integrations (like OIDC) before full infrastructure deployment
* Document decision evolution to help future architectural decisions
* Consider long-term ecosystem maturity over short-term ease of deployment

**Reusable Assets from Infisical Implementation:**

* NetworkPolicy security patterns
* Backup/restore testing methodologies
* Disaster recovery planning approaches
* Infrastructure automation with Kustomize/Helm

### References

* [HashiCorp Vault Documentation](https://developer.hashicorp.com/vault)
* [Vault Kubernetes Integration](https://developer.hashicorp.com/vault/docs/platform/k8s)
* [ExternalSecret Operator - Vault Provider](https://external-secrets.io/latest/provider/hashicorp-vault/)
* [Project Implementation Plan](../.cursor/tasks/GH-318.md)
* [Original Decision Context - Issue #318](https://github.com/chezmoidotsh/arcane/issues/318)
* [MADR Template Documentation](https://adr.github.io/madr/)

***

**Note**: This ADR documents the evolution of the decision-making process. While the initial implementation with Infisical was successful from a technical standpoint, the discovery of licensing limitations for critical features necessitated a strategic pivot to ensure the architecture meets all requirements. This evolution demonstrates the value of documenting architectural decisions and being prepared to adapt when new information emerges.
