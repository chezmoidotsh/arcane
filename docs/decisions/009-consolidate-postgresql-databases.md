---
status: "proposed"
date: 2026-03-20
decision-makers: ["Gemini CLI", "User"]
consulted: ["ai/gemini"]
informed: []
---

# Consolidate PostgreSQL databases into shared CNPG clusters

## Table of Contents

* [Context and Problem Statement](#context-and-problem-statement)
* [Decision Drivers](#decision-drivers)
* [Considered Options](#considered-options)
  * [Option 1: Consolidate into 3 shared CloudNative-PG clusters](#option-1-consolidate-into-3-shared-cloudnative-pg-clusters)
  * [Option 2: Keep individual clusters, optimize resources](#option-2-keep-individual-clusters-optimize-resources)
  * [Option 3: Single PostgreSQL cluster for all applications](#option-3-single-postgresql-cluster-for-all-applications)
  * [Option 4: Use external managed PostgreSQL (AWS RDS, etc.)](#option-4-use-external-managed-postgresql-aws-rds-etc)
* [Decision Outcome](#decision-outcome)
* [Consequences](#consequences)
  * [Positive](#positive)
  * [Negative](#negative)
  * [Neutral](#neutral)
* [Implementation Details / Status](#implementation-details--status)
* [References and Related Decisions](#references-and-related-decisions)
* [Changelog](#changelog)

## Context and Problem Statement

Each application requiring PostgreSQL currently has its own dedicated CloudNative-PG cluster. For instance, `amiya.akn` hosts `pocket-id` and `openbao`, while `lungmen.akn` hosts `atuin`, `immich`, `jellyseerr`, `n8n`, and `paperless-ngx`. Each of these instances operates independently with individual backup schedules, resource allocations, monitoring, maintenance, and CNPG configurations.

This current architecture leads to significant pain points: resource overhead (each instance consumes 200-500MB RAM minimum), storage fragmentation due to multiple small PVCs, high operational complexity from managing 7+ separate backup schedules and upgrade cycles, inconsistent configurations across clusters, and inefficient backup storage. The `lungmen.akn` cluster, in particular, is experiencing resource pressure with increasing application deployments.

The strategic question this ADR aims to answer is: How can we reduce resource overhead and operational complexity of PostgreSQL instances while maintaining security and performance in a growing homelab infrastructure?

## Decision Drivers

* **Non-Functional Requirements**:
  * Reduce resource overhead by 40-60% through shared PostgreSQL instances.
  * Simplify backup management from 7+ schedules to 3 consolidated schedules.
  * Standardize PostgreSQL configuration across all applications.
  * Maintain security isolation between application data using schemas and roles.
  * Enable easier PostgreSQL version management with fewer clusters to upgrade.
  * High availability for `postgres-security` and `postgres-apps-secured` clusters.
  * Point-in-time recovery capability per database.
  * No cross-application database access.
  * OpenBao integration for credential storage.

## Considered Options

### Option 1: Consolidate into 3 shared CloudNative-PG clusters

This option involves creating three shared CloudNative-PG clusters: `postgres-security` for authentication and secrets (pocket-id, openbao), `postgres-apps` for standard applications (atuin, jellyseerr, n8n), and `postgres-apps-secured` for applications with sensitive data (immich, paperless-ngx). The `postgres-security` and `postgres-apps-secured` clusters will have 1 primary/1 replica for high availability, while `postgres-apps` will have a single primary. Database-specific isolation will be achieved using CNPG Database CRDs, and role-based access control will be implemented per application. Backup configurations will be standardized per cluster type, with OpenBao integrating for credential storage.

* `+` Significantly reduces resource overhead.
* `+` Simplifies backup management and configuration standardization.
* `+` Maintains security boundaries through PostgreSQL features (schemas, roles).
* `+` Facilitates easier PostgreSQL version management.
* `+` Leverages CNPG's Database and Cluster CRDs for better automation.
* `-` Increased blast radius for shared clusters (mitigated by replicas and careful design).
* `-` Potential "noisy neighbor" issues (mitigated by separation of sensitive applications).
* `-` More complex single-database restoration (mitigated by documentation and runbooks).
* `-` Requires significant migration effort for existing applications.

### Option 2: Keep individual clusters, optimize resources

This approach maintains the current architecture where each application requiring PostgreSQL has its own dedicated CloudNative-PG cluster. Efforts would be focused on optimizing the resource consumption and configuration of each individual cluster to minimize overhead.

* `+` Maximum isolation between applications.
* `+` No migration risk.
* `+` Simpler blast radius (only one app affected per failure).
* `-` Does not effectively address the cumulative resource overhead problem.
* `-` Operational complexity remains high due to managing many independent clusters.
* `-` No significant improvement in backup management efficiency.

### Option 3: Single PostgreSQL cluster for all applications

This option proposes consolidating all applications into a single, large PostgreSQL cluster. All databases would reside within this one cluster, sharing its resources and backup mechanisms.

* `+` Achieves maximum resource efficiency.
* `+` Simplest possible backup management (only one schedule to maintain).
* `+` Easiest to operate from a high-level infrastructure perspective.
* `-` Unacceptable blast radius (a single failure affects all applications).
* `-` Critical authentication and secrets services would be mixed with less sensitive user applications, posing a security risk.
* `-` Lack of clear security boundaries between different application tiers.

### Option 4: Use external managed PostgreSQL (AWS RDS, etc.)

This alternative suggests migrating all PostgreSQL databases to an external, managed cloud service such as AWS RDS, Google Cloud SQL, or Azure Database for PostgreSQL.

* `+` Zero operational overhead for database management.
* `+` Professional-grade backup management and high availability features built-in.
* `-` Incurs monthly costs, which is not aligned with homelab self-hosting principles.
* `-` Raises data sovereignty concerns as data would reside in the cloud.
* `-` Requires constant internet connectivity for applications to access their databases.
* `-` Eliminates the learning opportunity and experience with Kubernetes-native solutions like CloudNative-PG.

## Decision Outcome

**Chosen option: "Consolidate into 3 shared CloudNative-PG clusters"**, because this approach provides the optimal balance between resource efficiency, operational simplification, and maintaining acceptable security and resilience within the homelab context. It directly addresses the critical problems of resource overhead and operational complexity identified in the problem statement while leveraging CloudNative-PG's robust features for multi-tenancy and isolation. The three-cluster design allows for logical separation of applications based on criticality and data sensitivity, mitigating the increased blast radius and noisy neighbor risks associated with consolidation, and aligning with our homelab philosophy of self-hosting with Kubernetes-native tools.

## Consequences

### Positive

* ✅ Reduced CPU and RAM consumption from fewer PostgreSQL instances.
* ✅ More efficient storage usage due to consolidated WAL and checkpoints.
* ✅ Lower S3 storage costs for backups.
* ✅ Simplified backup and upgrade management processes.
* ✅ Standardized PostgreSQL configuration across applications.
* ✅ Easier troubleshooting with consolidated logs.
* ✅ Reduced complexity in ArgoCD application definitions.

### Negative

* ⚠️ Increased blast radius for applications sharing a cluster, though mitigated by replica configurations and careful design.
* ⚠️ Potential for "noisy neighbor" issues, particularly if resource limits are not properly set, mitigated by separating sensitive applications into `postgres-apps-secured`.
* ⚠️ Initial migration of existing data from standalone clusters to shared clusters is required.
* ⚠️ Restoring a single database from a shared cluster backup is more complex than from a dedicated cluster backup (mitigated by runbooks).

### Neutral

* ⚖️ Requires application code changes to update database connection strings and ExternalSecret references.
* ⚖️ Requires updates to network policies to allow applications to connect to the new shared clusters.

## Implementation Details / Status

* **Completed Components**: Design of the three shared CloudNative-PG cluster architecture (`postgres-security`, `postgres-apps`, `postgres-apps-secured`) and their allocation strategy as per issue #661.
* **Pending Components**: Actual creation of the shared CNPG clusters, configuration of S3 backups with OpenBao credentials, implementation of network policies for database access, setup of Prometheus ServiceMonitors, and the migration of existing application databases.
* **Architecture**:
  * **`postgres-security` (amiya.akn)**: Dedicated to critical authentication and secrets management (e.g., `pocket-id`, `openbao`). Configured with 1 primary and 1 replica for high availability.
  * **`postgres-apps` (lungmen.akn)**: Hosts standard user-facing applications with moderate data sensitivity (e.g., `atuin`, `jellyseerr`, `n8n`). Configured with a single primary instance.
  * **`postgres-apps-secured` (lungmen.akn)**: Designed for applications handling personally sensitive or large-volume data (e.g., `immich`, `paperless-ngx`). Configured with 1 primary and 1 replica for enhanced resilience.
  * Database-specific isolation will be enforced using CloudNative-PG `Database` Custom Resources.
  * Role-based access control will be managed per application, with credentials stored in OpenBao.
* **Standards Specification**:
  * Naming conventions for PostgreSQL objects (databases, roles) will follow `snake_case`.

## References and Related Decisions

* **Related ADRs**:
  * [ADR-008: Project Structure and Naming Conventions](./008-project-structure-and-naming-conventions.md)
* **Implementation References**:
  * CloudNative-PG Database CRD Documentation
  * CloudNative-PG Cluster CRD Documentation
  * PostgreSQL Schema Isolation Documentation
  * GitHub Issue #661: Consolidate PostgreSQL databases into shared CNPG clusters

## Changelog

* **2026-03-20**: **FEATURE**: Initial creation of ADR documenting the decision to consolidate PostgreSQL databases into shared CloudNative-PG clusters.
