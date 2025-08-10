# CrowdSec Security Platform

## ⚠️ Temporary Placement Notice

**Important**: This CrowdSec LAPI (Local API) deployment is temporarily placed on the `amiya.akn` cluster for the following reasons:

### Current Decision Rationale

1. **No Dedicated Security Platform**: We currently lack a dedicated security infrastructure cluster
2. **Immediate Implementation Need**: ADR-006 external access strategy requires CrowdSec protection immediately
3. **Resource Availability**: `amiya.akn` has sufficient resources and reliability for this critical service
4. **Network Positioning**: Optimal placement for protecting external-facing services

### Future Migration Plan

**Target Architecture**: CrowdSec LAPI should eventually be moved to a dedicated security infrastructure cluster when available:

* **Dedicated Security Cluster**: Isolated environment for all security tools (CrowdSec, WAF, monitoring)
* **High Availability**: Multi-node setup with proper backup and disaster recovery
* **Network Segmentation**: Dedicated network zones for security services
* **Compliance**: Better alignment with security best practices and audit requirements

### Current Setup

This deployment provides:

* **LAPI Service**: Central API for CrowdSec decisions and threat intelligence
* **Community Integration**: Enrollment with CrowdSec Central API for shared threat data
* **Traefik Integration**: Bouncer key for Traefik plugin authentication
* **Monitoring**: Metrics endpoint for observability

### Migration Considerations

When moving to a dedicated platform:

1. **Network Connectivity**: Ensure LAPI accessibility from all protected services
2. **Secret Management**: Update bouncer keys and enrollment credentials
3. **Backup/Restore**: Migrate decision database and configuration
4. **DNS/Service Discovery**: Update service references in consuming applications

***

**Status**: 🟡 Temporary - Planned for future migration\
**Priority**: Low (current setup is functional and secure)\
**Owner**: Infrastructure Team
