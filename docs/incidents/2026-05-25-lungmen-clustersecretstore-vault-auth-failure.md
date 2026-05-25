---
title: "lungmen.akn ClusterSecretStore Vault Authentication Failure"
date: 2026-05-25
author: "[zai-coding-plan:glm-5.1]"
participants:
  - "Alexandre"
  - "[zai-coding-plan:glm-5.1]"
severity: "High"
status: "Final"
detection-method: "Manual discovery"
mttd: "~3h48m"
mttr: "~1h04m from investigation start to resolution"
services-affected:
  - "external-secrets-operator (lungmen.akn)"
  - "All 33 ExternalSecrets and 6 PushSecrets on lungmen.akn"
users-affected: "All applications on lungmen.akn depending on Vault-synced secrets (Forgejo, Immich, Paperless, n8n, Linkding, Atuin, Longhorn, cert-manager, Tailscale, etc.)"
related-incidents: []
trigger: "PR #996 merged at 2026-05-25T10:42:53Z — migrated shoot apps to per-project infrastructure pattern, which removed the legacy `openbao-auth-delegator` ServiceAccount that had been deployed via the shoot mechanism, exposing the fact that the token reviewer JWT had always been sourced from the wrong cluster"
related-adrs:
  - "docs/decisions/001-centralized-secret-management.md"
  - "docs/decisions/002-openbao-secrets-topology.md"
  - "docs/decisions/003-openbao-path-naming-conventions.md"
  - "docs/decisions/004-openbao-policy-naming-conventions.md"
---

# Post-Mortem: lungmen.akn ClusterSecretStore Vault Authentication Failure

## Executive Summary

The `vault.chezmoi.sh` ClusterSecretStore on the lungmen.akn cluster was unable to authenticate with OpenBao, preventing all 33 ExternalSecrets and 6 PushSecrets from syncing. The root cause was a token reviewer JWT stored in OpenBao that was not updated after PR [#996](https://github.com/chezmoidotsh/arcane/pull/996) was merged and the old ServiceAccount was removed, resulting in a request rejection (403) when the operator attempted to authenticate with OpenBao. The fix was regenerating the token from lungmen's `external-secrets` service account and updating OpenBao directly.

***

## Event Summary

**Expected outcome:** External Secrets Operator on lungmen.akn authenticates to OpenBao via the Kubernetes auth method at mount path `lungmen.akn`, using role `lungmen.akn-eso-role`. All ExternalSecrets sync successfully.

**Actual outcome:** ClusterSecretStore status `InvalidProviderConfig: unable to create client`. 33 ExternalSecrets in `SecretSyncedError`, 6 PushSecrets failing with `403 permission denied` at `PUT /v1/auth/lungmen.akn/login`.

**Impact:** All applications on lungmen.akn that depend on Vault-synced secrets could not receive credential updates. This includes database passwords, OIDC client secrets, TLS certificates, SMB credentials, and S3 backup keys. Applications running with cached secrets continued to function, but any secret rotation would have failed silently.

**Duration:** The failure became visible when PR #996 merged 2026-05-25 at \~10:42 UTC, which migrated all shoot-managed applications to the same deployment pattern as other workloads, and removed the legacy SA. The previously-latent auth failure surfaced as a full outage. Resolved 2026-05-25 at \~15:34 UTC.

**First signal:** Alexandre noticed the ClusterSecretStore failure on lungmen \~4h after PR #996 merged, while reviewing changes ahead of PR #994.

***

## Timeline

| Time (UTC)              | Actor                      | Event or Decision                                                                                                       |
| ----------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 2026-05-25 \~14:30 UTC  | Alexandre                  | Requests investigation of ClusterSecretStore failure on lungmen                                                         |
| 2026-05-25 \~14:45 UTC  | \[zai-coding-plan:glm-5.1] | Identifies 403 error at `/v1/auth/lungmen.akn/login` in ESO logs via `kubectl logs`                                     |
| 2026-05-25 \~15:00 UTC  | \[zai-coding-plan:glm-5.1] | Decodes JWT from `lungmen-akn-eso-credentials` secret — discovers `openbao-auth-delegator` SA does not exist on lungmen |
| 2026-05-25 \~15:10 UTC  | \[zai-coding-plan:glm-5.1] | Generates new token from lungmen's `external-secrets` SA, updates OpenBao via `bao kv patch` (v2 → v3)                  |
| 2026-05-25 \~15:20 UTC  | \[zai-coding-plan:glm-5.1] | Forces ExternalSecret refresh on amiya to propagate new token to Crossplane secret                                      |
| 2026-05-25 \~15:25 UTC  | \[zai-coding-plan:glm-5.1] | Crossplane does not re-apply `AuthBackendConfig` despite reconciliation trigger                                         |
| 2026-05-25 \~15:30 UTC  | \[zai-coding-plan:glm-5.1] | Directly updates OpenBao auth backend config via `bao write auth/lungmen.akn/config`                                    |
| 2026-05-25 15:34:24 UTC | \[system:external-secrets] | ClusterSecretStore transitions to `Ready: store validated`. 33/34 ExternalSecrets sync successfully.                    |

***

## What Went Well

* **Shared catalog architecture** — The `ClusterSecretStore` base definition in `catalog/kubernetes/external-secrets/kustomize/` with per-cluster patches in each project's kustomization made the source-of-truth code correct. The bug was in the runtime data, not the declarative config.
* **Existing `system:auth-delegator` binding** — The Helm chart's `extraObjects` already bound `system:auth-delegator` to the `external-secrets` SA on every cluster. No new RBAC was needed; only the token needed regeneration.
* **Layered debugging approach** — Following the chain from ClusterSecretStore → ESO logs → JWT decode → SA existence check → Crossplane resources allowed rapid root-cause isolation.

***

## Root-Cause Analysis

### Technique: 5 Whys

1. **Why were all ExternalSecrets on lungmen.akn failing?** Because the ClusterSecretStore `vault.chezmoi.sh` could not authenticate with OpenBao, returning 403 at `/v1/auth/lungmen.akn/login`.

2. **Why was OpenBao rejecting the authentication?** Because the token reviewer JWT configured in the `AuthBackendConfig` was not valid. When OpenBao called the TokenReview API on `kubernetes.lungmen.akn.chezmoi.sh:6443` using this token, the lungmen API server rejected it as unrecognized.

3. **Why was the token reviewer JWT not valid?** Because the related ServiceAccount (`openbao-auth-delegator`) did not exist on lungmen.akn anymore, so the token could not be properly validated by the API server. The token's `iss` claim also did not match the expected issuer for lungmen's cluster.

4. **Why did the `openbao-auth-delegator` SA not exist on lungmen?** Because PR #996 removed the legacy `openbao-auth-delegator` SA by migrating external-secrets from the shoot mechanism to the per-project infrastructure pattern, but the token stored in OpenBao was still referencing that SA.

5. **Why was there no validation of the token issuer against the target cluster?** Because the `RemoteClusterVault` Crossplane composition reads the reviewer token from a Kubernetes secret referenced by label, but never validates that the token's `iss` claim matches `spec.host`. The composition trusts that the secret contains the correct token. There is no pre-flight check or admission webhook that validates this relationship.

### Root Causes

* **No issuer validation in the RemoteClusterVault bootstrap flow** — The Crossplane composition for `RemoteClusterVault` accepts any token in the referenced secret and passes it directly to OpenBao's `AuthBackendConfig`. It never verifies that the token's issuer matches the cluster's `kubernetesHost`. This structural gap makes it possible to store a token from any cluster for any auth backend, and the system will silently accept it.

### Contributing Factors

* **Crossplane does not re-apply `AuthBackendConfig` when the referenced secret changes** — Even after the secret was updated in OpenBao and the ExternalSecret refreshed on amiya, Crossplane's provider-vault did not detect the change and re-apply the auth backend config. The fix required a direct `bao write` to OpenBao, bypassing GitOps. This means any future token rotation will also require manual intervention.
* **Legacy non-expiring token format** — The original token used the legacy `kubernetes/serviceaccount` issuer with no `exp` claim. This masked the problem because the token would never expire, making it appear valid on inspection. The new token uses the projected token format with a proper issuer URL and expiration.

***

## Warning Signs Missed

| Signal                                                        | When visible                        | Why it wasn't acted on                                                                |
| ------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| ClusterSecretStore `Ready=False` with `InvalidProviderConfig` | After PR merge (\~10:42 UTC)        | No alerting on ClusterSecretStore status; no dashboard tracked it                     |
| ExternalSecrets in `SecretSyncedError` across all namespaces  | After PR merge (\~10:42 UTC)        | Applications continued running on cached secrets, so no user-visible outage           |
| JWT `iss` claim was legacy `kubernetes/serviceaccount`        | Before incident (at bootstrap time) | No validation step during bootstrap checked the issuer                                |
| `openbao-auth-delegator` SA missing on lungmen                | Before incident (at bootstrap time) | No reconciliation ensures the SA referenced in the token exists on the target cluster |

***

## Control Analysis

### In Control (what we could have changed)

* No alerting or monitoring on ClusterSecretStore readiness status.
* No GitOps-enforced reconciliation path for the OpenBao auth backend config when the underlying secret changes.
* The `RemoteClusterVault` composition does not validate the `iss` claim of the referenced token.
  * Implementing this is difficult: the composition is generic and the token payload is opaque to the Crossplane layer.

### Out of Control (external factors)

| External factor                              | What would reduce exposure?                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Crossplane provider-vault caches secret refs | Add an explicit `reconcile` trigger or periodic force-sync annotation in the composition |

***

## Systemic Lessons

* **Crossplane drift detection is insufficient for secret references** — When a Crossplane managed resource references a Kubernetes secret (via `*SecretRef`), the provider reads the secret at create/update time but does not re-read it on subsequent reconciles unless the spec changes. This means secret rotation requires either a spec change (e.g., bumping an annotation) or a direct API call outside GitOps. This affects all `AuthBackendConfig` resources using `tokenReviewerJwtSecretRef`.

* **No observability for secret management health** — The ESO and Crossplane ecosystems report status via CRD conditions, but nothing in the current monitoring stack surfaces ClusterSecretStore or ExternalSecret readiness. A single `ClusterSecretStore` failure cascades to all dependent applications. Adding alerting on CRD conditions is the right long-term fix; it is not scheduled yet.
