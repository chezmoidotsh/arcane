# Homelab SSO External Access Implementation - ADR-006 POC

## 🎯 Objective ❌ FAILED

~~Implement Proof of Concept for ADR-006 Option 5: Deploy Cloudflare Tunnel with CrowdSec Worker + Gateway to evaluate the most promising approach for secure external access to homelab services, starting with Authelia (auth.chezmoi.sh).~~

**OBJECTIVE FAILED**: POC revealed critical architectural limitation - Cloudflare Tunnel does not support Proxy Protocol, preventing client IP preservation essential for CrowdSec functionality.

## 🧠 Context & Reflections

### ADR-006 Architecture Evolution

**Original Architecture (Option 2)**: `External Users → Tailscale Funnel → Traefik Gateway API + CrowdSec → auth.chezmoi.sh`

**~~Current POC Target (Option 5)~~**: ~~`External Users → Cloudflare Tunnel (L4 Proxy) → CrowdSec Worker → Kubernetes Services → auth.chezmoi.sh`~~ **REJECTED**

**Core Requirements**:

* End-to-end encryption (noting trade-off with Cloudflare TLS termination for HTTP/HTTPS)
* IP privacy protection (hide home public IP)
* Zero-trust principles with defense-in-depth
* Service-specific protection patterns
* TCP protocol support (new requirement identified)
* Gateway API compliance for future-proofing
* Simpler architecture where possible

### Current Infrastructure Deep Dive

**amiya.akn Cluster Configuration**:

* **Kubernetes Distribution**: Talos Linux
* **GitOps**: ArgoCD (app-of-apps pattern via ApplicationSets)
* **Project Structure**: `projects/amiya.akn/src/apps/*<name>/` (asterisk = ArgoCD managed)
* **Key Change**: Shifting from Tailscale Funnel (HTTP/HTTPS only) to Cloudflare Tunnel (L4 proxy with TCP support)

**ArgoCD ApplicationSet Auto-Discovery**:

* **Applications**: `apps.applicationset.yaml` scans `projects/amiya.akn/src/apps/*` directories
  * **Naming**: `trimPrefix "*"` from directory basename → application name
  * **Namespace**: Same as application name (`trimPrefix "*"`)
  * **Project**: `applications`
  * **Sync Policy**: Manual sync if starts with `*` (Delete=confirm, Prune=confirm), automated otherwise
* **System Infrastructure**: `system.applicationset.yaml` scans `projects/amiya.akn/src/infrastructure/kubernetes/*`
  * **Naming**: `trimPrefix "*"` from directory basename → application name
  * **Namespace**: `trimSuffix "-system"` then add `-system` (e.g., `traefik` → `traefik-system`)
  * **Project**: `system`
  * **Sync Policy**: Manual sync if starts with `*`, automated otherwise
  * **Exclusions**: cert-manager, envoy-gateway, external-secrets, tailscale (deployed via shoot.apps)

**Existing Gateway Stack**:

* **Envoy Gateway 1.4.2**: Docker.io/envoyproxy via Helm, Gateway API compliant
* **Default Gateway**: `envoy-gateway-system/default` with HTTP (80) + HTTPS (443)
* **TLS Configuration**: Wildcard certificate `*.chezmoi.sh` + `*.akn.chezmoi.sh` via cert-manager
* **Current HTTPRoute**: `auth.chezmoi.sh` → `authelia` service (port 80) via `chezmoi.sh-websecure` listener
* **Traefik Gateway**: Temporarily deployed for POC integration with CrowdSec
* **Cloudflare Integration**: New cloudflared daemon for L4 proxying

**Authelia Configuration Details** (projects/amiya.akn/src/apps/\*sso/authelia/):

* **TOTP**: SHA1, 6 digits, 30s period, issuer: auth.chezmoi.sh
* **WebAuthn**: Enabled with passkey login, direct attestation, backup eligibility prohibited
* **LDAP Backend**: yaLDAP connection (ldap\://yaldap:389), base\_dn: dc=chezmoi,dc=sh
* **Session**: chezmoi\_session cookie, domain: chezmoi.sh, 1h expiration, 5min inactivity, 1M remember\_me
* **Regulation**: max\_retries: 3, find\_time: 2min, ban\_time: 5min
* **OIDC Providers**: ArgoCD, Budibase, Linkding, Longhorn, Mealie, OpenBao, Paperless-NGX, Proxmox
* **Access Control**: default one\_factor, networks defined for k3s pod CIDR + kubernetes clusters
* **Storage**: SQLite3 local (/var/lib/authelia/db.sqlite3)
* **SMTP**: AWS SES (email-smtp.us-east-1.amazonaws.com), sender: Authelia <noreply@amazonses.chezmoi.sh>

**Certificate Management**:

* **cert-manager**: DNS-01 challenge via ClusterIssuer letsencrypt
* **Wildcard Certificate**: `wildcard.chezmoi.sh-certificate` covers `*.chezmoi.sh`, `*.akn.chezmoi.sh`, `*.amiya.akn.chezmoi.sh`
* **Duration**: 90 days, renew 15 days before expiration

**Tailscale Integration**:

* **Tailscale Operator**: Deployed via `projects/amiya.akn/src/apps/*argocd/shoot.apps/tailscale.application.yaml`
* **Homelab Connector**: `projects/amiya.akn/src/infrastructure/kubernetes/tailscale/homelab.connector.yaml`
* **Proxy Class**: Restricted configuration available
* **Funnel Capability**: Available but not yet configured for external access

### Technical Architecture Options Under Evaluation

**Option 4 - Dual-Stack Routing Strategy**:

* **External Traffic Path**: Internet → Cloudflare Tunnel → Traefik Gateway API + CrowdSec → auth.chezmoi.sh
* **Internal Traffic Path**: Tailscale mesh → Envoy Gateway → all other services (unchanged)
* **DNS Split**: External DNS resolves auth.chezmoi.sh to Cloudflare Tunnel, internal DNS unchanged

**Option 5 - Streamlined Architecture (POC Focus)**:

* **External Traffic Path**: Internet → Cloudflare Tunnel → Kubernetes Services + CrowdSec Worker → auth.chezmoi.sh
* **Internal Traffic Path**: Tailscale mesh → Envoy Gateway → all other services (unchanged)
* **DNS Split**: External DNS resolves auth.chezmoi.sh to Cloudflare Tunnel, internal DNS unchanged

**Client IP Propagation Chain (Option 5)**:

1. External Client → Cloudflare (preserves real IP for CrowdSec Worker)
2. Cloudflare Worker processes security decisions based on client IPs
3. Cloudflare Tunnel → Kubernetes Services → auth.chezmoi.sh

**~~Protection Layers Architecture (Option 5)~~ BROKEN**:

1. **Network Layer**: Cloudflare Tunnel (IP masking, secure L4 proxy) ✅ WORKS
2. **Edge Protection**: ~~CrowdSec Worker on Cloudflare (community threat intelligence, edge protection)~~ ❌ **BROKEN - No client IP visibility**
3. **Service Layer**: Direct Kubernetes services connection (simplified routing) ✅ WORKS
4. **Application Layer**: Authelia regulation (3/2min → 5min ban) ✅ WORKS (but degraded without real IPs)
5. **Authentication Layer**: OIDC/LDAP with WebAuthn/TOTP 2FA ✅ WORKS

**CRITICAL FAILURE**: Edge protection layer broken due to Cloudflare Tunnel's lack of Proxy Protocol support

### CrowdSec Integration Options

**Option 4 - Traefik Plugin**:

* **Traefik Plugin**: plugins.traefik.io/plugins/6335346ca4caa9ddeffda116/crowdsec-bouncer-traefik-plugin
* **API Communication**: CrowdSec Local API (LAPI) + Central API for threat intelligence
* **Decision Engine**: Real-time IP reputation + behavior analysis
* **Response Actions**: 403/429 responses, temporary/permanent bans

**Option 5 - Cloudflare Worker ❌ FAILED**:

* **Cloudflare Worker**: ~~Utilizing Cloudflare Workers for edge protection~~ **BROKEN - No client IP access**
* **CrowdSec Integration**: ~~CrowdSec Cloudflare Bouncer or Worker Bouncer~~ **FAILS - All traffic shows Cloudflare IPs**
* **Decision Synchronization**: ~~CrowdSec LAPI decisions synced to Cloudflare~~ **USELESS - No meaningful IPs to sync**
* **Edge Protection**: ~~Applying protection at Cloudflare's edge~~ **IMPOSSIBLE - Cannot identify attack sources**

**FUNDAMENTAL ISSUE**: Cloudflare Tunnel does not support Proxy Protocol, so CrowdSec cannot differentiate between legitimate users and attackers

**Community Threat Intelligence**:

* **Shared Signals**: Crowdsourced attack patterns and malicious IPs
* **Decision Updates**: Real-time threat feed integration
* **Scenarios**: HTTP bruteforce, bot detection, vulnerability scanning protection

### Risk Analysis and Mitigations

**Technical Risks**:

* **TLS Termination at Cloudflare**: HTTP/HTTPS traffic decryption → Consider security trade-offs
* **Client-side Requirements**: TCP access requires client-side cloudflared → Evaluate user experience
* **Worker Integration Reliability**: CrowdSec-Cloudflare synchronization → Test extensively in POC
* **Certificate Chain Issues**: TLS termination problems → Validate cert-manager integration
* **False Positive Rate Limiting**: Legitimate users blocked → Conservative thresholds + monitoring

**Operational Risks**:

* **Cloudflare Dependency**: External service reliance → Evaluate alternative fallback paths
* **Worker Maintenance**: Long-term maintenance of Cloudflare Worker → Assess operational overhead
* **Migration Complexity**: Transitioning existing services → Define gradual migration strategy

## 📝 Change History

* Completed infrastructure baseline analysis of amiya.akn cluster
* Identified existing Envoy Gateway, Authelia, cert-manager, and Tailscale configurations
* Reviewed ADR-006 requirements and implementation options
* **Strategy Update**: Shifted from Tailscale Funnel to Cloudflare Tunnel due to TCP support requirements
* **~~Architecture Evolution~~**: ~~Identified Option 5 (Cloudflare Tunnel with CrowdSec Worker) as most promising~~ **REJECTED**
* **Implementation Approach**: Decided to perform POC before final architecture selection
* Created comprehensive todo list for POC implementation
* **CrowdSec LAPI Deployed**: Created complete CrowdSec configuration with Traefik integration
  * Auto-discovery via ApplicationSet (`projects/amiya.akn/src/apps/crowdsec/`)
  * LAPI with Central API enrollment (amiya.akn.chezmoi.sh instance)
  * Kubernetes log acquisition for Traefik (traefik-system) and Authelia (sso)
  * Official `crowdsecurity/traefik` collection with base-http-scenarios (simplified from custom parsers)
  * RBAC and ServiceAccount for pod log access
  * Bouncer key secret for Traefik plugin authentication
  * Project README explaining temporary placement rationale
* **Context Update**: Switched to official CrowdSec Traefik collection instead of custom parsers/scenarios for better maintenance and community support
* **Configuration Fix**: Corrected SecretStore reference (openbao) and OpenBao path naming to comply with ADR-003 (`amiya.akn/crowdsec/security-engine/lapi`)
* **Secret Migration**: Migrated CrowdSec LAPI enroll\_key from `amiya.akn/crowdsec/api/security-engine` to `amiya.akn/crowdsec/security-engine/lapi` with metadata preservation
* **Pod Security Compliance**: Fixed CrowdSec agent deployment by setting namespace to privileged Pod Security policy (required for hostPath log access)
* **Acquisition Configuration**: Configured CrowdSec agent to monitor Traefik and Authelia logs with proper Kubernetes acquisition sources
* **Traefik Gateway Deployed**: Complete Traefik Gateway API implementation with CrowdSec integration
  * Gateway API provider enabled with Gateway external (ports 8000/8443)
  * CrowdSec bouncer plugin v1.4.4 with middleware auto-configuration
  * Certificate sharing with Envoy Gateway via ReferenceGrant (security audit compliance)
  * PROXY protocol support for Tailscale Funnel IP propagation (CGNAT range 100.64.0.0/10)
  * Security hardening with Pod Security Standards + network policies
  * Bouncer API key created and stored in OpenBao (`amiya.akn/crowdsec/security-engine/bouncer-traefik`)
* **ArgoCD Deployment**: Traefik application successfully created and synced via `./scripts/argocd:app:sync`
* **Context Update**: Added argocd:app:sync example command to CLAUDE.md for operational reference
* **POC Documentation Created**: Comprehensive Cloudflare Tunnel with CrowdSec Worker POC ❌ **FAILED**
  * Complete technical guide (docs/experiments/cloudflare-tunnel-with-crowdsec/)
  * Professional implementation guide with phase-by-phase deployment (7 phases)
  * Architecture overview with Mermaid diagrams showing data flow and security layers
  * Comprehensive testing framework with security, architecture, and integration tests
  * Kubernetes manifests for all components (CrowdSec, Cloudflare Operator, cert-manager, Hello World)
  * mise-based automation with task definitions for streamlined deployment
  * **CRITICAL DISCOVERY**: POC revealed Cloudflare Tunnel lacks Proxy Protocol support
* **~~Architecture Simplification~~**: ~~Eliminated Traefik dependency in Option 5~~ **BROKEN: Cannot preserve client IPs**
* **~~Edge Security Integration~~**: ~~CrowdSec Worker Bouncer manages Cloudflare Worker deployment~~ **USELESS: No client IP visibility**
* **Component Consistency**: Fixed naming inconsistencies across mise.toml, README.md, and Kubernetes manifests
* **Documentation Quality**: Removed performance claims without measurements, focused on factual implementation details
* **Crossplane Integration Examples**: Added Cloudflare API token creation examples for GitOps workflow integration

## ⚠️ Attention Points

* Cloudflare TLS termination trade-off for HTTP/HTTPS traffic security
* Client-side cloudflared requirement for TCP access usability
* CrowdSec Worker integration reliability and maintenance overhead
* Need to validate protection effectiveness without impacting legitimate users
* DNS configuration changes required for external domain routing
* POC results critical for final architectural decision
* **Cloudflare Worker Route Management**: Current bouncer config hardcodes protected routes - production should use Crossplane for multi-cluster autonomous service exposure
* **Cloudflare API Permissions**: Some CrowdSec Worker Bouncer permission group IDs need verification from Cloudflare API documentation
* **Git Commit Rules Enhancement**: Improved rules based on session learnings (avoid subjective judgments, focus WHY vs WHAT)

## 🔗 References

* [ADR-006: Homelab External Services Access Strategy](../../docs/decisions/006-homelab-sso-external-access-strategy.md)
* [CrowdSec sur K3s - Blog Mossroy](https://blog.mossroy.fr/2024/02/16/crowdsec-sur-k3s/)
* [CrowdSec Traefik Plugin](https://plugins.traefik.io/plugins/6335346ca4caa9ddeffda116/crowdsec-bouncer-traefik-plugin)
* [CrowdSec Traefik Plugin GitHub](https://github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin)
* [CrowdSec Cloudflare Bouncer](https://doc.crowdsec.net/u/bouncers/cloudflare/)
* [CrowdSec Cloudflare Worker Bouncer](https://docs.crowdsec.net/u/bouncers/cloudflare-workers/)
* [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
* [CrowdSec Documentation](https://doc.crowdsec.net/)
* [Traefik Gateway API](https://doc.traefik.io/traefik/routing/providers/kubernetes-gateway/)

## 🔄 Next Steps

* [x] Install CrowdSec LAPI on amiya.akn cluster
* [x] Create project README explaining CrowdSec LAPI placement rationale
* [x] Install Traefik Gateway on amiya.akn cluster
* [x] Configure Traefik to use CrowdSec plugin (ref: blog.mossroy.fr)
* [x] Create POC implementation of Option 5 (Cloudflare Tunnel with CrowdSec Worker)
* [x] Document complete technical implementation guide with automation
* [x] Define comprehensive testing framework for POC validation
* [x] Execute POC deployment and testing using provided mise automation ❌ **FAILED**
* [x] **CRITICAL DISCOVERY**: Cloudflare Tunnel does not support Proxy Protocol
* [x] **ANALYSIS**: Client IP preservation impossible, breaking CrowdSec functionality
* [x] **DECISION**: Rejected Option 5 due to fundamental architectural limitation
* [x] **EXTENDED ANALYSIS**: Rejected Options 1, 2, 4, and 5 due to various critical limitations
* [x] Update ADR-006 with comprehensive option rejection analysis and POC failure results
* [ ] Evaluate Option 3 (Dedicated edge proxy) as only remaining viable solution
* [ ] Plan dedicated edge proxy implementation strategy (AWS/GCP/OVH/Hetzner)
* [ ] Define cost-benefit analysis for self-hosted edge proxy approach
* [ ] Consider alternative approaches: port forwarding + security hardening, hybrid solutions
