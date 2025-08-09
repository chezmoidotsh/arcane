<!--
status: "accepted"
date: 2025-08-09
decision-makers: ["Alexandre"]
consulted: ["ai/gpt-5"]
informed: []
-->

# Homelab External Services Access Strategy: Zero-Trust Service Exposure

## Context and Problem Statement

### Homelab Infrastructure Context

The homelab infrastructure consists of multiple clusters (`amiya.akn`, `lungmen.akn`, `maison`) hosting various services that require external access. Currently, all services are only accessible within the Tailscale mesh network, limiting external user access, integrations, and use cases.

### The External Access Challenge

External users, applications, and integrations must access homelab services without requiring VPN access. This architectural decision impacts the entire homelab ecosystem, enabling:

* **Authentication Services**: External user authentication and OIDC flows (Authelia)
* **Administrative Interfaces**: Remote management of homelab infrastructure
* **Application Services**: Selective exposure of self-hosted applications
* **API Endpoints**: Third-party integrations and webhooks
* **Monitoring & Observability**: External access to dashboards and alerting systems

### Service Categorization Framework

Different service types require different exposure patterns and security considerations:

1. **Authentication Services** (High Security): SSO, OIDC providers, user directories
2. **Administrative Services** (Restricted Access): Management interfaces, configuration tools
3. **Application Services** (User-Facing): Self-hosted applications, content delivery
4. **Integration Services** (API-First): Webhooks, API endpoints, automation triggers

### Strategic Requirements

* **Security First**: Avoid third-party TLS termination (no MITM by provider)
* **Privacy Protection**: Hide the home public IP address from external exposure
* **Abuse Mitigation**: Implement robust protection against automated abuse (bots, brute-force, DoS)
* **Zero-Trust Principles**: Maintain security even with internet-facing exposure
* **Service-Specific Policies**: Different protection levels based on service criticality and exposure requirements

## Decision Drivers

### Security Requirements

* **End-to-End Encryption**: Preserve TLS termination at the homelab edge without third-party MITM
* **Zero-Trust Principles**: Implement defense-in-depth even for internet-facing services
* **Service-Specific Protection**: Tailored security policies based on service criticality and exposure patterns
* **Abuse Protection**: Comprehensive rate limiting and protection against automated attacks

### Operational Requirements

* **Homelab Compatibility**: Simple, maintainable approach suitable for solo operator
* **Infrastructure Integration**: Seamless integration with existing Envoy Gateway, cert-manager, and Kubernetes patterns
* **Cost Effectiveness**: Minimize recurring costs and operational complexity
* **Scalability**: Solution must support multiple services with varying exposure requirements

### Architectural Constraints

* **Privacy First**: Hide home public IP address from external exposure
* **Self-Hosting Principles**: Maintain control over critical infrastructure components
* **Existing Investment**: Leverage current Envoy Gateway, cert-manager, and authentication architecture
* **Service Diversity**: Support different service types (authentication, admin, application, API) with appropriate protection levels

## Considered Options

* Cloudflare Tunnel (+ WAF/Access)
* Tailscale Funnel (+ gateway/app-side protections)
* Dedicated edge proxy (cloud VM + Envoy Gateway/Traefik + optional WAF)

## Decision Outcome

**Chosen option**: "Tailscale Funnel + Hybrid Gateway Strategy (Traefik + CrowdSec → Envoy Gateway)" providing immediate mature anti-bot protection with planned migration to unified Envoy Gateway architecture for all external homelab service exposure.

### Phased Implementation Strategy

**Phase 1 (Immediate)**: Tailscale Funnel + Traefik Gateway API + CrowdSec + Service-Specific Protection\
**Phase 2 (Future)**: Migration to Tailscale Funnel + Envoy Gateway + cs-envoy-bouncer when mature

### Architectural Solution

**Phase 1 Architecture (Current Implementation):**

```text
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ External    │───▶│ Tailscale       │───▶│ Traefik Gateway │
│ Users/Apps  │    │ Funnel          │    │ API + CrowdSec  │
└─────────────┘    │ (IP Masking)    │    │ Plugin          │
                   └─────────────────┘    └─────────────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │ Homelab         │
                                          │ Services        │
                                          │ (Auth/Admin/App)│
                                          └─────────────────┘
```

**Phase 2 Architecture (Target Implementation):**

```text
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ External    │───▶│ Tailscale       │───▶│ Envoy Gateway   │
│ Users/Apps  │    │ Funnel          │    │ + cs-envoy-     │
└─────────────┘    │ (IP Masking)    │    │ bouncer         │
                   └─────────────────┘    └─────────────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │ Homelab         │
                                          │ Services        │
                                          │ (Auth/Admin/App)│
                                          └─────────────────┘
```

### Key Implementation Components

**Phase 1 Components**:

* **Tailscale Funnel**: Provides secure tunnel with IP masking and managed TLS termination
* **Traefik Gateway API**: Gateway API compliant proxy with mature CrowdSec plugin integration
* **CrowdSec Plugin**: Production-ready anti-bot protection with community threat intelligence
* **DNS-01 Certificates**: Automated certificate management without domain validation exposure

**Service-Specific Protection Patterns**:

* **Authentication Services** (Initial use case: Authelia): Enhanced regulation with strict rate limiting and multi-layer abuse protection
* **Administrative Services**: No external exposure; internal access via Tailscale mesh
* **Application Services**: Balanced protection suitable for user-facing applications with reasonable rate limits
* **Integration Services**: API-focused protection with token-based authentication and endpoint-specific policies

**Migration Criteria for Phase 2**:

* cs-envoy-bouncer reaches production maturity (documentation, stable releases)
* Community adoption and validation
* Feature parity with Traefik CrowdSec plugin

This hybrid approach enables immediate deployment with mature anti-bot protection while preserving the path to unified Envoy Gateway architecture when the ecosystem matures.

## Consequences

### Positive

**Phase 1 Benefits**:

* ✅ **Mature Anti-Bot Protection**: CrowdSec plugin with community threat intelligence and production-proven capabilities
* ✅ **End-to-End Security**: No decryption by third parties, preserving homelab privacy principles
* ✅ **IP Privacy Protection**: Home public IP address remains hidden from external exposure
* ✅ **Service-Agnostic Design**: Framework supports any homelab service with appropriate protection patterns
* ✅ **Gateway API Compliance**: Future-proof with standard Gateway API implementation
* ✅ **Immediate Deployment**: Production-ready protection without waiting for ecosystem maturity
* ✅ **Architecture Alignment**: Integration with existing Envoy Gateway, cert-manager, and authentication infrastructure
* ✅ **Cost Effectiveness**: No additional cloud services or infrastructure costs
* ✅ **Scalable Protection**: Handles multiple services with varying security requirements

**Migration Benefits**:

* ✅ **Unified Architecture**: Future consolidation on single Envoy Gateway stack for all services
* ✅ **Risk Mitigation**: Dual-stack approach reduces migration risks
* ✅ **Ecosystem Evolution**: Flexible adaptation to Envoy Gateway CrowdSec maturation

### Negative

**Phase 1 Limitations**:

* ⚠️ **Dual Gateway Complexity**: Temporary operational overhead managing both Traefik and Envoy Gateway
* ⚠️ **Migration Dependency**: Future migration dependent on cs-envoy-bouncer ecosystem maturation
* ⚠️ **IP Propagation Dependency**: Rate limiting effectiveness depends on proper client IP forwarding through Tailscale Funnel
* ⚠️ **Threshold Tuning**: Requires ongoing monitoring and adjustment to prevent legitimate user impact
* ⚠️ **Single Point of Failure**: Tailscale service availability impacts external access (internal access via Tailscale mesh remains available)

### Confirmation

**Service-Specific Validation Patterns**:

* **Authentication Services** (Initial implementation: Authelia via `https://auth.chezmoi.sh`): OIDC E2E tests (302 to provider, consent, tokens), 429 on IP threshold exceeded for login/OIDC endpoints
* **Application Services**: HTTP/HTTPS response validation, rate limiting effectiveness on service endpoints
* **Integration Services**: API endpoint availability, webhook delivery success, token-based authentication validation

**Universal Validation Requirements**:

* No exposure of the origin IP (DNS/header/edge logs scan)
* Valid certificates (DNS-01) with proper TLS configuration
* Rate limiting and protection active at gateway level with correlated logs
* Application-level protections configured appropriately for service type

## Pros and Cons of the Options

### Tailscale Funnel (+ gateway/app-side protections)

* Advantages:
  * End-to-end encryption without third-party TLS termination (no MITM by provider)
  * No router port forwarding; origin IP is not publicly disclosed
  * Integrates well in homelab contexts; straightforward rollout
  * Low recurring cost; minimal operational overhead
* Disadvantages:
  * No managed WAF/DDoS; protections must be implemented at the gateway/app layer
  * Fewer anti-bot features than large cloud edges; rate limiting and app hardening are essential
  * Ensure client IP propagation to avoid ineffective IP-based limits

### Cloudflare Tunnel (+ WAF/Access)

* Advantages:
  * Powerful edge protections: DDoS/WAF/rate limiting/bot management
  * No router port forwarding; origin IP is hidden; strong operational maturity
  * Extensive ecosystem and Kubernetes integration
* Disadvantages:
  * TLS is terminated at Cloudflare (trust in provider; not compatible with the strict no-MITM constraint)
  * Vendor lock-in; DNS delegation to Cloudflare often required

### Dedicated edge proxy (cloud VM + Envoy/Traefik + optional WAF)

* Advantages:
  * Full control of the edge; can preserve strict end-to-end TLS
  * Flexible architecture; can layer custom protections and policies
* Disadvantages:
  * Monthly cost (≈ €8/month minimum) and ongoing maintenance burden
  * Not necessarily more secure than managed/peer approaches; DIY DDoS/WAF is non-trivial
  * Higher operational complexity and time to implement

## Implementation Strategy

The implementation follows a defense-in-depth approach with multiple security layers applicable to all homelab services requiring external exposure:

### Phase 1 Implementation Components

* **Tailscale Funnel Configuration**: Enable secure external access while maintaining IP privacy
* **Traefik Gateway API Deployment**: Deploy Traefik with Gateway API support for external traffic
* **CrowdSec Integration**: Configure CrowdSec plugin with community threat intelligence feeds
* **Service-Specific Protection Layers**: Configure appropriate protection based on service type and criticality
* **Certificate Management**: Leverage existing cert-manager DNS-01 automation for TLS certificates
* **Dual-Stack Routing**: Configure external traffic routing through Traefik, internal through Envoy Gateway

### Security Architecture (Phase 1)

The solution implements multiple protection layers for external traffic across all service types:

1. **Network Layer**: Tailscale Funnel provides secure tunneling and IP masking
2. **Edge Protection**: CrowdSec plugin provides community threat intelligence and automated blocking
3. **Application Gateway**: Traefik Gateway API enforces traffic policies and routing
4. **Service Protection Layer**: Service-specific protection (authentication regulation, API rate limiting, etc.)
5. **Internal Gateway**: Envoy Gateway continues handling internal cluster traffic

### Migration Strategy (Phase 2)

**Migration Triggers**:

* cs-envoy-bouncer repository shows stable releases and comprehensive documentation
* Community adoption demonstrates production readiness
* Feature parity achieved with current Traefik CrowdSec plugin capabilities

**Migration Process**:

1. Deploy cs-envoy-bouncer in parallel configuration
2. Gradual traffic migration with canary rollout approach
3. Validation of protection effectiveness and performance metrics
4. Full migration and Traefik Gateway API deprecation for external traffic

This phased approach ensures immediate deployment with mature protection while maintaining architectural flexibility for future consolidation.

## Risks and Mitigations

### Security Risks

* **Client IP Propagation Failure**: Rate limiting ineffective if client IPs aren't properly forwarded through Tailscale Funnel
  * *Mitigation*: Configure PROXY protocol support and validate IP forwarding in pre-production testing

* **Authentication Bypass**: Potential vulnerabilities in the authentication flow or configuration errors
  * *Mitigation*: Regular security audits, E2E testing of authentication flows, and monitoring for anomalous access patterns

### Operational Risks

* **False Positive Rate Limiting**: Legitimate users blocked by overly aggressive rate limiting
  * *Mitigation*: Conservative threshold configuration, comprehensive monitoring, and emergency bypass procedures

* **External Service Dependencies**: Dependency on Tailscale service availability for external access
  * *Mitigation*: Maintain internal Tailscale mesh access as fallback; monitor Tailscale service status

* **Certificate Management**: DNS-01 challenge failures could disrupt TLS certificate renewal
  * *Mitigation*: Robust monitoring of cert-manager processes and automated alerting for certificate expiration

## References

* [ADR-005: Envoy Gateway OIDC Authentication](./005-envoy-gateway-oidc-authentication.md)
* [Authelia – Regulation](https://www.authelia.com/configuration/security/regulation/)
* [CrowdSec – Envoy Bouncer](https://github.com/crowdsecurity/cs-envoy-bouncer) *(Note: Repository in early development stage - no releases or comprehensive documentation as of 2025-08-09)*
* [CrowdSec – Traefik Plugin](https://plugins.traefik.io/plugins/6335346ca4caa9ddeffda116/crowdsec-bouncer-traefik-plugin)

## Changelog

* **2025-08-09**: **SCOPE CLARIFICATION**: This ADR defines the generic external access strategy for ALL homelab services requiring public exposure, with Authelia (SSO) as the primary implementation example. The architectural patterns and security decisions apply to any service needing external access (monitoring, administration interfaces, applications, etc.).
* **2025-08-09**: **UPDATED**: Revised to hybrid approach (Traefik Gateway API + CrowdSec → Envoy Gateway) based on cs-envoy-bouncer immaturity analysis
* **2025-08-09**: **ENHANCED**: Improved document structure and repositioned as homelab-wide architectural decision
* **2025-08-09**: **ACCEPTED**: Homelab SSO external access strategy using Tailscale Funnel + IP rate limiting + Authelia regulation
* **2025-08-09**: **INITIALIZATION**: Creation of the ADR for exposing Authelia as a zero-trust service
