---
status: "implemented"
date: 2025-01-24
implementation-completed: 2025-06-28
decision-makers: ["Alexandre"]
consulted: ["ai/claude-4-sonnet", "ai/chatgpt-4o"]
informed: []
---

# Adopt Centralized Secret Management Solution

## Table of Contents

* [Context and Problem Statement](#context-and-problem-statement)
  * [Current Architecture Overview](#current-architecture-overview)
  * [Critical Problems Identified](#critical-problems-identified)
    * [1. Critical Dependency on Tailscale Network Proxy](#1-critical-dependency-on-tailscale-network-proxy)
    * [2. Operational Complexity and Cognitive Load](#2-operational-complexity-and-cognitive-load)
  * [Impact on Operations](#impact-on-operations)
  * [Strategic Question](#strategic-question)
* [Decision Drivers](#decision-drivers)
* [Considered Options](#considered-options)
  * [Infisical](#infisical)
  * [HashiCorp Vault](#hashicorp-vault)
  * [OpenBao](#openbao)
  * [AWS Secrets Manager](#aws-secrets-manager)
  * [Continue with SOPS](#continue-with-sops)
* [Decision Outcome](#decision-outcome)
  * [Decision Evolution (MADR Pattern):](#decision-evolution-madr-pattern)
    * [Initial Decision (2025-01-20): Infisical](#initial-decision-2025-01-20-infisical)
    * [Revised Decision (2025-01-23): HashiCorp Vault](#revised-decision-2025-01-23-hashicorp-vault)
    * [Revised Decision (2025-01-24): OpenBao](#revised-decision-2025-01-24-openbao)
* [Consequences](#consequences)
  * [Positive](#positive)
  * [Negative](#negative)
* [Implementation Details / Status](#implementation-details--status)
  * [Implementation Status](#implementation-status)
  * [More Information](#more-information)
    * [Implementation Architecture (OpenBao) - **As Implemented**](#implementation-architecture-openbao---as-implemented)
    * [Lessons Learned from Decision Evolution](#lessons-learned-from-decision-evolution)
* [References and Related Decisions](#references-and-related-decisions)
* [Changelog](#changelog)

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

### Infisical

Modern secret management platform with focus on developer experience.

* `+` modern UI and excellent developer experience
* `+` simpler deployment with Helm charts
* `+` PostgreSQL integration with CloudNativePG
* `+` active development and growing community
* `-` **OIDC SSO requires Enterprise license** ❌
* `-` smaller ecosystem compared to Vault
* `-` less proven in large-scale deployments

### HashiCorp Vault

Industry standard secret management solution with comprehensive features.

* `+` OIDC/SSO support in open-source version ✅
* `+` industry standard with extensive ecosystem
* `+` proven scalability and reliability
* `+` comprehensive secret management features (PKI, database credentials, etc.)
* `+` excellent Kubernetes integration
* `+` S3 backend simplifies infrastructure
* `+` steeper learning curve but better long-term investment
* `-` more complex initial setup and configuration
* `-` requires more operational expertise
* `-` **features like PKCS#11 auto-unseal are Enterprise-only** ❌

### OpenBao

A community-driven, open-source fork of HashiCorp Vault.

* `+` it is a fork of Vault and maintains API compatibility.
* `+` it includes key features (like PKCS#11 auto-unseal) from Vault's enterprise version in its open-source offering. ✅
* `+` it allows for a high-security, self-hosted deployment without licensing costs.
* `+` it leverages the large existing ecosystem of Vault (clients, libraries, integrations).
* `+` a newer project, the community is smaller than Vault's, but it is growing.
* `-` long-term maintenance and development are dependent on the open-source community.

### AWS Secrets Manager

Managed secret management service from AWS.

* `+` fully managed with no operational overhead
* `+` seamless AWS integration
* `-` external cloud dependency conflicts with self-hosting requirement
* `-` vendor lock-in and potential egress costs
* `-` compliance and data sovereignty concerns

### Continue with SOPS

Maintain current Git-based encrypted secret approach.

* `+` no migration required and known solution
* `+` simple Git-based workflow
* `-` critical Tailscale dependency remains unresolved
* `-` operational complexity across multiple systems
* `-` no fine-grained access controls or audit capabilities
* `-` scalability limitations

## Decision Outcome

**Chosen option: "OpenBao"**, because it is a community-driven, open-source fork of HashiCorp Vault that includes key enterprise features such as PKCS#11 auto-unseal in its open-source version. This allows the project to maintain a high security posture without incurring licensing costs. OpenBao maintains API compatibility with Vault, ensuring a seamless transition and continued use of the existing ecosystem (like the ExternalSecret Operator), while perfectly aligning with the project's self-hosting and security-first principles.

### Decision Evolution (MADR Pattern)

#### Initial Decision (2025-01-20): Infisical

Chosen option: "Infisical", because it provided modern UI, self-hosting capabilities, and appeared to have OIDC support in the open-source version.

**Implementation Progress:**

* ✅ Phase 1 completed: Infrastructure deployment with PostgreSQL, Redis, NetworkPolicy
* ✅ Comprehensive documentation and disaster recovery procedures
* ✅ Backup/restore testing scripts

#### Revised Decision (2025-01-23): HashiCorp Vault

**SUPERSEDED**: During implementation, discovered that **OIDC SSO is an Enterprise-only feature** in Infisical, which fundamentally breaks the integration architecture with Authelia.

**New chosen option**: "HashiCorp Vault", because:

* OIDC/SSO is available in the open-source version
* Industry standard with extensive ecosystem support
* Better long-term viability and community support
* More robust secret management capabilities
* Proven integration with Kubernetes and ExternalSecret Operator

#### Revised Decision (2025-01-24): OpenBao

**SUPERSEDED**: During implementation, discovered that **PKCS#11 auto-unseal is an Enterprise-only feature** in HashiCorp Vault. This is a critical capability for the desired security posture, as it avoids storing unseal keys directly in the Kubernetes cluster.

**New chosen option**: "OpenBao", because:

* It is a community-driven, open-source fork of HashiCorp Vault.
* It includes key enterprise features from Vault, such as **PKCS#11 auto-unseal**, in its open-source version.
* It maintains API compatibility with Vault, allowing for a seamless transition and use of the existing ecosystem (like the ExternalSecret Operator).
* It aligns perfectly with the project's self-hosting and security-first principles without incurring licensing costs for essential features.

***

## Consequences

### Positive

* ✅ **Successful implementation completed** (2025-06-28)
* ✅ **OIDC integration with Authelia** for centralized authentication (pending configuration)
* ✅ **Industry-standard solution** with extensive documentation and community
* ✅ **Proven scalability** and enterprise-grade features in open source
* ✅ **PostgreSQL backend** with CloudNativePG for robust data persistence and backup
* ✅ **Auto-unseal capabilities** (via PKCS#11/SoftHSM) for better operational security
* ✅ **Complete ExternalSecret Operator integration** for seamless secret distribution

### Negative

* ⚠️ Learning curve steeper than Infisical's user-friendly interface
* ⚠️ More complex initial configuration and maintenance
* ⚠️ Infrastructure restart required (previous Infisical and Vault work needs to be replaced)
* ⚠️ Additional time investment due to another technology change

***

## Implementation Details / Status

### Implementation Status

**Completed Components:**

* ✅ **OpenBao deployment** with Helm chart and custom SoftHSM-enabled image
* ✅ **PostgreSQL backend** using CloudNativePG with automated backups to S3
* ✅ **Auto-unseal configuration** via PKCS#11/SoftHSM tokens
* ✅ **ExternalSecret Operator integration** with proper RBAC and SecretStore
* ✅ **Network configuration** with Tailscale ingress and HTTPRoute for external access
* ✅ **Backup and disaster recovery** procedures with S3-based CNPG backups

**Pending Configuration:**

* 🔄 **OIDC authentication integration** with Authelia (infrastructure ready)
* 🔄 **Security audit** of NetworkPolicy and RBAC configurations
* 🔄 **Secrets migration** from SOPS to OpenBao
* 🔄 **Pilot application integration** testing

### More Information

#### Implementation Architecture (OpenBao) - **As Implemented**

```text
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Developers    │    │   OpenBao UI     │    │  Applications   │
│   (OIDC/SSO)    │───▶│   (Web/API)      │    │  (via ESO)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   OpenBao        │◀───│ ExternalSecret  │
                       │   StatefulSet    │    │ Operator        │
                       └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  PostgreSQL+CNPG │    │  Auto-Unseal    │
                       │ (Primary Storage)│    │ (PKCS#11/HSM)   │
                       └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   S3 Backups     │
                       │ (Disaster Recov.)│
                       └──────────────────┘
```

**Key Implementation Details:**

* **Custom OpenBao image**: `ghcr.io/chezmoidotsh/flakes/openbao/openbao-softhsm`
* **Storage**: PostgreSQL with CloudNativePG operator for HA and automated backups
* **Auto-unseal**: SoftHSM v2 PKCS#11 integration with encrypted token storage
* **Network**: Dual access via Tailscale (internal) and HTTPRoute (external)
* **ESO Integration**: Dedicated ServiceAccount with minimal RBAC permissions

#### Lessons Learned from Decision Evolution

**Key Insights:**

* Always verify Enterprise vs Open Source feature boundaries early, especially for critical operational capabilities like OIDC and auto-unseal.
* Test critical integrations (like OIDC) before full infrastructure deployment
* Document decision evolution to help future architectural decisions
* Consider long-term ecosystem maturity over short-term ease of deployment

**Reusable Assets from Infisical Implementation:**

* NetworkPolicy security patterns
* Backup/restore testing methodologies
* Disaster recovery planning approaches
* Infrastructure automation with Kustomize/Helm

***

## References and Related Decisions

* [HashiCorp Vault Documentation](https://developer.hashicorp.com/vault)
* [Vault Kubernetes Integration](https://developer.hashicorp.com/vault/docs/platform/k8s)
* [ExternalSecret Operator - Vault Provider](https://external-secrets.io/latest/provider/hashicorp-vault/)
* [OpenBao Project](https://openbao.org/)
* [Original Decision Context - Issue #318](https://github.com/chezmoidotsh/arcane/issues/318)
* [MADR Template Documentation](https://adr.github.io/madr/)

***

**Note**: This ADR documents the evolution of the decision-making process. While the initial implementation with Infisical was successful from a technical standpoint, the discovery of licensing limitations for critical features necessitated a strategic pivot. A similar issue with HashiCorp Vault's enterprise licensing for PKCS#11 auto-unseal has led to the adoption of OpenBao to ensure the architecture meets all security and operational requirements without compromise. This evolution demonstrates the value of documenting architectural decisions and being prepared to adapt when new information emerges.

## Changelog

* **2026-03-19**: **CHORE**: Migrated ADR to the new YAML frontmatter and template format.
* **2025-06-28**: **IMPLEMENTATION**: Successful implementation completed.
* **2025-01-24**: Initial decision finalized with OpenBao.
