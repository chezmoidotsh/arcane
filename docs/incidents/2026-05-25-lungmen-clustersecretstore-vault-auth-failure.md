---
title: "lungmen.akn ClusterSecretStore Vault Authentication Failure"
date: 2026-05-25
author: "[zai-coding-plan:glm-5.1]"
participants:
  - "Alexandre"
  - "[zai-coding-plan:glm-5.1]"
severity: "Medium"   # apps kept running on cached secrets; only rotation paths blocked
status: "Open"
detection-method: "Manual discovery"
duration: "~4h52m (latent failure surfaced ~10:42 UTC at PR #996 merge → resolved ~15:34 UTC)"
services-affected:
  - "external-secrets-operator (lungmen.akn)"
  - "All 33 ExternalSecrets and 6 PushSecrets on lungmen.akn"
users-affected: "No end-user impact — applications kept running on cached secrets; only secret rotation paths were blocked"
root-cause-family:
  - bootstrap-coupling
  - observability-gap
  - state-drift
trigger: "PR #996 merged at 2026-05-25T10:42:53Z — migrated shoot apps to per-project infrastructure pattern, which removed the legacy `openbao-auth-delegator` ServiceAccount that had been deployed via the shoot mechanism, exposing the fact that the token reviewer JWT had always been sourced from the wrong cluster"
related-incidents:
  - path: "docs/incidents/2026-05-30-lungmen-databases-pushsecrets-504-vault-netpol.md"
    relation: "Same ESO → OpenBao → lungmen kube-apiserver auth chain — second failure mode on same path"
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

<!-- skew: ±15m for Alexandre's detection (noticed ~4h after PR merge); ±5m for AI agent actions; exact for [system:external-secrets] event (sourced from ESO controller log) -->

| Time (UTC) | Actor                      | Event or Decision                                                                                                       |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
|            | Alexandre                  | Requests investigation of ClusterSecretStore failure on lungmen                                                         |
|            | \[zai-coding-plan:glm-5.1] | Identifies 403 error at `/v1/auth/lungmen.akn/login` in ESO logs via `kubectl logs`                                     |
|            | \[zai-coding-plan:glm-5.1] | Decodes JWT from `lungmen-akn-eso-credentials` secret — discovers `openbao-auth-delegator` SA does not exist on lungmen |
|            | \[zai-coding-plan:glm-5.1] | Generates new token from lungmen's `external-secrets` SA, updates OpenBao via `bao kv patch` (v2 → v3)                  |
|            | \[zai-coding-plan:glm-5.1] | Forces ExternalSecret refresh on amiya to propagate new token to Crossplane secret                                      |
|            | \[zai-coding-plan:glm-5.1] | Crossplane does not re-apply `AuthBackendConfig` despite reconciliation trigger                                         |
|            | \[zai-coding-plan:glm-5.1] | Directly updates OpenBao auth backend config via `bao write auth/lungmen.akn/config`                                    |
|            | \[system:external-secrets] | ClusterSecretStore transitions to `Ready: store validated`. 33/34 ExternalSecrets sync successfully.                    |

***

## What Went Well

* **Shared catalog architecture** — The `ClusterSecretStore` base definition in `catalog/kubernetes/external-secrets/kustomize/` with per-cluster patches in each project's kustomization made the source-of-truth code correct. The bug was in the runtime data, not the declarative config.
* **Existing `system:auth-delegator` binding** — The Helm chart's `extraObjects` already bound `system:auth-delegator` to the `external-secrets` SA on every cluster. No new RBAC was needed; only the token needed regeneration.
* **Layered debugging approach** — Following the chain from ClusterSecretStore → ESO logs → JWT decode → SA existence check → Crossplane resources allowed rapid root-cause isolation.

***

## Root-Cause Analysis

**Technique:** 5 Whys
**Why this technique:** Single linear chain — token from wrong cluster passed through bootstrap and was never validated. Cause chain converges cleanly without branching.

### Analysis

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

***

## From Lesson to Control

| Lesson                                                                               | Artifact type                | Linked artifact                                                          |
| ------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------ |
| Crossplane `*SecretRef` does not re-read on secret change — rotation needs spec bump | Knowledge file               | `.agents/knowledge/crossplane.md`                                        |
| ClusterSecretStore / ExternalSecret readiness has no signal                          | Alert rule                   | TBD — depends on monitoring stack rollout (no monitoring yet)            |
| `RemoteClusterVault` Composition trusts any token in the referenced secret           | OPA rule / Composition guard | `catalog/crossplane/clustervault.vault.chezmoi.sh/` — token issuer check |

***

## Change Register

* [ ] \[due:: 2026-06-15] \[priority:: high] \[size:: M] \[owner:: Alexandre] Add `iss` claim validation in the `RemoteClusterVault` Composition bootstrap path (or a pre-flight OPA rule) so a token from the wrong cluster cannot be silently accepted
  * **Verification:** Manually test: store a token from amiya in lungmen's slot — composition rejects with a clear error message
  * **If not done:** Same class of latent auth failure possible on every new `RemoteClusterVault`

* [ ] \[due:: 2026-06-22] \[priority:: high] \[size:: L] \[owner:: Alexandre] Plan observability stack covering ClusterSecretStore + ExternalSecret readiness (this is the meta-pattern from `observability-gap` family)
  * **Verification:** Document a concrete monitoring proposal (Prometheus rule set or alternative) committed to `docs/decisions/` or `docs/experiments/`
  * **If not done:** Next ESO/Vault auth failure also discovered by user, not signal

* [ ] \[due:: 2026-06-08] \[priority:: medium] \[size:: S] \[owner:: Alexandre] Document in the `RemoteClusterVault` Composition the manual rotation procedure (since Crossplane won't re-apply auth backend config automatically)
  * **Verification:** Comment block visible in `remote.x.v1alpha1.openbao.yaml`; next rotation event uses documented procedure without rediscovery
  * **If not done:** Future token rotation will rediscover the `bao write` workaround under pressure

***

## Agent Knowledge

* Crossplane `provider-vault` `AuthBackendConfig.tokenReviewerJwtSecretRef`: reads the referenced secret at create/update, **does not re-read** on subsequent reconciles. Rotating the token requires a spec bump (e.g., an annotation change) or a direct `bao write auth/<mount>/config`.
* OpenBao Kubernetes auth method: when called from a remote cluster, OpenBao itself makes a TokenReview call to that cluster's kube-apiserver. The token reviewer JWT must come from a SA on **the target cluster**, not the OpenBao host cluster.
* JWT issuer (`iss` claim) reveals the source cluster — `legacy kubernetes/serviceaccount` (no `exp`) is the old-format SA token; projected tokens carry a full issuer URL. Always cross-check `iss` against the cluster the auth backend points to.
* External Secrets Operator `Helm extraObjects` is used to bind `system:auth-delegator` to the `external-secrets` SA on every cluster — that binding is the prerequisite for OpenBao's TokenReview to succeed.

***

## Verification Schedule

| Checkpoint     | Date       | Observable                                                                                  | Forum       |
| -------------- | ---------- | ------------------------------------------------------------------------------------------- | ----------- |
| 1-week review  | 2026-06-08 | Medium item complete; rotation procedure documented in the Composition                      | Solo review |
| 1-month review | 2026-06-22 | High items 1 & 2 progressed; issuer validation tested; observability plan drafted           | Solo review |
| 3-month review | 2026-08-25 | No recurrence of secret-store auth failure discovered by user (signal-first detection only) | Solo review |
