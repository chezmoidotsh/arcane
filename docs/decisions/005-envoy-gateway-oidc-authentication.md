<!--
status: "proposed"
date: 2025-01-28
decision-makers: ["Alexandre"]
consulted: ["ai/claude-4-sonnet", "ai/gpt-5"]
informed: []
-->

# Envoy Gateway Authentication Strategy: OIDC over External Authorization

## Context and Problem Statement

The Arcane infrastructure project requires secure authentication for applications deployed in Kubernetes clusters. With Envoy Gateway as the primary gateway controller and Authelia as the centralized authentication provider, we need to determine the optimal integration pattern for securing application endpoints.

### Current Infrastructure Context

The authentication infrastructure consists of:

* **Envoy Gateway**: Kubernetes-native ingress controller with advanced traffic management
* **Authelia**: Self-hosted authentication and authorization server with OIDC provider capabilities

### The Integration Challenge

Envoy Gateway provides two primary authentication mechanisms for integrating with external authentication providers that can be applied per route or on the gateway level:

1. **External Authorization (ext-authz)**: Forward authentication decisions to external service
2. **OIDC Authentication**: Native OIDC/OAuth2 flow with JWT token validation

The challenge is selecting the approach that provides the best balance of security, operational simplicity, and reliability within our infrastructure constraints.

> \[!WARN]
> During implementation attempts with ext-authz, several practical issues emerged like extra or missing trailing slashes between Envoy Gateway `extAuth.http.path` and Authelia's forward-auth endpoint resulting in sporadic 400 or 500 responses. Because I haven't enough time to debug the issue and don't want to spend more time on it, I decided to move toward evaluating OIDC as a simpler, standards-based alternative.

## Decision Drivers

### Technical Requirements

* **Reliable Authentication**: Consistent, predictable authentication behavior
* **Integration Simplicity**: Minimal moving parts and configuration complexity
* **Debugging Capability**: Clear visibility into authentication flow and failures

### Operational Requirements

* **Configuration Management**: Streamlined process for adding new protected applications
* **Maintenance Overhead**: Minimal ongoing operational complexity
* **Documentation**: Clear procedures and troubleshooting guides

### Constraints

* **Existing Infrastructure**: Must work with current Envoy Gateway and Authelia deployment
* **Self-Hosting**: No external dependencies on cloud authentication services

## Considered Options

### Option 1: External Authorization (ext-authz) Pattern

Forward authentication decisions to Authelia via Envoy's external authorization mechanism.

> \[!NOTE]
> This approach closely resembles Traefik's ForwardAuth mechanism and could be a relevant choice.

**Implementation Pattern:**

```yaml
# SecurityPolicy with ext-authz
spec:
  extAuth:
    http:
      service:
        name: authelia
        port: 9091
      path: /api/authz/forward-auth
```

**Pros:**

* **Built-in Envoy Support**: Native Envoy feature with broad ecosystem support and proven stability
* **Centralized Authentication Logic**: All authentication decisions handled by Authelia with consistent policy enforcement
* **Configuration Simplicity**: Minimal setup required with straightforward YAML configuration and documentation on Authelia website

**Cons:**

* ❌ **Debugging Challenges**: Limited visibility into authentication flow failures
* ❌ **Implementation Issues**: Failed to achieve reliable operation despite extensive configuration attempts

### Option 2: OIDC Authentication with Envoy Gateway per route ✅

Leverage Envoy Gateway's native OIDC authentication capabilities with Authelia as the OIDC provider per route.

**Implementation Pattern:**

```yaml
# SecurityPolicy with OIDC
spec:
  oidc:
    provider:
      issuer: "https://auth.chezmoi.sh"
    clientID: "application-name"
    clientSecret:
      name: "app-oidc-secret"
      key: "client-secret"
    redirectURL: "https://app.example.com/oauth2/callback"
```

**Pros:**

* **Standards Compliance**: RFC-compliant OIDC/OAuth2 implementation
* **Debugging**: Clear OIDC flow with standard error responses
* **Per-Route Configuration**: Way easier to debug
* **Already Tested**: Already tested and successfully working in the `amiya.akn` cluster

**Cons:**

* ❌ **Client Management Complexity**: Requires OIDC client registration for each route

### Option 3: OIDC Authentication with Envoy Gateway on the gateway level

Implement authentication at the gateway level with session sharing across applications.

**Pros:**

* **Standards Compliance**: RFC-compliant OIDC/OAuth2 implementation
* **Debugging**: Clear OIDC flow with standard error responses
* **Simplicity**: All OIDC benefits without the complexity of per-route configuration

**Cons:**

* ❌ **Shared Client Limitation**: All applications must be protected by the same OIDC client (no selective protection)
* ❌ **No Selective Protection**: Impossible to disable OIDC authentication for a specific application

## Decision Outcome

**Chosen option (proposed)**: "OIDC Authentication with Envoy Gateway per route" (Option 2), because it promises a more straightforward, standards-compliant mechanism while aligning with operational capabilities and security requirements. This decision remains proposed until validation criteria are met.

### Implementation Architecture

**OIDC Flow Architecture:**

```text
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Browser   │───▶│  Envoy Gateway  │───▶│   Application   │
│             │    │  (OIDC Client)  │    │   (Protected)   │
└─────────────┘    └─────────────────┘    └─────────────────┘
       │                       │
       ▼                       ▼
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Authelia   │◀───│  OIDC Provider  │    │    OpenBao      │
│ (OIDC IdP)  │    │   Discovery     │    │ (Client Secrets)│
└─────────────┘    └─────────────────┘    └─────────────────┘
```

**Secret Management Integration:**

* **Client Registration**: OIDC clients stored in OpenBao following path convention `/{cluster}/{app}/auth/oidc-client`
* **Secret Distribution**: ExternalSecret Operator retrieves client secrets for SecurityPolicy configuration
* **Authelia Configuration**: Client definitions imported from OpenBao via templated configuration

### Consequences

**Positive:**

* ✅ **Reliability**: Standards-compliant OIDC implementation with predictable behavior
* ✅ **Security**: JWT-based authentication with configurable validation and scoping
* ✅ **Debugging**: Standard OIDC error flows with comprehensive logging
* ✅ **Integration**: Seamless integration with existing OpenBao secret management
* ✅ **Scalability**: Easy to add new applications following established patterns
* ✅ **CLI Automation**: Configuration complexity abstracted behind tooling

**Negative:**

* **Client Proliferation**: Each application requires dedicated OIDC client registration
* **Secret Complexity**: More secrets to manage compared to shared session approach
* **Callback Management**: Redirect URI configuration required per application

**Risk Mitigation:**

* **Secret Management**: Leveraging existing OpenBao infrastructure for secure client secret handling
* **Documentation**: Comprehensive procedures for OIDC endpoint creation and troubleshooting

### Confirmation

This decision will move from "proposed" to "accepted" when the following are met in the target cluster:

* Functional: protected route redirects to Authelia, authenticates, and returns HTTP 200 on callback without loops
* Operability: onboarding a new application via CLI (client creation, ESO, SecurityPolicy, Authelia update) takes ≤ 10 minutes end-to-end
* Observability: error signals for OIDC flows are visible in logs/dashboards; misconfigurations are diagnosable

## Implementation Strategy

### Phase 1: OIDC Infrastructure Foundation

1. **Authelia OIDC Configuration**: Enable and configure OIDC provider capabilities
2. **OpenBao Secret Structure**: Implement OIDC client secret organization per ADR-003
3. **ExternalSecret Templates**: Configure secret distribution patterns for SecurityPolicy

### Phase 2: Application Integration

1. **Pilot Application**: Implement OIDC for Longhorn as proof of concept
2. **SecurityPolicy Templates**: Create reusable SecurityPolicy configurations
3. **Validation Procedures**: Test authentication flow and error handling

### Phase 3: Automation and Scaling

1. **Bulk Migration**: Convert existing applications using old Traefik `ForwardAuth` mechanism to the new OIDC

## Risks and Mitigations

* **IdP unavailability (Authelia down)**: Serve a friendly maintenance page for protected routes; keep public routes separate from OIDC policies
* **Misconfigured redirect URIs**: Enforce strict redirect URI validation via proper documentation
* **CSRF/token replay**: Ensure `state` and `nonce` are enabled and validated by the provider; prefer short token TTLs
* **Token exposure**: Limit `forwardAccessToken` to cases where the upstream requires it; scope tokens minimally
* **Public clients (SPAs)**: Use PKCE and avoid storing secrets client-side; mark clients as `public: true` in Authelia when applicable
* **Cross-project secret leakage**: Store client credentials per `/{cluster}/{app}/auth/oidc-client` and apply policies per ADR-004

## References

### Technical Documentation

* [Envoy Gateway Security Policy](https://gateway.envoyproxy.io/latest/api/extension_types/#securitypolicy) - Official SecurityPolicy configuration guide
* [Authelia OIDC Provider](https://www.authelia.com/configuration/identity-providers/openid-connect/) - OIDC provider configuration
* [RFC 6749: OAuth 2.0](https://tools.ietf.org/html/rfc6749) - OAuth2 specification
* [RFC 6750: Bearer Token Usage](https://tools.ietf.org/html/rfc6750) - JWT bearer token specification

### Architecture References

* [ADR-001: Centralized Secret Management](./001-centralized-secret-management.md) - OpenBao infrastructure foundation
* [ADR-003: OpenBao Path and Naming Conventions](./003-openbao-path-naming-conventions.md) - Secret organization patterns
* [ADR-004: OpenBao Policy Naming Conventions](./004-openbao-policy-naming-conventions.md) - Access control policies

### Security Guidelines

* [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework) - Zero Trust security principles
* [OWASP Authentication Guidelines](https://owasp.org/www-project-cheat-sheets/cheatsheets/Authentication_Cheat_Sheet.html) - Authentication security best practices
* [OAuth2 Security Best Practices](https://tools.ietf.org/html/draft-ietf-oauth-security-topics) - OAuth2 security considerations

## Changelog

* **2025-07-05**: **INITIALISATION**: Creation of the ADR document for OIDC authentication implementation.
