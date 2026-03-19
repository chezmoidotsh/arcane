---
status: "implemented"
date: 2025-01-28
implementation-completed: 2026-03-19
decision-makers: ["Alexandre"]
consulted: ["ai/claude-4-sonnet", "ai/gpt-5"]
informed: []
---

# Envoy Gateway Authentication Strategy: OIDC over External Authorization

## Table of Contents

* [Context and Problem Statement](#context-and-problem-statement)
  * [Current Infrastructure Context](#current-infrastructure-context)
  * [The Integration Challenge](#the-integration-challenge)
* [Decision Drivers](#decision-drivers)
  * [Technical Requirements](#technical-requirements)
  * [Operational Requirements](#operational-requirements)
  * [Constraints](#constraints)
* [Considered Options](#considered-options)
  * [Option 1: External Authorization (ext-authz) Pattern](#option-1-external-authorization-ext-authz-pattern)
  * [Option 2: OIDC Authentication with Envoy Gateway per route](#option-2-oidc-authentication-with-envoy-gateway-per-route)
  * [Option 3: OIDC Authentication with Envoy Gateway on the gateway level](#option-3-oidc-authentication-with-envoy-gateway-on-the-gateway-level)
* [Decision Outcome](#decision-outcome)
  * [Implementation Architecture](#implementation-architecture)
* [Consequences \[Optional\]](#consequences-optional)
  * [Positive](#positive)
  * [Negative](#negative)
  * [Neutral](#neutral)
* [Implementation Details / Status \[Optional\]](#implementation-details--status-optional)
  * [Implementation Strategy](#implementation-strategy)
    * [Phase 1: OIDC Infrastructure Foundation](#phase-1-oidc-infrastructure-foundation)
    * [Phase 2: Application Integration](#phase-2-application-integration)
    * [Phase 3: Automation and Scaling](#phase-3-automation-and-scaling)
  * [Risks and Mitigations](#risks-and-mitigations)
* [Decision Evolution \[Optional\]](#decision-evolution-optional)
* [References and Related Decisions \[Optional\]](#references-and-related-decisions-optional)
* [Changelog](#changelog)

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

* `+` **Built-in Envoy Support**: Native Envoy feature with broad ecosystem support and proven stability
* `+` **Centralized Authentication Logic**: All authentication decisions handled by Authelia with consistent policy enforcement
* `+` **Configuration Simplicity**: Minimal setup required with straightforward YAML configuration and documentation on Authelia website
* `-` **Debugging Challenges**: Limited visibility into authentication flow failures
* `-` **Implementation Issues**: Failed to achieve reliable operation despite extensive configuration attempts

### Option 2: OIDC Authentication with Envoy Gateway per route

> ✔️ **Status**: Accepted

Leverage Envoy Gateway's native OIDC authentication capabilities with Authelia as the OIDC provider per route.

* `+` **Standards Compliance**: RFC-compliant OIDC/OAuth2 implementation
* `+` **Debugging**: Clear OIDC flow with standard error responses
* `+` **Per-Route Configuration**: Way easier to debug
* `+` **Already Tested**: Already tested and successfully working in the `amiya.akn` cluster
* `-` **Client Management Complexity**: Requires OIDC client registration for each route

### Option 3: OIDC Authentication with Envoy Gateway on the gateway level

Implement authentication at the gateway level with session sharing across applications.

* `+` **Standards Compliance**: RFC-compliant OIDC/OAuth2 implementation
* `+` **Debugging**: Clear OIDC flow with standard error responses
* `+` **Simplicity**: All OIDC benefits without the complexity of per-route configuration
* `-` **Shared Client Limitation**: All applications must be protected by the same OIDC client (no selective protection)
* `-` **No Selective Protection**: Impossible to disable OIDC authentication for a specific application

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

***

## Consequences \[Optional]

### Positive

* ✅ **Reliability**: Standards-compliant OIDC implementation with predictable behavior
* ✅ **Security**: JWT-based authentication with configurable validation and scoping
* ✅ **Debugging**: Standard OIDC error flows with comprehensive logging
* ✅ **Integration**: Seamless integration with existing OpenBao secret management
* ✅ **Scalability**: Easy to add new applications following established patterns
* ✅ **CLI Automation**: Configuration complexity abstracted behind tooling

### Negative

* ⚠️ **Client Proliferation**: Each application requires dedicated OIDC client registration
* ⚠️ **Secret Complexity**: More secrets to manage compared to shared session approach
* ⚠️ **Callback Management**: Redirect URI configuration required per application

### Neutral

* ⚖️ **Risk Mitigation**: Leveraging existing OpenBao infrastructure for secure client secret handling
* ⚖️ **Documentation**: Comprehensive procedures for OIDC endpoint creation and troubleshooting
* ⚖️ **Confirmation**: This decision has moved from "proposed" to "accepted" and is now marked "implemented" after meeting specific functional, operability, and observability criteria.

***

## Implementation Details / Status \[Optional]

### Implementation Strategy

#### Phase 1: OIDC Infrastructure Foundation

1. **Authelia OIDC Configuration**: Enable and configure OIDC provider capabilities
2. **OpenBao Secret Structure**: Implement OIDC client secret organization per ADR-003
3. **ExternalSecret Templates**: Configure secret distribution patterns for SecurityPolicy

#### Phase 2: Application Integration

1. **Pilot Application**: Implement OIDC for Longhorn as proof of concept
2. **SecurityPolicy Templates**: Create reusable SecurityPolicy configurations
3. **Validation Procedures**: Test authentication flow and error handling

#### Phase 3: Automation and Scaling

1. **Bulk Migration**: Convert existing applications using old Traefik `ForwardAuth` mechanism to the new OIDC

### Risks and Mitigations

* **IdP unavailability (Authelia down)**: Serve a friendly maintenance page for protected routes; keep public routes separate from OIDC policies
* **Misconfigured redirect URIs**: Enforce strict redirect URI validation via proper documentation
* **CSRF/token replay**: Ensure `state` and `nonce` are enabled and validated by the provider; prefer short token TTLs
* **Token exposure**: Limit `forwardAccessToken` to cases where the upstream requires it; scope tokens minimally
* **Public clients (SPAs)**: Use PKCE and avoid storing secrets client-side; mark clients as `public: true` in Authelia when applicable
* **Cross-project secret leakage**: Store client credentials per `/{cluster}/{app}/auth/oidc-client` and apply policies per ADR-004

***

## Decision Evolution \[Optional]

* **2025-07-05**: Initial Decision - OIDC Authentication with Envoy Gateway per route (Proposed) because it promises a more straightforward, standards-compliant mechanism while aligning with operational capabilities and security requirements.

***

## References and Related Decisions \[Optional]

* **Related ADRs**: [ADR-001: Centralized Secret Management](./001-centralized-secret-management.md), [ADR-003: OpenBao Path and Naming Conventions](./003-openbao-path-naming-conventions.md), [ADR-004: OpenBao Policy Naming Conventions](./004-openbao-policy-naming-conventions.md)
* **Technical Documentation**: [Envoy Gateway Security Policy](https://gateway.envoyproxy.io/latest/api/extension_types/#securitypolicy), [Authelia OIDC Provider](https://www.authelia.com/configuration/identity-providers/openid-connect/), [RFC 6749: OAuth 2.0](https://tools.ietf.org/html/rfc6749), [RFC 6750: Bearer Token Usage](https://tools.ietf.org/html/rfc6750)
* **Security Guidelines**: [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework), [OWASP Authentication Guidelines](https://owasp.org/www-project-cheat-sheets/cheatsheets/Authentication_Cheat_Sheet.html), [OAuth2 Security Best Practices](https://tools.ietf.org/html/draft-ietf-oauth-security-topics)

***

## Changelog

* **2026-03-19**: **CHORE**: Migrated ADR to the new YAML frontmatter and template format.
* **2025-07-05**: **INITIALISATION**: Creation of the ADR document for OIDC authentication implementation.
