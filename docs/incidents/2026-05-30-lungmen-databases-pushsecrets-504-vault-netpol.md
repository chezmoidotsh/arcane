---
title: "lungmen.akn databases PushSecrets 504 — vault namespace NetPol"
date: 2026-05-30
author: "[anthropic:claude-sonnet-4-6]"
participants:
  - "Alexandre"
  - "[anthropic:claude-sonnet-4-6]"
severity: "Medium"
status: "Final"
detection-method: "User report"
mttd: "unknown"
mttr: "~15m from investigation start to fix"
services-affected:
  - "databases PushSecrets (lungmen.akn) — n8n, atuin, forgejo, immich, linkding, paperless"
users-affected: "No direct user impact; database credential sync to OpenBao interrupted"
related-incidents:
  - "docs/incidents/2026-05-25-lungmen-clustersecretstore-vault-auth-failure.md"
related-adrs: []
---

# Post-Mortem: lungmen.akn databases PushSecrets 504 — vault namespace NetPol

## Executive Summary

PushSecrets in the `databases` namespace on `lungmen.akn` were failing to push database credentials into OpenBao. The root cause was CiliumNetworkPolicies recently added to the `vault` namespace on `amiya.akn` blocking OpenBao's egress to lungmen's Kubernetes API server — a connection OpenBao must make to validate JWTs during Kubernetes auth. The fix is a dedicated CiliumNetworkPolicy allowing FQDN-scoped access to `kubernetes.lungmen.akn.chezmoi.sh:6443`.

***

## Event Summary

**Expected outcome:** PushSecrets in the `databases` namespace sync PostgreSQL credentials (username, password, URI, etc.) to OpenBao every 5 minutes.

**Actual outcome:** All databases PushSecrets returned `set secret failed: unable to log in with Kubernetes auth [...] Code: 504. Raw Message: upstream request timeout` on `PUT https://vault.chezmoi.sh/v1/auth/lungmen.akn/login`.

**Impact:** CNPG credential sync to OpenBao interrupted. Existing credentials in OpenBao remained valid (no data loss); impact limited to new credential rotations or cluster provisioning.

**Duration:** Unknown — detected via user report; interruption duration not measured. Timeline omitted — timestamps not reliably reconstructable.

**First signal:** User report of ESO errors in the `databases` namespace.

***

## Timeline

*Omitted — timestamps not reliably reconstructable.*

***

## What Went Well

* The ESO error message was precise and immediately actionable: exact URL, HTTP code, raw message. Root cause was localized in under 5 minutes.
* Diagnosis correctly ruled out false leads (stale CA cert, DNS failure, Tailscale) by focusing on the 504 code — a timeout on OpenBao's side, not ESO's.
* The fix is surgical: a `toFQDNs`-scoped policy per remote cluster rather than a blanket `world` egress allowance on port 6443.

***

## Root-Cause Analysis

### Technique: 5 Whys

1. **Why did PushSecrets fail?** → ESO received a 504 when authenticating to OpenBao via `auth/lungmen.akn`.
2. **Why did OpenBao return 504?** → OpenBao could not reach `kubernetes.lungmen.akn.chezmoi.sh:6443` to validate the Kubernetes JWT presented by ESO (TokenReview).
3. **Why couldn't OpenBao reach that endpoint?** → Cilium blocked egress from the OpenBao pod to that destination (`world` entity, port 6443).
4. **Why was that egress blocked?** → The `default-hardened` CiliumNetworkPolicy in the `vault` namespace denies all egress by default, and `allow-openbao-to-kubernetes-api` only permitted port 6443 toward the local kube-apiserver (`kube-system` endpoint + `host` entity) — not toward remote cluster API servers.
5. **Why didn't the policy cover remote clusters?** → When `allow-openbao-to-kubernetes-api` was written, only the local use case (amiya → amiya kube-apiserver) was modeled. OpenBao's need to reach remote cluster API servers to validate their JWTs was not identified as a required egress path.

### Root Causes

* **`allow-openbao-to-kubernetes-api` was written without modeling remote Kubernetes auth backends.** OpenBao must reach the API server of *each remote cluster* registered via a Crossplane `RemoteClusterVault` to perform JWT TokenReview. This outbound connection is not visible in ESO's configuration and is easy to overlook — it is OpenBao, not ESO, that initiates it.

### Contributing Factors

* **No smoke test after adding vault namespace NetPols.** There was no verification that all OpenBao auth backends were still functional after the new policies were applied.
* **Recent related incident** (`2026-05-25`) on the same auth chain (lungmen ESO ↔ OpenBao), which could have prompted explicit testing of this path.

***

## Warning Signs Missed

| Signal                                                                              | When visible                   | Why not acted on                                                          |
| ----------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| The 2026-05-25 incident already touched the same ESO → OpenBao → lungmen auth chain | When writing the vault NetPols | Focus was on the local auth use case; remote auth paths were not in scope |

***

## Control Analysis

### In Control

* `allow-openbao-to-kubernetes-api` should have been written accounting for all Kubernetes auth backends configured in OpenBao, not only the local one.
* A post-deployment smoke test (verify `ClusterSecretStore` is `Ready` and PushSecrets are `Synced`) would have caught the regression immediately.

### Out of Control

| External factor                      | What would reduce exposure? |
| ------------------------------------ | --------------------------- |
| None — incident is entirely internal | —                           |

***

## Systemic Lessons

* **Adding NetworkPolicies to a broker namespace (OpenBao, ArgoCD) requires modeling *all* egress paths, including outbound connections the broker initiates toward third-party systems.** These indirect outbound connections (OpenBao → remote kube-apiserver) are invisible in ESO's configuration and easy to miss.
* **Every `RemoteClusterVault` added via Crossplane requires a corresponding CNP in the `vault` namespace.** This coupling is not expressed in code — it is an implicit convention that must be made explicit in the bootstrap checklist and/or the Crossplane Composition itself.

***

## Change Register

| # | Priority | Action                                                                                                                                                     | Owner                          | Due Date   | Verification                                        |
| - | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------- | --------------------------------------------------- |
| 1 | P0       | Add `allow-openbao-to-lungmen-api` CNP (`toFQDNs: kubernetes.lungmen.akn.chezmoi.sh:6443`) — **already applied**                                           | \[anthropic:claude-sonnet-4-6] | 2026-05-30 | All databases PushSecrets in `Synced` state         |
| 2 | P1       | Add a comment in `remote.x.v1alpha1.openbao.yaml` (Crossplane Composition) noting that a vault namespace CNP is required for each new `RemoteClusterVault` | Alexandre                      | 2026-06-06 | Comment visible in the Composition; PR merged       |
| 3 | P2       | Add a post-NetPol smoke-test checklist in `HOW_TO_BOOTSTRAP.md`: verify `ClusterSecretStore` Ready and PushSecrets Synced                                  | Alexandre                      | 2026-06-15 | "Post-NetPol validation" section present in the doc |

***

## Resolution Tracker

### Done

* [x] Add `allow-openbao-to-lungmen-api` CiliumNetworkPolicy (`toFQDNs: kubernetes.lungmen.akn.chezmoi.sh:6443`) — applied in `projects/amiya.akn/src/apps/vault/security/` and `dist/`

### Pending — after next PR merges

* [ ] Add comment in `catalog/crossplane/clustervault.vault.chezmoi.sh/remote.x.v1alpha1.openbao.yaml` noting CiliumNetworkPolicy requirement per `RemoteClusterVault`
* [ ] Add post-NetPol smoke-test checklist in `projects/lungmen.akn/docs/HOW_TO_BOOTSTRAP.md`

***

## Verification Schedule

| Checkpoint    | Date       | What we'll check                                        | Forum                |
| ------------- | ---------- | ------------------------------------------------------- | -------------------- |
| Immediate     | 2026-05-30 | All databases PushSecrets in `Synced` after ArgoCD sync | ArgoCD UI            |
| 1-week review | 2026-06-06 | Action #2 complete; no new 504s on `auth/lungmen.akn`   | ArgoCD events review |
