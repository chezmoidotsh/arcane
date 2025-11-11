# Pangolin Architecture - Technical Decisions

> **Date**: 2025-11-11
> **Status**: Implementation in progress
> **Context**: Kubernetes migration from Docker Compose

***

## Overview

Pangolin is a self-hosted tunneled reverse proxy with identity and access control, designed to securely expose private resources across distributed networks. This document captures the architectural decisions made during the Kubernetes migration.

## Components

### Core Services

1. **Pangolin** - Main application (UI + API)
   * Ports: 3000 (internal API), 3001 (public API), 3002 (UI)
   * Backend: CloudNativePG PostgreSQL cluster
   * Storage: `/var/dynamic` for runtime configuration

2. **Traefik** - Reverse proxy and ingress controller
   * Ports: 80 (HTTP), 443 (HTTPS)
   * TLS termination with ACME Let's Encrypt (HTTP-01 challenge)
   * Dynamic configuration via Pangolin HTTP provider

3. **Gerbil** - WireGuard tunnel manager
   * **Deployed as separate pod** (communicates via Kubernetes Services)
   * Ports: 51820/udp (WireGuard), 21820/udp (alt), 3004 (API)
   * SNI proxy NOT USED in single-node deployment (port 8443 disabled)

4. **CrowdSec** - Security engine
   * Parses Traefik access logs for threat detection
   * Provides bouncer API for Traefik middleware
   * Enrollment: kazimierz-pangolin instance

***

## Key Architectural Decisions

### 1. Gerbil as Separate Pod (NOT Sidecar)

**Decision**: Deploy Gerbil as a separate pod, NOT as a sidecar in Traefik.

**Rationale**:

* **Single-node deployment** (kazimierz.akn only) bypasses Gerbil SNI proxy entirely
* Traefik directly handles HTTP/HTTPS traffic (ports 80/443)
* Gerbil only manages WireGuard tunnels to backend clusters
* Communication via Kubernetes Services (not localhost)
* Cleaner separation of concerns (proxy vs tunnel management)

**What Gerbil Actually Does**:

1. **WireGuard Management**: Creates/manages WireGuard interfaces for backend connectivity
2. **Peer Management**: Adds/removes Newt clients (backend clusters) dynamically
3. **API Exposure**: HTTP API on port 3004 for Pangolin to manage tunnels
4. **SNI Proxy (UNUSED)**: Port 8443 for multi-node routing (disabled in single-node)

**Communication Flow**:

```
Pangolin Pod :3001
    ↓ HTTP API calls
Gerbil Service :3004
    ↓
Gerbil Pod (WireGuard management)
    ↓ UDP :51820
Backend Clusters (Newt clients)
```

**Why Docker Compose Used `network_mode: service:gerbil`**:

* Docker Compose port mapping simplification (not architectural requirement)
* Kubernetes Services provide same functionality with cleaner architecture

**Configuration**:

```yaml
# Separate Gerbil deployment
args:
  - "--remoteConfig=http://pangolin.pangolin.svc.cluster.local:3001/api/v1/"
  - "--reachableAt=http://gerbil.pangolin.svc.cluster.local:3004"
```

### 2. TLS Certificate Management - ACME HTTP-01

**Decision**: Use Traefik's built-in ACME client with HTTP-01 challenge, NOT cert-manager.

**Rationale**:

* **Dynamic routes requirement**: Pangolin creates routes via HTTP provider at runtime
* ACME Traefik automatically provisions certificates for new routes
* cert-manager requires manual `Certificate` CRD creation per domain
* HTTP-01 challenge is sufficient (no wildcard certificates needed)
* Simpler architecture with fewer moving parts

**Trade-offs Accepted**:

* ❌ No wildcard `*.chezmoi.sh` certificate (one cert per subdomain)
* ❌ Port 80 must be publicly accessible for ACME challenge
* ✅ Fully automated certificate lifecycle for dynamic routes
* ✅ No DNS API credentials required

**Configuration**:

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: noreply@chezmoi.sh
      storage: /letsencrypt/acme.json
      httpChallenge:
        entryPoint: web
```

### 3. Certificate Storage - NO /var/certificates

**Decision**: Remove `/var/certificates` volume mount from Pangolin deployment.

**Rationale**:

* **Pangolin does NOT need certificates**: It runs behind Traefik (TLS termination)
* **Gerbil SNI proxy does NOT decrypt**: It reads SNI hints and forwards encrypted traffic
* Certificates are stored exclusively in Traefik's `acme.json` file
* The Docker Compose mount was only for file sharing between containers

**Result**: Pangolin only needs `/var/dynamic` for runtime configuration.

### 4. Traefik Configuration Strategy

**Decision**: Use Helm values + HTTP provider + Kubernetes CRDs (not static files).

**Helm Values Structure** (Layered Approach):

```
traefik.helmvalues/
├── default.yaml   # Base configuration (ACME, providers, API, metrics)
├── crowdsec.yaml  # CrowdSec plugin + access logs + volumes
├── pangolin.yaml  # Pangolin HTTP provider + Badger plugin
└── gerbil.yaml    # Gerbil sidecar + WireGuard ports
```

**Rationale for Separation**:

* Clear separation of concerns (each file has single responsibility)
* Easier to maintain and understand
* Can be selectively enabled/disabled per environment
* Follows Helm best practices for value overlays

**Providers Enabled**:

1. **HTTP Provider** (configured in `pangolin.yaml`)
   * Endpoint: `http://pangolin:3001/api/v1/traefik-config`
   * Pangolin generates dynamic routes for user-created resources
   * Polls every 5 seconds for configuration updates
   * **Must use `additionalArguments`** (Helm chart limitation)

2. **Kubernetes CRD** (configured in `default.yaml`)
   * For static Traefik resources (Middleware, IngressRoute, etc.)
   * CrowdSec middleware, security headers, redirect rules

3. **Kubernetes Ingress** (configured in `default.yaml`)
   * Compatibility layer for ACME HTTP-01 challenges
   * Not used for actual application routing

**Static `dynamic_config.yml` Removal**:

* Docker Compose used file provider for Pangolin's own routes
* In Kubernetes, these become Traefik CRD resources (`Middleware`, `IngressRoute`)
* HTTP provider handles all user-created routes dynamically

### 5. Database Architecture

**Decision**: CloudNativePG (CNPG) for PostgreSQL instead of containerized database.

**Benefits**:

* Managed PostgreSQL operator with automated backups to S3
* High availability capabilities
* Kubernetes-native secret management
* Better than stateful container with volume

**Configuration**:

```yaml
# pangolin.postgresql.yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: pangolin-database
spec:
  instances: 1
  backup:
    barmanObjectStore:
      destinationPath: s3://backups/pangolin
```

### 6. Networking Architecture

**Single-Node Deployment** (Kazimierz cluster):

```
Internet (HTTP/HTTPS)                    Internet (WireGuard)
    ↓ :80, :443                              ↓ :51820/udp, :21820/udp
[Traefik Service - LoadBalancer]        [Gerbil Service - LoadBalancer]
    ↓                                        ↓
[Traefik Pod]                            [Gerbil Pod]
    ↓ TLS termination (ACME HTTP-01)        ↓ WireGuard management (NET_ADMIN)
    ↓ HTTP routing                           ↓ Peer management API :3004
    ↓                                        ↓
[Pangolin Service :3001/:3002] ←─HTTP API─→ [Gerbil Service :3004]
    ↓                                        ↓
[Pangolin Pod]                           WireGuard Tunnels
    ├── HTTP API/UI (no TLS)                ↓
    └── PostgreSQL connection (CNPG)    [Backend Clusters (Newt clients)]
```

**Key Points**:

* **Separate pods**: Traefik and Gerbil are independent deployments
* **Gerbil SNI proxy DISABLED**: Port 8443 not used in single-node deployment
* **Traefik handles all HTTP/HTTPS**: Port 443 directly to Traefik (not via Gerbil)
* **Gerbil handles WireGuard only**: Creates tunnels for backend connectivity
* **Communication**: Kubernetes Services (not localhost)
* **All TLS termination**: Happens in Traefik container
* **Internal communication**: HTTP only within cluster

### 7. Logging and Observability

**Decision**: JSON access logs on shared volume for CrowdSec parsing.

**Flow**:

```
Traefik → /var/log/traefik/access.log (JSON)
    ↓ (shared PVC: traefik-logs)
CrowdSec → Parses logs → Detects threats
    ↓
Traefik (CrowdSec middleware) → Blocks malicious IPs
```

**Configuration**:

```yaml
logs:
  access:
    enabled: true
    format: json
    filePath: /var/log/traefik/access.log
    fields:
      defaultMode: drop  # Privacy: only keep essential fields
      names:
        ClientAddr: keep
        RequestMethod: keep
        DownstreamStatus: keep
```

***

## Security Considerations

### 1. TLS/HTTPS

* ✅ Automated certificate provisioning via ACME
* ✅ HTTPS redirect enforced globally
* ✅ Security headers (HSTS, CSP, etc.) via middleware
* ⚠️ Internal services use HTTP (acceptable in cluster network)

### 2. Network Policies

* TODO: Implement Cilium network policies
* Restrict Pangolin → PostgreSQL access
* Restrict CrowdSec → Traefik logs (read-only)

### 3. Secret Management

* ✅ OpenBao (Vault) for sensitive configuration
* ✅ ExternalSecrets Operator syncs to Kubernetes secrets
* ✅ CNPG auto-generates database credentials

### 4. CrowdSec Protection

* ✅ Parses Traefik logs for malicious patterns
* ✅ Bouncer middleware blocks threats in real-time
* ✅ AppSec virtual patching for common CVEs

***

## Storage Requirements

| Volume             | Purpose                               | Size  | Access Mode |
| ------------------ | ------------------------------------- | ----- | ----------- |
| `pangolin-data`    | Pangolin dynamic config + Gerbil keys | 5Gi   | RWO         |
| `letsencrypt-acme` | Traefik ACME certificates (acme.json) | 128Mi | RWO         |
| `traefik-logs`     | Access logs for CrowdSec parsing      | 1Gi   | RWO         |
| `crowdsec-data`    | CrowdSec database                     | 2Gi   | RWO         |
| `crowdsec-config`  | CrowdSec configuration                | 1Gi   | RWO         |

***

## Migration from Docker Compose

### Changes from Original Setup

| Aspect            | Docker Compose                       | Kubernetes                    | Notes               |
| ----------------- | ------------------------------------ | ----------------------------- | ------------------- |
| **Networking**    | `network_mode: service:gerbil`       | Gerbil sidecar in Traefik pod | Same behavior       |
| **Certificates**  | Traefik ACME → `/letsencrypt` volume | Traefik ACME → PVC            | Storage only        |
| **Database**      | Implicit (not in compose)            | CNPG PostgreSQL cluster       | Better HA           |
| **Configuration** | File provider (`dynamic_config.yml`) | HTTP provider + CRDs          | More flexible       |
| **Secrets**       | Environment variables / files        | ExternalSecrets + OpenBao     | Centralized         |
| **Startup Order** | `depends_on` with healthchecks       | Kubernetes readiness probes   | No guaranteed order |

### Removed Components

* ❌ `/var/certificates` mount (Pangolin doesn't need it)
* ❌ Static `dynamic_config.yml` file (replaced by CRDs)
* ❌ Separate Gerbil deployment (now sidecar)

### Added Components

* ✅ CNPG PostgreSQL operator
* ✅ ExternalSecrets for OpenBao integration
* ✅ Kubernetes CRDs for Traefik resources
* ✅ Separate PVCs for better isolation

***

## Future Improvements

### Short Term

* [ ] Add Cilium network policies
* [ ] Configure CrowdSec collections/scenarios
* [ ] Set up Prometheus metrics scraping
* [ ] Create HTTPRoute for Pangolin UI (alternative to dynamic config)

### Long Term

* [ ] Multi-node deployment with Gerbil SNI routing
* [ ] Consider wildcard certificates if subdomains proliferate
* [ ] Implement automated backup verification
* [ ] Add Grafana dashboards for observability

***

## References

* [Pangolin Docker Compose Setup](https://docs.pangolin.net/self-host/manual/docker-compose)
* [Gerbil SNI Proxy Design](https://github.com/fosrl/gerbil)
* [Traefik ACME Documentation](https://doc.traefik.io/traefik/https/acme/)
* [CloudNativePG Operator](https://cloudnative-pg.io/)
* [CrowdSec Traefik Bouncer Plugin](https://github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin)

***

## Questions & Clarifications

**Q: Why not use cert-manager?**
A: Pangolin creates routes dynamically via HTTP provider. ACME Traefik automatically provisions certificates for these routes, whereas cert-manager would require manual `Certificate` resource creation for each new domain.

**Q: Does Gerbil need certificates?**
A: No. Gerbil SNI proxy reads the unencrypted SNI hint during TLS handshake and forwards the encrypted connection to the destination. It never decrypts traffic.

**Q: Why is Gerbil a sidecar instead of separate pod?**
A: To share the network namespace with Traefik (`localhost` communication), replicating Docker Compose's `network_mode: service:gerbil` behavior. This allows Traefik to bind to ports 80/443 that Gerbil manages.

**Q: What about DNS-01 challenges for wildcard certificates?**
A: Explicitly excluded. HTTP-01 is sufficient for per-subdomain certificates, and DNS-01 would add complexity (DNS API credentials, provider configuration).
