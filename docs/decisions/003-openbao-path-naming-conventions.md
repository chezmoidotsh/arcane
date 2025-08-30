<!--
status: "proposed"
date: 2025-06-29
decision-makers: ["Alexandre"]
consulted: ["ai/claude-4-sonnet"]
informed: []
-->

# OpenBao Path and Naming Conventions

## Context and Problem Statement

Following the implementation of our OpenBao secrets mount topology ([ADR-002](./002-openbao-secrets-topology.md)), we need to establish consistent path organization and naming conventions within each mount. Without standardized conventions, secret management becomes chaotic, discovery difficult, and operational overhead increases significantly.

The challenge is defining conventions that are:

* **Simple enough** for solo homelab operation
* **Consistent** across all applications and services
* **Scalable** as the infrastructure grows
* **Zero-trust compliant** maintaining proper isolation

## Decision Drivers

### Functional Requirements

* **Intuitive Navigation**: Paths should be self-explanatory and logically organized
* **Cross-Application Dependencies**: Handle shared secrets (SSO, certificates, 3rd parties credentials, ...) without breaking isolation
* **Metadata Standardization**: Consistent secret documentation and ownership tracking

### Non-Functional Requirements

* **Zero Trust Security**: Maintain mount-level isolation principles established in ADR-002
* **Operational Simplicity**: Minimize complexity for single-operator environment
* **Discoverability**: Easy to locate secrets without complex search mechanisms
* **Evolutionary Design**: Support future scaling without major restructuring

### Constraints

* **Homelab Context**: Single operator, no multi-team collaboration requirements
* **OpenBao Limitations**: No ACME proxy capability
* **Existing Architecture**: Must align with established mount topology per ADR-002
* **Allowed Characters**: Only alphanumeric characters, hyphens, dots and underscores are allowed

## Considered Options

### Option 1.1: Flat Structure ❌

* **Path Pattern**: `/{mount}/{secret-name}`
* **Pros**: Simple, minimal hierarchy
* **Cons**: Poor organization, difficult discovery at scale, no logical grouping

### Option 1.2: Service-First Organization ❌

* **Path Pattern**: `/{mount}/{service-type}/{app}/{secret}`
* **Example**: `/amiya.akn/database/argocd/postgres-admin`
* **Pros**: Clear service categorization
* **Cons**: Artificial grouping, doesn't reflect actual dependencies

### Option 1.3: Application-First Organization ✅

* **Path Pattern**: `/{mount}/{app}/{category}/{secret}`
* **Example**: `/amiya.akn/argocd/database/postgres-admin`
* **Pros**: Natural ownership model, clear responsibility boundaries
* **Cons**: Shared dependencies require special handling

### Option 2.1: Owner-Based Shared Secrets ❌

* **Path Pattern**: `/shared/{owner}/{service}/{secret}`
* **Example**: `/shared/authelia/oidc-clients/argocd`
* **Pros**: Clear ownership
* **Cons**: Breaks mount isolation, creates cross-mount access requirements

### Option 2.2: Function-Based Shared Secrets ✅

* **Path Pattern**: `/shared/{function}/{category}/{secret}`
* **Example**: `/shared/sso/oidc-client/argocd`
* **Pros**: Logical grouping, maintains isolation
* **Cons**: Requires metadata for ownership tracking

## Decision Outcome

**Chosen Option**: **Application-First Organization** for per-cluster mounts + **Function-Based Shared Secrets** + **User-Isolated Personal Mount**

### Per-Cluster Mount Structure

```text
/{cluster-name}/{application-name}/{category}/{secret-name}
```

A **category** in the context of this OpenBao secrets architecture represents a logical grouping of secrets sharing common characteristics or serving a similar purpose within an application.

**Category characteristics:**

* **Functional grouping**: Secrets in the same category have a similar role (e.g., all database secrets, all TLS certificates)
* **Operational consistency**: Same lifecycle, same rotation processes, same security requirements
* **Facilitates discovery**: Allows quick location of all secrets of a given type
* **Simplifies management**: RBAC and policies can be applied by category

**Category examples:**

* `database/` - All database-related secrets (credentials, connection strings)
* `auth/` - Authentication secrets (JWT, OAuth, sessions)
* `api-keys/` - Third-party API tokens specific to the application
* `certificates/` - Application-specific TLS certificates

**Why use categories?**

* **Organization**: Allows logical grouping of similar secrets
* **Discovery**: Facilitates search and discovery of secrets
* **Management**: Simplifies secret management (RBAC, policies)
* **Documentation**: Improves understanding of secrets

### Shared Mount Structure

```text
/shared/{category}/*
```

Like per-cluster mounts, **categories** are used to group secrets by their purpose or type. Currently, we have the following categories:

* `sso/` - Cross-application authentication (OIDC clients, SAML, shared JWT keys)
* `certificates/` - Shared certificates (wildcards, CA certificates, service mesh)
* `third-parties/` - External service credentials (AWS, Cloudflare, GitHub, ...), managed by Crossplane preferably

### Personal Mount Structure

```text
/personal/{user-email}/{category}/*
```

The **personal** mount provides user-specific secret storage with automatic isolation based on user identity. Access is controlled through templated policies with two distinct permission levels.

**Personal mount characteristics:**

* **User Isolation**: Each user identified by email can access `/personal/{their-email}/*`
* **Self-Service**: Users can create, read, update, and delete their own secrets
* **Category Organization**: Same category structure as other mounts for consistency
* **Zero-Trust**: Templated policies ensure proper access control based on user identity

**Access Levels:**

* **User Level** (`personal-user-access` policy): Full access to own namespace only
* **Admin Level** (`personal-admin-access` policy): Full access to own namespace + list-only access to other users' namespaces for supervision and audit purposes

**Category examples for personal use:**

* `tools/` - Personal development and operational tools (contexts, configurations)
* `credentials/` - Personal service accounts and API keys
* `certificates/` - User-specific certificates and keys
* `bookmarks/` - Personal service endpoints and connection strings

**Example paths:**

* `/personal/alexandre@chezmoi.sh/tools/talos/amiya.akn/admin-context` - Talos cluster context
* `/personal/alexandre@chezmoi.sh/credentials/github/personal-token` - Personal GitHub token
* `/personal/user@domain.com/tools/kubectl/staging-config` - Kubectl configuration

#### `sso` category

~~This category is used to store secrets used by multiple applications for authentication (mainly OIDC clients).~~

> \[!IMPORTANT]
> **DEPRECATED**: Following security analysis, SSO secrets have been moved to per-project mounts to implement proper isolation. See changelog entry 2025-07-01 for migration details.

**Legacy structure** (deprecated):
***OIDC clients***: `/shared/sso/oidc-clients/{application-name}` - *Example: ArgoCD OIDC client was stored in: `/shared/sso/oidc-clients/argocd`*

**New structure** (since 2025-07-01):
***OIDC clients***: `/{cluster-name}/{application-name}/auth/oidc-client` - *Example: ArgoCD OIDC client is now stored in: `/amiya.akn/argocd/auth/oidc-client`*

**Migration rationale**: The shared SSO approach created security risks where any cluster could access OIDC `client_secret` credentials from other clusters, enabling identity spoofing attacks. Moving to per-project mounts ensures proper isolation while maintaining necessary access patterns for Authelia.

#### `certificates` category

This category contains shared certificates (wildcards for example) that will be distributed to several applications/clusters.

**Recommended structure**:

> \[!CAUTION]
> When possible, we **MUST** use the integrated PKI capabilities of OpenBao to generate certificates.

***Wildcard certificates***: `/shared/certificates/{provider}/{certificate-name}` - *For example, the \*.chezmoi.sh certificate is stored in: `/shared/certificates/letsencrypt/wildcard-chezmoi-sh`*

#### `third-parties` category

This category contains shared credentials for third-party services (AWS, Cloudflare, GitHub, ...) that are, generally, managed by Crossplane.

**Recommended structure**:

***AWS credentials***: `/shared/third-parties/aws/{service}/{app-or-purpose}` - *For example, the AWS credentials used by `amiya.akn/cnpg` to access to the `important-backup` bucket are stored in: `/shared/third-parties/aws/iam/amiya.akn/cnpg-important-backup-rw`*\
***Cloudflare credentials***: `/shared/third-parties/cloudflare/{service}/{app-or-purpose}` - *For example, the Cloudflare credentials used by `amiya.akn/cert-manager` to access to all DNS zones are stored in: `/shared/third-parties/cloudflare/iam/amiya.akn/cert-manager-rw`*\
***Let's Encrypt account***: `/shared/certificates/certificate-authorities/letsencrypt/account` - *For example, the Let's Encrypt account credentials used by cert-manager are stored in: `/shared/certificates/certificate-authorities/letsencrypt/account`*\
***Other providers***: `/shared/third-parties/{provider}/{service}/{project-name}/{app-or-purpose}`

> \[!NOTE]
> This path structure is more complex than others, requiring specification of the cloud provider, service, and project name. This complexity is necessary because these secrets often relate to external services that could create billing issues if leaked.\
> To minimize the blast radius, we use the project name to isolate each project from others.

### Metadata Schema

**Required Fields**:

```json
{
  "origin": "Creation origin (examples: manual, crossplane, cert-manager, app-generated, terraform)",
  "description": "Human readable description of the secret purpose",
  "owner": "Entity responsible for the secret (examples: amiya.akn/argocd, maison/crossplane, amiya.akn/authelia)"
}
```

**Recommended Extensions**:

```json
{
  "created-by": "Creation method or command (examples: terraform apply, kubectl create, crossplane, manual-admin)",
  "renewal-process": "Renewal method (examples: cert-manager-auto, manual-rotation, https://wiki.example.com/renewal)",
  "x-apps": "Consuming applications (examples: argocd,grafana,n8n)",
  "x-aws-services": "Accessible AWS services (examples: s3,ses,cloudwatch)",
  "x-docs-url": "Documentation link (example: https://wiki.example.com/service-x)"
}
```

## Rationale

### Why Application-First for Per-Cluster Mounts

* **Natural Ownership**: Applications naturally own their secrets
* **Clear Boundaries**: Easy to understand what belongs to which application
* **RBAC Alignment**: Matches Kubernetes service account and RBAC patterns
* **Operational Clarity**: Troubleshooting and maintenance follow application boundaries

### Why Function-Based for Shared Mount

* **Logical Grouping**: SSO, certificates, and third-party services are distinct functions
* **Intuitive Navigation**: Easier to find shared authentication vs shared certificates
* **Metadata Ownership**: Use metadata to track actual ownership without polluting paths
* **Zero Trust Compliance**: Maintains mount-level isolation while enabling necessary sharing

### Why User-Isolated Personal Mount

* **Self-Service**: Users can manage their own tools and personal secrets independently
* **Zero Trust**: Templated policies automatically enforce user isolation based on OIDC identity
* **Operational Efficiency**: Reduces admin overhead for personal development tools
* **Administrative Oversight**: Admins can audit personal namespaces while maintaining user privacy
* **Category Consistency**: Follows same organizational patterns as other mounts

### Why This Metadata Schema

* **Minimal Overhead**: Only essential information required
* **Pragmatic Extensions**: Optional fields provide value without complexity
* **Homelab Appropriate**: Avoids enterprise-focused fields (criticality, rotation schedules)
* **Discovery Support**: `x-apps` enables impact analysis for changes

## Consequences

### Positive

* ✅ **Consistent Organization**: Clear, predictable secret locations
* ✅ **Operational Efficiency**: Faster secret discovery and management
* ✅ **Security Compliance**: Maintains Zero Trust principles from ADR-002
* ✅ **Documentation Culture**: Metadata requirements improve secret documentation
* ✅ **Scalability**: Structure supports growth without reorganization

### Negative

* ⚠️ **Learning Curve**: Operator must learn and follow conventions
* ⚠️ **Metadata Discipline**: Requires consistent metadata population
* ⚠️ **Cross-Dependency Complexity**: Shared secrets require coordination

### Neutral

* 📝 **Migration Required**: Existing secrets must be reorganized to follow conventions
* 📝 **Tooling Updates**: Scripts and automation must adapt to new paths

## Implementation Considerations

### Certificate Management Strategy

Since OpenBao lacks ACME proxy capabilities, wildcard certificates will be:

1. **Generated** by Cert-Manager using Let's Encrypt
2. **Stored** by External Secrets Operator in `/shared/certificates/`
3. **Distributed** to applications as needed

### Cross-Application Dependencies

For services requiring shared configuration (e.g., ArgoCD OIDC client in Authelia):

* **Secret Storage**: `/amiya.akn/argocd/auth/oidc-client`
* **Ownership Tracking**: `metadata.owner = "amiya.akn/authelia"`
* **Access Pattern**: ArgoCD reads from own mount, Authelia reads cross-mount via dedicated policy

### AWS/Cloud Provider Organization

Cloud provider credentials follow service-based organization:

* **Pattern**: `/shared/third-parties/{provider}/{service}/{project-name}/{app-or-purpose}`
* **IAM Strategy**: One IAM user per application with service-specific permissions
* **Metadata Usage**: `x-aws-services` field documents accessible services

## Compliance and Monitoring

### Security Compliance

* **Mount Isolation**: Preserved from ADR-002 topology
* **Least Privilege**: Application-specific paths enable granular RBAC
* **Audit Trail**: Metadata provides ownership and creation tracking

## References

### Architecture Documentation

* [ADR-002: OpenBao Secrets Mount Topology](./002-openbao-secrets-topology.md) - Foundational mount structure decisions
* [HashiCorp Vault Path Structure Best Practices](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure) - Industry patterns and conventions
* [OpenBao KV Secrets Engine Documentation](https://openbao.org/docs/secrets/kv/) - Technical capabilities and limitations

### Security Guidelines

* [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework) - Zero Trust principles
* [Secret Management Best Practices](https://kubernetes.io/docs/concepts/configuration/secret/) - Kubernetes-native patterns
* [HashiCorp Vault Security Model](https://developer.hashicorp.com/vault/docs/internals/security) - Security architecture principles

### Implementation References

* [External Secrets Operator Documentation](https://external-secrets.io/) - Kubernetes secrets synchronization
* [Cert-Manager Documentation](https://cert-manager.io/) - Certificate lifecycle management
* [Crossplane Vault Injection Guide](https://docs.crossplane.io/latest/guides/vault-injection/#store-credentials-in-vault) - Guide to know how to store credentials in Vault with Crossplane

## Changelog

* **2025-08-30**: **FIX**: Replace example for Let's Encrypt account path convention (`/shared/third-parties/letsencrypt/certificate-authority/account`) with `/shared/certificates/certificate-authorities/letsencrypt/account`. The first example is invalid following the default policy defined into [ADR 004](004-openbao-policy-naming-conventions.md)
* **2025-08-17**: **FEATURE**: Add example for Let's Encrypt account path convention `/shared/third-parties/letsencrypt/certificate-authority/account` for ACME account credentials used by cert-manager
* **2025-08-11**: **FEATURE**: Add personal mount structure with user-isolated namespaces. Implemented two-tier templated policies (`personal-user-access` for standard users, `personal-admin-access` for administrators) using OIDC alias metadata templating. This enables self-service secret management for personal tools (Talos contexts, kubectl configs, personal API tokens) while maintaining zero-trust principles and administrative oversight capabilities.
* **2025-07-01**: **SECURITY**: Migrate SSO secrets from `/shared/sso/*` to per-project mounts following `/{cluster}/{app}/auth/{secret}` pattern. This change addresses security vulnerability where `global-eso-policy` allowed any cluster to access OIDC `client_secret` credentials from other clusters, enabling potential identity spoofing attacks. The new structure maintains proper isolation while allowing Authelia legitimate cross-mount access via dedicated policies.
* **2025-06-30**: Update path naming conventions to match the new policy naming conventions.
