<!--
status: "proposed"
date: 2025-01-29
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
* **Cross-Application Dependencies**: Handle shared secrets (SSO, certificates) without breaking isolation
* **Metadata Standardization**: Consistent secret documentation and ownership tracking
* **Cloud Provider Integration**: Clear organization for AWS, Cloudflare, and other external services

### Non-Functional Requirements

* **Zero Trust Security**: Maintain mount-level isolation principles established in ADR-002
* **Operational Simplicity**: Minimize complexity for single-operator environment
* **Discoverability**: Easy to locate secrets without complex search mechanisms
* **Evolutionary Design**: Support future scaling without major restructuring

### Constraints

* **Homelab Context**: Single operator, no multi-team collaboration requirements
* **OpenBao Limitations**: No ACME proxy capability (unlike Vault Enterprise)
* **Existing Architecture**: Must align with established mount topology per ADR-002

## Considered Options

### Option 1: Flat Structure

* **Path Pattern**: `/{mount}/{secret-name}`
* **Pros**: Simple, minimal hierarchy
* **Cons**: Poor organization, difficult discovery at scale, no logical grouping

### Option 2: Service-First Organization

* **Path Pattern**: `/{mount}/{service-type}/{app}/{secret}`
* **Example**: `/amiya-akn/database/argocd/postgres-admin`
* **Pros**: Clear service categorization
* **Cons**: Artificial grouping, doesn't reflect actual dependencies

### Option 3: Application-First Organization ✅

* **Path Pattern**: `/{mount}/{app}/{category}/{secret}`
* **Example**: `/amiya-akn/argocd/database/postgres-admin`
* **Pros**: Natural ownership model, clear responsibility boundaries
* **Cons**: Shared dependencies require special handling

### Option 4: Owner-Based Shared Secrets

* **Path Pattern**: `/shared/{owner}/{service}/{secret}`
* **Example**: `/shared/authelia/oidc-clients/argocd`
* **Pros**: Clear ownership
* **Cons**: Breaks mount isolation, creates cross-mount access requirements

### Option 5: Function-Based Shared Secrets ✅

* **Path Pattern**: `/shared/{function}/{category}/{secret}`
* **Example**: `/shared/sso/oidc-client/argocd`
* **Pros**: Logical grouping, maintains isolation
* **Cons**: Requires metadata for ownership tracking

## Decision Outcome

**Chosen Option**: **Application-First Organization** for per-cluster mounts + **Function-Based Shared Secrets**

### Per-Cluster Mount Structure

```text
/{cluster-name}/{app-name}/{category}/{secret-name}
```

**Categories**:

* `database/` - Database credentials and connection strings
* `auth/` - Authentication secrets (JWT keys, session secrets, local OAuth)
* `api-keys/` - Third-party API tokens specific to the application
* `certificates/` - Application-specific TLS certificates

### Shared Mount Structure

```text
/shared/{function}/{category}/{secret-name}
```

**Functions**:

* `sso/` - Cross-application authentication (OIDC clients, SAML, shared JWT keys)
* `certificates/` - Shared certificates (wildcards, CA certificates, service mesh)
* `third-parties/` - External service credentials (AWS, Cloudflare, GitHub, Crossplane)

### Metadata Schema

**Required Fields**:

```json
{
  "origin": "Creation origin (examples: manual, crossplane, cert-manager, app-generated, terraform)",
  "description": "Human readable description of the secret purpose",
  "owner": "Entity responsible for the secret (examples: amiya.akn/argocd, crossplane, authelia)"
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

* ⚠️ **Learning Curve**: Team must learn and follow conventions
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

* **Secret Storage**: `/shared/sso/oidc-client/argocd`
* **Ownership Tracking**: `metadata.owner = "amiya.akn/authelia"`
* **Access Pattern**: ArgoCD reads from shared mount, Authelia manages lifecycle

### AWS/Cloud Provider Organization

Cloud provider credentials follow service-based organization:

* **Pattern**: `/shared/third-parties/{provider}/{service}/{app-or-purpose}`
* **IAM Strategy**: One IAM user per application with service-specific permissions
* **Metadata Usage**: `x-aws-services` field documents accessible services

## Compliance and Monitoring

### Security Compliance

* **Mount Isolation**: Preserved from ADR-002 topology
* **Least Privilege**: Application-specific paths enable granular RBAC
* **Audit Trail**: Metadata provides ownership and creation tracking

### Operational Monitoring

* **Path Validation**: Automated checks for convention compliance
* **Metadata Completeness**: Required fields validation
* **Access Patterns**: Monitor for unexpected cross-mount access attempts

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
* [Crossplane Provider Documentation](https://docs.crossplane.io/) - Cloud resource management patterns
