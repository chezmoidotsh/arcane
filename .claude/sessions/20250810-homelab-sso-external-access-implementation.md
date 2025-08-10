# Homelab SSO External Access Implementation - ADR-006 Phase 1

## 🎯 Objective ❌ FAILED

Implement Phase 1 of ADR-006 Homelab External Services Access Strategy: Deploy Tailscale Funnel + Traefik Gateway API + CrowdSec to enable secure external access to homelab services, starting with Authelia (auth.chezmoi.sh).

## 🧠 Context & Reflections

### ADR-006 Architecture Overview

**Target Architecture**: `External Users → Tailscale Funnel → Traefik Gateway API + CrowdSec → auth.chezmoi.sh`

**Core Requirements**:

* End-to-end encryption (no third-party TLS termination)
* IP privacy protection (hide home public IP)
* Zero-trust principles with defense-in-depth
* Service-specific protection patterns
* Gateway API compliance for future-proofing

### Current Infrastructure Deep Dive

**amiya.akn Cluster Configuration**:

* **Kubernetes Distribution**: Talos Linux
* **GitOps**: ArgoCD (app-of-apps pattern via ApplicationSets)
* **Project Structure**: `projects/amiya.akn/src/apps/*<name>/` (asterisk = ArgoCD managed)

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

### Technical Architecture Decisions

**Dual-Stack Routing Strategy**:

* **External Traffic Path**: Internet → Tailscale Funnel → Traefik Gateway API + CrowdSec → auth.chezmoi.sh
* **Internal Traffic Path**: Tailscale mesh → Envoy Gateway → all other services (unchanged)
* **DNS Split**: External DNS resolves auth.chezmoi.sh to Tailscale Funnel, internal DNS unchanged

**Client IP Propagation Chain**:

1. External Client → Tailscale Funnel (preserves real IP via PROXY protocol)
2. Tailscale Funnel → Traefik Gateway API (must configure PROXY protocol support)
3. Traefik → CrowdSec plugin (gets real IP for rate limiting)
4. Traefik → Authelia service (real IP for regulation)

**Protection Layers Architecture**:

1. **Network Layer**: Tailscale Funnel (IP masking, secure tunnel)
2. **Edge Protection**: CrowdSec plugin (community threat intelligence, automated blocking)
3. **Gateway Layer**: Traefik Gateway API (traffic policies, routing)
4. **Application Layer**: Authelia regulation (3/2min → 5min ban)
5. **Authentication Layer**: OIDC/LDAP with WebAuthn/TOTP 2FA

### CrowdSec Integration Technical Details

**Plugin Configuration Requirements**:

* **Traefik Plugin**: plugins.traefik.io/plugins/6335346ca4caa9ddeffda116/crowdsec-bouncer-traefik-plugin
* **API Communication**: CrowdSec Local API (LAPI) + Central API for threat intelligence
* **Decision Engine**: Real-time IP reputation + behavior analysis
* **Response Actions**: 403/429 responses, temporary/permanent bans

**Community Threat Intelligence**:

* **Shared Signals**: Crowdsourced attack patterns and malicious IPs
* **Decision Updates**: Real-time threat feed integration
* **Scenarios**: HTTP bruteforce, bot detection, vulnerability scanning protection

### Risk Analysis and Mitigations

**Technical Risks**:

* **IP Propagation Failure**: Rate limiting ineffective → Configure PROXY protocol validation
* **Certificate Chain Issues**: TLS termination problems → Validate cert-manager integration
* **False Positive Rate Limiting**: Legitimate users blocked → Conservative thresholds + monitoring
* **Service Dependencies**: Tailscale availability → Maintain internal Tailscale mesh as fallback

**Operational Risks**:

* **Dual Gateway Complexity**: Increased operational overhead → Clear separation of concerns documentation
* **Configuration Drift**: External vs internal configs diverge → Standardized management practices

## 📝 Change History

* Completed infrastructure baseline analysis of amiya.akn cluster
* Identified existing Envoy Gateway, Authelia, cert-manager, and Tailscale configurations
* Reviewed ADR-006 requirements and Phase 1 implementation plan
* Created comprehensive todo list for step-by-step implementation
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
* **Secret Migration**: Migrated CrowdSec LAPI enroll_key from `amiya.akn/crowdsec/api/security-engine` to `amiya.akn/crowdsec/security-engine/lapi` with metadata preservation

## ⚠️ Attention Points

* Client IP forwarding through Tailscale Funnel critical for rate limiting effectiveness
* Dual gateway operational complexity during Phase 1
* Need to validate protection effectiveness without impacting legitimate users
* DNS configuration changes required for external domain routing

## 🔗 References

* [ADR-006: Homelab External Services Access Strategy](../docs/decisions/006-homelab-sso-external-access-strategy.md)
* [CrowdSec sur K3s - Blog Mossroy](https://blog.mossroy.fr/2024/02/16/crowdsec-sur-k3s/)
* [CrowdSec Traefik Plugin](https://plugins.traefik.io/plugins/6335346ca4caa9ddeffda116/crowdsec-bouncer-traefik-plugin)
* [CrowdSec Traefik Plugin GitHub](https://github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin)
* [CrowdSec Documentation](https://doc.crowdsec.net/)
* [Traefik Gateway API](https://doc.traefik.io/traefik/routing/providers/kubernetes-gateway/)

## 🔄 Next Steps

* [x] Install CrowdSec LAPI on amiya.akn cluster
* [x] Create project README explaining CrowdSec LAPI placement rationale
* [ ] Install Traefik Gateway on amiya.akn cluster ← **CURRENT**
* [ ] Configure Traefik to use CrowdSec plugin (ref: blog.mossroy.fr)
* [ ] Install dedicated external-dns for Cloudflare integration
* [ ] Create Tailscale Funnel configuration pointing to Traefik
* [ ] Create HTTPRoute in Traefik for Authelia (auth.chezmoi.sh)
* [ ] Update amiya.akn project documentation
* [ ] Update architecture diagrams with internet traffic flow type
* [ ] Test and validate the complete external access flow
