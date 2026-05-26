---
title: "Kyverno image-rewrite policy → Zot/Longhorn circular dependency — cluster-wide ImagePullBackOff on amiya.akn"
date: 2026-05-26
author: "[anthropic:claude-sonnet-4-6]"
participants:
  - "Alexandre"
  - "[anthropic:claude-sonnet-4-6]"
severity: "Critical"
status: "Final"
detection-method: "Manual discovery (post-upgrade monitoring)"
mttd: "~0m (detected immediately after cluster upgrades)"
mttr: "~15m (Kyverno scaled to 0; cluster fully restored after workload restart)"
services-affected:
  - "All workloads on amiya.akn — ImagePullBackOff cluster-wide"
  - "longhorn-system — storage layer degraded"
  - "zot-registry (amiya.akn) — OCI mirror unavailable"
  - "Downstream clusters (lungmen.akn) — indirect impact via shared Zot instance"
users-affected: "All services on amiya.akn unavailable for the duration"
related-incidents:
  - "docs/incidents/2026-05-25-zot-disk-full-imagepullbackoff.md"
related-adrs: []
related-issues:
  - "https://github.com/chezmoidotsh/arcane/issues/1005"
---

# Post-Mortem: Kyverno image-rewrite policy → Zot/Longhorn circular dependency — cluster-wide ImagePullBackOff on amiya.akn

## Executive Summary

The Kyverno `enforce-local-registry` `MutatingPolicy` was configured to redirect every
container image to the local Zot OCI mirror (`oci.chezmoi.sh`) and set
`imagePullPolicy: Always`. The policy excluded `kube-system`, `kyverno-system`,
`kube-public`, and `kube-node-lease`, but **not `longhorn-system`**. This created a
circular dependency: Longhorn pods needed to pull images from Zot, while Zot's storage
PVC was backed by Longhorn. When the cluster upgrades triggered pod restarts in
`longhorn-system`, the chain broke: Longhorn could not pull images from Zot, Longhorn
degraded, Zot lost its PVC, and the entire cluster cascaded into `ImagePullBackOff`.
Recovery required scaling Kyverno to zero and restarting all affected pods. Kyverno was
subsequently removed from both `amiya.akn` and `lungmen.akn` pending a redesign tracked
in issue #1005.

***

## Event Summary

**Expected outcome:** Kyverno rewrites application image references to the local Zot
mirror at `oci.chezmoi.sh`, improving supply-chain security and reducing upstream
registry load. Storage and networking infrastructure namespaces operate normally.

**Actual outcome:** The `enforce-local-registry` policy applied equally to `longhorn-system`
pods. With `imagePullPolicy: Always`, every Longhorn pod restart attempted to pull
images through Zot. Zot's PVC is a Longhorn volume — so if Longhorn degrades, Zot
becomes unavailable, preventing Longhorn from recovering. Every other namespace then also
fails to pull, producing cluster-wide `ImagePullBackOff`.

**Impact:** Cluster-wide `ImagePullBackOff` on `amiya.akn`; all workloads that restarted
during the incident window were stuck. Downstream clusters depending on the shared Zot
instance were also affected indirectly.

**Duration:** \~1h (triggered immediately after cluster upgrades).

**First signal:** Alexandre observed Zot pods pending and Longhorn pods KO immediately
after cluster upgrades, connecting it to the previous day's Zot incident.

***

## Timeline

<!-- skew: ±5 min — timestamps inferred from pod restart ages at time of investigation; no authoritative log source available for the start of the incident -->

| Time (UTC)         | Actor                          | Event or Decision                                                                                                                                        |
| ------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-26 \~16:40 | Alexandre                      | Cluster upgrades performed on amiya.akn; pod restarts triggered across namespaces                                                                        |
| 2026-05-26 \~16:41 | \[system:kubernetes]           | Longhorn pods restarted; Kyverno mutates images with Zot prefix + `imagePullPolicy: Always`                                                              |
| 2026-05-26 \~16:41 | \[system:longhorn]             | Longhorn pods unable to pull from Zot; storage layer begins degrading                                                                                    |
| 2026-05-26 \~16:41 | \[system:zot]                  | Zot PVC unavailable (Longhorn degraded); all image pull requests fail                                                                                    |
| 2026-05-26 \~16:42 | \[system:kubernetes]           | Cascade: all namespaces with `imagePullPolicy: Always` pods enter `ImagePullBackOff`                                                                     |
| 2026-05-26 \~17:40 | Alexandre                      | Cluster-wide `ImagePullBackOff` confirmed; root cause identified via Zot/Longhorn pod states + knowledge of previous day's incident; Kyverno scaled to 0 |
| 2026-05-26 \~17:41 | \[anthropic:claude-sonnet-4-6] | Root cause confirmed by reading `enforce-local-registry` policy — `longhorn-system` absent from exclusion list                                           |
| 2026-05-26 \~17:48 | \[anthropic:claude-sonnet-4-6] | Fix committed: `longhorn-system` added to namespace exclusion list in MutatingPolicy                                                                     |
| 2026-05-26 \~17:48 | \[anthropic:claude-sonnet-4-6] | Fixed policy applied directly via `kubectl apply` (ArgoCD unavailable)                                                                                   |
| 2026-05-26 \~17:49 | \[anthropic:claude-sonnet-4-6] | Kyverno reinstalled via `helm template \| kubectl apply` to restore webhooks with fixed policy                                                           |
| 2026-05-26 \~17:51 | Alexandre                      | Decision: remove Kyverno entirely pending redesign in issue #1005                                                                                        |
| 2026-05-26 \~17:51 | \[anthropic:claude-sonnet-4-6] | Kyverno deployments deleted; webhooks removed; namespace left with completed jobs only                                                                   |
| 2026-05-26 \~17:55 | Alexandre                      | All workloads restarted; cluster restored                                                                                                                |

***

## What Went Well

* **Root cause identified immediately by operator.** Alexandre connected Zot pods pending
  and Longhorn pods KO to the circular dependency based on his knowledge of the infrastructure
  and the previous day's Zot disk-full incident. The policy file confirmed the hypothesis
  within minutes.
* **No data loss.** Longhorn volumes were degraded but not corrupted. All PVCs were intact
  after recovery.
* **The warning sign from the previous incident was documented.** The 2026-05-25 post-mortem
  explicitly noted the `system-cluster-critical` `priorityClassName` workaround used to
  escape the Kyverno policy during the Zot disk-full incident. In hindsight, the need for
  that workaround was a direct signal that the Kyverno policy had unsafe coverage.

***

## Root-Cause Analysis

### Technique: 5 Whys

1. **Why was `amiya.akn` cluster-wide in `ImagePullBackOff`?**
   → Pods could not pull images from Zot (`oci.chezmoi.sh`) because Zot was unavailable.

2. **Why was Zot unavailable?**
   → Zot's Longhorn PVC was inaccessible because Longhorn itself was degraded.

3. **Why was Longhorn degraded?**
   → Longhorn pods restarted during cluster upgrades and could not pull their own container
   images — because Kyverno had rewritten their image references to point to Zot with
   `imagePullPolicy: Always`.

4. **Why did Kyverno rewrite Longhorn images?**
   → The `enforce-local-registry` MutatingPolicy excluded `kube-system`, `kyverno-system`,
   `kube-public`, and `kube-node-lease`, but **did not exclude `longhorn-system`**. Longhorn
   pods matched the policy and were mutated on every CREATE/UPDATE.

5. **Why was `longhorn-system` not excluded?**
   → The policy was authored without mapping the dependency graph between the registry
   it routes traffic to (Zot) and the storage layer that registry depends on (Longhorn).
   The exclusion list was written from a "system namespaces" perspective, not a
   "what does Zot depend on" perspective.

### Root Cause

**The `enforce-local-registry` MutatingPolicy did not model the dependency chain between
the OCI mirror (Zot) and the storage backend (Longhorn).** Redirecting Longhorn's own
images through Zot created a hard circular dependency that collapsed the entire cluster
whenever Longhorn pods restarted (e.g. during cluster upgrades).

### Contributing Factors

* **The previous incident (2026-05-25) provided an implicit signal.** The `busybox` cleanup
  pod during the Zot disk-full incident required `system-cluster-critical` to bypass the
  Kyverno policy. That workaround indicated the policy's scope was too broad, but no
  follow-up action was taken to narrow it.
* **ArgoCD was unavailable during recovery.** This forced direct `kubectl apply` and
  `helm template` operations, complicating the recovery path and leaving the cluster
  in a non-GitOps state temporarily.

***

## Warning Signs Missed

| Signal                                                                             | When visible     | Why it wasn't acted on                                            |
| ---------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| `system-cluster-critical` bypass required during 2026-05-25 Zot disk-full incident | 2026-05-25       | Treated as a clever workaround, not a signal of policy over-reach |
| `longhorn-system` absent from exclusion list                                       | Policy authoring | Dependency graph (Zot → Longhorn) not considered                  |

***

## Control Analysis

### In Control (what we could have changed)

* Excluding `longhorn-system` (and any other namespace hosting storage/network
  infrastructure that the OCI mirror depends on) would have broken the circular dependency.
* A dependency graph review before deploying the policy would have surfaced the
  Zot → Longhorn → Zot cycle.

### Out of Control (external factors)

| External factor                             | What would reduce exposure                            |
| ------------------------------------------- | ----------------------------------------------------- |
| Pod restarts during normal cluster upgrades | Policy scoping must account for all dependency cycles |
| ArgoCD unavailability during recovery       | Emergency runbook for direct kubectl operations       |

***

## Systemic Lessons

* **Image-rewrite policies must model the full dependency graph of the registry they route
  to.** Any namespace whose workloads are required for the registry to operate (storage,
  CNI, DNS) must be excluded. "System namespaces" (`kube-system`, etc.) is not a sufficient
  exclusion list when the registry depends on application-tier infrastructure like Longhorn.

* **Warning signals from adjacent incidents should trigger policy review.** The
  `system-cluster-critical` workaround used during the 2026-05-25 incident was a direct
  indicator that the Kyverno policy's coverage was unsafe. A post-incident action item to
  review the exclusion list would have prevented this incident.

* **A replacement for Kyverno image rewriting must be designed before re-enabling.**
  Issue #1005 tracks the redesign. Until that work is complete, the cluster operates
  without the supply-chain enforcement that Kyverno provided — this is an accepted,
  time-bounded risk.

***

## Change Register

| # | Priority | Action                                                                                         | Owner     | Due Date   | Verification                                                                                    |
| - | -------- | ---------------------------------------------------------------------------------------------- | --------- | ---------- | ----------------------------------------------------------------------------------------------- |
| 1 | P0       | Kyverno removed from amiya.akn and lungmen.akn                                                 | Alexandre | Done       | No Kyverno pods or webhooks in kyverno-system                                                   |
| 2 | P0       | Kyverno sources removed from catalog and all project src trees                                 | Alexandre | Done       | `catalog/kubernetes/kyverno/`, `projects/*/src/infrastructure/kubernetes/kyverno/` deleted      |
| 3 | P1       | Design and implement replacement image policy (issue #1005) with correct dependency exclusions | Alexandre | TBD        | New policy excludes all storage/network namespaces; dependency graph reviewed before deployment |
| 4 | P2       | Audit all future admission policies for dependency cycles before deployment                    | Alexandre | 2026-06-15 | Checklist item in policy authoring process: map what the target registry depends on             |

***

## Verification Schedule

| Checkpoint     | Date       | What we'll check                                                    | Forum       |
| -------------- | ---------- | ------------------------------------------------------------------- | ----------- |
| 1-week review  | 2026-06-02 | Issue #1005 design started; no Kyverno remnants in cluster          | Solo review |
| 1-month review | 2026-06-26 | Issue #1005 implemented or scheduled; runbook exists; no recurrence | Solo review |
