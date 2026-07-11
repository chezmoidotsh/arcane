---
title: "Kyverno image-rewrite policy → Zot/Longhorn circular dependency — cluster-wide ImagePullBackOff on amiya.akn"
date: 2026-05-26
author: "[anthropic:claude-sonnet-4-6]"
participants:
  - "Alexandre"
  - "[anthropic:claude-sonnet-4-6]"
severity: "Critical" # platform cluster down; all downstream clusters indirectly affected
status: "Open"
detection-method: "Manual discovery (post-upgrade monitoring)"
duration: "~1h (triggered immediately after cluster upgrades)"
services-affected:
  - "All workloads on amiya.akn — ImagePullBackOff cluster-wide"
  - "longhorn-system — storage layer degraded"
  - "zot-registry (amiya.akn) — OCI mirror unavailable"
  - "Downstream clusters (lungmen.akn) — indirect impact via shared Zot instance"
users-affected: "Family — every cluster lost access to OpenBao, Pocket-Id, Zot during the platform outage"
root-cause-family:
  - dependency-cycle
  - policy-scope-too-broad
related-incidents:
  - path: "docs/incidents/2026-05-25-zot-disk-full-imagepullbackoff.md"
    relation:
      "The `system-cluster-critical` Kyverno bypass discovered there was the unheeded warning sign for this incident"
related-adrs: []
related-issues:
  - "https://github.com/chezmoidotsh/arcane/issues/1005"
---

# Post-Mortem: Kyverno image-rewrite policy → Zot/Longhorn circular dependency — cluster-wide ImagePullBackOff on amiya.akn

## Executive Summary

The Kyverno `enforce-local-registry` `MutatingPolicy` was configured to redirect every container image to the local Zot
OCI mirror (`oci.chezmoi.sh`) and set `imagePullPolicy: Always`. The policy excluded `kube-system`, `kyverno-system`,
`kube-public`, and `kube-node-lease`, but **not `longhorn-system`**. This created a circular dependency: Longhorn pods
needed to pull images from Zot, while Zot's storage PVC was backed by Longhorn. When the cluster upgrades triggered pod
restarts in `longhorn-system`, the chain broke: Longhorn could not pull images from Zot, Longhorn degraded, Zot lost its
PVC, and the entire cluster cascaded into `ImagePullBackOff`. Recovery required scaling Kyverno to zero and restarting
all affected pods. Kyverno was subsequently removed from both `amiya.akn` and `lungmen.akn` pending a redesign tracked
in issue #1005.

---

## Event Summary

**Expected outcome:** Kyverno rewrites application image references to the local Zot mirror at `oci.chezmoi.sh`,
improving supply-chain security and reducing upstream registry load. Storage and networking infrastructure namespaces
operate normally.

**Actual outcome:** The `enforce-local-registry` policy applied equally to `longhorn-system` pods. With
`imagePullPolicy: Always`, every Longhorn pod restart attempted to pull images through Zot. Zot's PVC is a Longhorn
volume — so if Longhorn degrades, Zot becomes unavailable, preventing Longhorn from recovering. Every other namespace
then also fails to pull, producing cluster-wide `ImagePullBackOff`.

**Impact:** Cluster-wide `ImagePullBackOff` on `amiya.akn`; all workloads that restarted during the incident window were
stuck. Downstream clusters depending on the shared Zot instance were also affected indirectly.

**Duration:** \~1h (triggered immediately after cluster upgrades).

**First signal:** Alexandre observed Zot pods pending and Longhorn pods KO immediately after cluster upgrades,
connecting it to the previous day's Zot incident.

---

## Timeline

<!-- skew: ±? — timestamps inferred from pod restart ages at time of investigation (~7h old at 17:41 UTC); no authoritative log source for incident start; recovery actions ±5m from shell history -->

| Time (UTC)           | Actor                          | Event or Decision                                                                                                                                        |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ±5m 2026-05-26T16:40 | Alexandre                      | Cluster upgrades performed on amiya.akn; pod restarts triggered across namespaces                                                                        |
| ±5m 2026-05-26T16:41 | \[system:kubernetes]           | Longhorn pods restarted; Kyverno mutates images with Zot prefix + `imagePullPolicy: Always`                                                              |
| ±5m 2026-05-26T16:41 | \[system:longhorn]             | Longhorn pods unable to pull from Zot; storage layer begins degrading                                                                                    |
| ±5m 2026-05-26T16:41 | \[system:zot]                  | Zot PVC unavailable (Longhorn degraded); all image pull requests fail                                                                                    |
| ±5m 2026-05-26T16:42 | \[system:kubernetes]           | Cascade: all namespaces with `imagePullPolicy: Always` pods enter `ImagePullBackOff`                                                                     |
| ±? 2026-05-26T17:40  | Alexandre                      | Cluster-wide `ImagePullBackOff` confirmed; root cause identified via Zot/Longhorn pod states + knowledge of previous day's incident; Kyverno scaled to 0 |
| ±5m 2026-05-26T17:41 | \[anthropic:claude-sonnet-4-6] | Root cause confirmed by reading `enforce-local-registry` policy — `longhorn-system` absent from exclusion list                                           |
| ±5m 2026-05-26T17:48 | \[anthropic:claude-sonnet-4-6] | Fix committed: `longhorn-system` added to namespace exclusion list in MutatingPolicy                                                                     |
| ±5m 2026-05-26T17:48 | \[anthropic:claude-sonnet-4-6] | Fixed policy applied directly via `kubectl apply` (ArgoCD unavailable)                                                                                   |
| ±5m 2026-05-26T17:49 | \[anthropic:claude-sonnet-4-6] | Kyverno reinstalled via `helm template \| kubectl apply` to restore webhooks with fixed policy                                                           |
| ±5m 2026-05-26T17:51 | Alexandre                      | Decision: remove Kyverno entirely pending redesign in issue #1005                                                                                        |
| ±5m 2026-05-26T17:51 | \[anthropic:claude-sonnet-4-6] | Kyverno deployments deleted; webhooks removed; namespace left with completed jobs only                                                                   |
| ±5m 2026-05-26T17:55 | Alexandre                      | All workloads restarted; cluster restored                                                                                                                |

---

## What Went Well

- **Root cause identified immediately by operator.** Alexandre connected Zot pods pending and Longhorn pods KO to the
  circular dependency based on his knowledge of the infrastructure and the previous day's Zot disk-full incident. The
  policy file confirmed the hypothesis within minutes.
- **No data loss.** Longhorn volumes were degraded but not corrupted. All PVCs were intact after recovery.
- **The warning sign from the previous incident was documented.** The 2026-05-25 post-mortem explicitly noted the
  `system-cluster-critical` `priorityClassName` workaround used to escape the Kyverno policy during the Zot disk-full
  incident. In hindsight, the need for that workaround was a direct signal that the Kyverno policy had unsafe coverage.

---

## Root-Cause Analysis

**Technique:** 5 Whys **Why this technique:** Single causal chain — admission policy redirected storage-layer images
through a registry that depends on that same storage. Linear, no branching.

### Analysis

1. **Why was `amiya.akn` cluster-wide in `ImagePullBackOff`?** → Pods could not pull images from Zot (`oci.chezmoi.sh`)
   because Zot was unavailable.

2. **Why was Zot unavailable?** → Zot's Longhorn PVC was inaccessible because Longhorn itself was degraded.

3. **Why was Longhorn degraded?** → Longhorn pods restarted during cluster upgrades and could not pull their own
   container images — because Kyverno had rewritten their image references to point to Zot with
   `imagePullPolicy: Always`.

4. **Why did Kyverno rewrite Longhorn images?** → The `enforce-local-registry` MutatingPolicy excluded `kube-system`,
   `kyverno-system`, `kube-public`, and `kube-node-lease`, but **did not exclude `longhorn-system`**. Longhorn pods
   matched the policy and were mutated on every CREATE/UPDATE.

5. **Why was `longhorn-system` not excluded?** → The policy was authored without mapping the dependency graph between
   the registry it routes traffic to (Zot) and the storage layer that registry depends on (Longhorn). The exclusion list
   was written from a "system namespaces" perspective, not a "what does Zot depend on" perspective.

### Root Cause

**The `enforce-local-registry` MutatingPolicy did not model the dependency chain between the OCI mirror (Zot) and the
storage backend (Longhorn).** Redirecting Longhorn's own images through Zot created a hard circular dependency that
collapsed the entire cluster whenever Longhorn pods restarted (e.g. during cluster upgrades).

### Contributing Factors

- **The previous incident (2026-05-25) provided an implicit signal.** The `busybox` cleanup pod during the Zot disk-full
  incident required `system-cluster-critical` to bypass the Kyverno policy. That workaround indicated the policy's scope
  was too broad, but no follow-up action was taken to narrow it.
- **ArgoCD was unavailable during recovery.** This forced direct `kubectl apply` and `helm template` operations,
  complicating the recovery path and leaving the cluster in a non-GitOps state temporarily.

---

## Warning Signs Missed

| Signal                                                                             | When visible     | Why it wasn't acted on                                            |
| ---------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| `system-cluster-critical` bypass required during 2026-05-25 Zot disk-full incident | 2026-05-25       | Treated as a clever workaround, not a signal of policy over-reach |
| `longhorn-system` absent from exclusion list                                       | Policy authoring | Dependency graph (Zot → Longhorn) not considered                  |

---

## Control Analysis

### In Control (what we could have changed)

- Excluding `longhorn-system` (and any other namespace hosting storage/network infrastructure that the OCI mirror
  depends on) would have broken the circular dependency.
- A dependency graph review before deploying the policy would have surfaced the Zot → Longhorn → Zot cycle.

### Out of Control (external factors)

| External factor                             | What would reduce exposure                            |
| ------------------------------------------- | ----------------------------------------------------- |
| Pod restarts during normal cluster upgrades | Policy scoping must account for all dependency cycles |
| ArgoCD unavailability during recovery       | Emergency runbook for direct kubectl operations       |

---

## Systemic Lessons

- **Image-rewrite policies must model the full dependency graph of the registry they route to.** Any namespace whose
  workloads are required for the registry to operate (storage, CNI, DNS) must be excluded. "System namespaces"
  (`kube-system`, etc.) is not a sufficient exclusion list when the registry depends on application-tier infrastructure
  like Longhorn.

- **Warning signals from adjacent incidents should trigger policy review.** The `system-cluster-critical` workaround
  used during the 2026-05-25 incident was a direct indicator that the Kyverno policy's coverage was unsafe. A
  post-incident action item to review the exclusion list would have prevented this incident.

- **A replacement for Kyverno image rewriting must be designed before re-enabling.** Issue #1005 tracks the redesign.
  Until that work is complete, the cluster operates without the supply-chain enforcement that Kyverno provided — this is
  an accepted, time-bounded risk.

---

## From Lesson to Control

| Lesson                                                                              | Artifact type  | Linked artifact                                                                |
| ----------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| Image-rewrite policies must model the full dependency graph of the target registry  | OPA rule / ADR | `catalog/opa/rules/` validation for any policy redirecting to `oci.chezmoi.sh` |
| Warning signals from adjacent incidents must trigger policy review                  | Process step   | This very PM cross-references the prior workaround — propagated via INDEX.md   |
| Kyverno replacement must precede re-enabling supply-chain enforcement               | ADR + issue    | [issue #1005](https://github.com/chezmoidotsh/arcane/issues/1005) + ADR-TBD    |
| ArgoCD self-heal complicates emergency recovery — needs documented suspend sequence | Runbook step   | `docs/procedures/` ArgoCD emergency suspend (to write — shared with Zot PM)    |

---

## Change Register

- [x] \[due:: 2026-05-26] \[priority:: high] \[size:: S] \[owner:: Alexandre] Remove Kyverno from amiya.akn and
      lungmen.akn (live cluster)
  - **Verification:** `kubectl get pods,validatingwebhookconfigurations,mutatingwebhookconfigurations -n kyverno-system`
    returns nothing on both clusters
  - **If not done:** Cluster collapse repeats on next upgrade

- [x] \[due:: 2026-05-26] \[priority:: high] \[size:: S] \[owner:: Alexandre] Remove Kyverno sources from catalog and
      all project src trees
  - **Verification:** `find . -path '*/kyverno*' -type d` returns no policy directories
  - **If not done:** ArgoCD re-installs Kyverno on next sync

- [ ] \[due:: 2026-07-15] \[priority:: high] \[size:: L] \[owner:: Alexandre] Design and implement replacement image
      policy (issue #1005) with correct dependency exclusions — must include `longhorn-system`, CNI namespaces, DNS, and
      any other namespace whose workloads the OCI mirror depends on
  - **Verification:** New policy deployed; controlled test: kill a Longhorn pod — it pulls and recovers within normal
    restart window
  - **If not done:** Cluster operates without supply-chain enforcement indefinitely (accepted but unbounded risk)

- [ ] \[due:: 2026-06-15] \[priority:: medium] \[size:: S] \[owner:: Alexandre] Add a dependency-cycle audit checklist
      to the policy authoring process: "What does the registry/admission target depend on? Are those namespaces
      excluded?"
  - **Verification:** Checklist visible alongside future policy PRs; reviewed at least once on a real policy change
  - **If not done:** Same class of cycle possible on the next admission/mutation policy

---

## Agent Knowledge

- Kyverno `MutatingPolicy` with `imagePullPolicy: Always` redirection: forces fresh pulls on every pod restart. If
  applied to the namespace hosting the registry's storage backend (e.g. `longhorn-system`), creates a hard circular
  dependency. Any policy that rewrites images for the cluster's OCI mirror **must** exclude every namespace the mirror
  transitively depends on.
- The "system namespaces" exclusion (`kube-system`, `kube-public`, `kube-node-lease`) is **insufficient** in this
  homelab — application-tier infrastructure (Longhorn, Cilium operator namespace, etc.) is on the registry's critical
  path too.
- Recovery from cluster-wide `ImagePullBackOff` when ArgoCD is also down: `helm template` + `kubectl apply` directly,
  then re-enable ArgoCD sync afterward.

---

## Verification Schedule

| Checkpoint | Date       | Observable                                                                            | Forum       |
| ---------- | ---------- | ------------------------------------------------------------------------------------- | ----------- |
| 1-week     | 2026-06-02 | No Kyverno remnants; issue #1005 design discussion started                            | Solo review |
| 1-month    | 2026-06-26 | Dependency-cycle checklist live; #1005 implementation scheduled or progressing        | Solo review |
| 3-month    | 2026-08-26 | New policy deployed and validated with controlled Longhorn pod restart; no recurrence | Solo review |
