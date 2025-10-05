---
name: "Application Addition (AI Agent)"
about: Request to add a new application to the infrastructure (AI agent version)
title: ":sparkles:(project:<cluster>): Add <application-name>"
labels: enhancement, application
---

<!--
AI GUIDANCE: This template is optimized for AI agents creating application addition requests.

KEY PRINCIPLES:
1. Replace <cluster> in title with actual cluster name (amiya.akn, lungmen.akn, etc.)
2. Replace <application-name> with the actual application name
3. Be specific and comprehensive - this issue will guide the implementation
4. Use proper markdown formatting for readability
5. Check all applicable checkboxes with [x]

CLUSTER SELECTION GUIDANCE:
- project:amiya.akn: Mission-critical services (SSO, secrets management, GitOps)
- project:lungmen.akn: Home applications (media, productivity, personal tools)
- project:kazimierz.akn: Proxy/Firewall/WAF (network security, ingress)
- project:chezmoi.sh: Shared infrastructure resources
- project:hass: Home Assistant ecosystem

IMPORTANT TECHNICAL CONTEXT:
- This is a GitOps environment using ArgoCD for all active clusters
- Kubernetes distribution is Talos Linux for all active clusters
- Authentication is via Pocket-Id (OIDC/SAML) for SSO
- Secrets are managed via OpenBao + External Secrets Operator
- Network policies use Cilium for microsegmentation
- Ingress uses Envoy Gateway with HTTPRoute/Gateway API
- Storage uses Longhorn (PVCs) and CloudNative-PG (PostgreSQL)
- Public exposure should use Cloudflare Tunnel + Envoy Gateway pattern
- VPN access uses Tailscale
-->

> \[!NOTE]
> **TLDR**: <!-- One clear sentence: "Add [application] to [cluster] for [primary use case/benefit]" -->

## Application Details

**Application Name:**

<!-- AI: Provide the exact application name as it would appear in Helm/Kustomize -->

**Application URL:**

<!-- AI: Link to official GitHub repo, Docker Hub, or project website -->

**Description:**

<!-- AI: 2-3 sentences explaining:
     - What this application does (core functionality)
     - Why it's needed (use case, problem it solves)
     - How it fits into the homelab ecosystem
-->

## Target Deployment

**Target Cluster:**

<!-- AI: Choose based on application purpose:
     - amiya.akn: Critical infrastructure (auth, secrets, monitoring)
     - lungmen.akn: User-facing home apps (media, documents, photos)
     - kazimierz.akn: Network services (proxies, firewalls)
     Format: "project:amiya.akn" (exact scope format for commits)
-->

**Application Type:**

<!-- AI: Select the primary category that best fits this application -->

## Integration Requirements

<!-- AI: Check [x] all requirements that apply. Be thorough - this guides implementation. -->

* [ ] Requires SSO/OIDC authentication <!-- Pocket-Id integration for user authentication -->
* [ ] Requires internet access (public exposure) <!-- Via Cloudflare Tunnel + Envoy Gateway -->
* [ ] Requires VPN access (Tailscale exposure) <!-- Private access via Tailscale network -->
* [ ] Requires persistent storage (PVC) <!-- Longhorn-backed persistent volumes -->
* [ ] Requires database (PostgreSQL via CloudNative-PG) <!-- Managed PostgreSQL cluster -->
* [ ] Requires S3-compatible storage <!-- For object storage needs -->
* [ ] Requires custom DNS records (Cloudflare) <!-- For custom domain routing -->
* [ ] Requires TLS certificates (cert-manager) <!-- For HTTPS/TLS termination -->

## Security Requirements

<!-- AI: Evaluate security needs carefully. When in doubt, prefer more restrictive options. -->

* [ ] Handles sensitive data (requires encryption at rest) <!-- PII, credentials, health data, etc. -->
* [ ] Requires network isolation (microsegmentation) <!-- Cilium network policies to restrict access -->
* [ ] Needs secrets from OpenBao <!-- API keys, passwords, certificates managed via OpenBao -->
* [ ] External exposure acceptable (internet-facing) <!-- Can be safely exposed to internet -->
* [ ] Tailscale-only access required <!-- Should only be accessible via VPN -->

## Dependencies

<!-- AI: List all dependencies this application needs to function.
     Be specific about versions if known. Include both runtime and deployment dependencies.
-->

**Required Services:**

<!-- E.g., Redis for caching, PostgreSQL for database, SMTP for emails -->

*
*

**Infrastructure Dependencies:**

<!-- E.g., Specific Kubernetes version, storage class, network features -->

*
*

## Configuration Notes

<!-- AI: Provide specific technical details that will help with implementation.
     Research the application's documentation for recommended resources.
-->

**Resource Requirements:**

<!-- AI: Specify realistic resource requests/limits based on application docs
     Example:
     - CPU: 100m-500m
     - Memory: 256Mi-1Gi
     - Storage: 20Gi (if persistent)
-->

**Special Configurations:**

<!-- AI: Document any non-standard configurations needed:
     - Custom Helm values or chart repository
     - Specific environment variables
     - Required ConfigMaps or Secrets
     - Network policy requirements
     - Startup/readiness probe configurations
-->

## Additional Context

<!-- AI: Include any additional context that would be helpful for implementation.
     Screenshots, architecture diagrams, or links to relevant documentation are valuable.
-->

**References:**

<!-- AI: Provide helpful links:
     - Official documentation
     - Helm chart repository
     - Docker image registry
     - Similar deployments (if applicable)
     - GitHub issues or discussions
-->

*
*

***

<sub>Issue created by AI under human supervision</sub>
