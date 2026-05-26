---
title: "Zot registry disk saturation — widespread ImagePullBackOff on lungmen.akn"
date: 2026-05-25
author: "[anthropic:claude-sonnet-4-6]"
participants:
  - "Alexandre"
  - "[anthropic:claude-sonnet-4-6]"
severity: "High"
status: "Final"
detection-method: "Manual discovery"
mttd: "~2h (disk full since ~16:28 UTC; reported ~18:30 UTC)"
mttr: "~3h20m (from first report to actual-budget fully Running at ~21:50 UTC)"
services-affected:
  - "zot-registry (amiya.akn) — OCI mirror/proxy for all clusters"
  - "all workloads on lungmen.akn — ImagePullBackOff cluster-wide"
  - "actual-budget (lungmen.akn) — additional 2h outage due to index corruption"
users-affected: "All services on lungmen.akn unavailable for the duration"
related-incidents:
  - "docs/incidents/2026-05-25-lungmen-clustersecretstore-vault-auth-failure.md"
related-adrs: []
---

# Post-Mortem: Zot registry disk saturation — widespread ImagePullBackOff on lungmen.akn

## Executive Summary

The Zot OCI registry on `amiya.akn` ran out of disk space on its 50 Gi PVC, causing it to
return 404 errors for all image sync requests. Every workload on `lungmen.akn` entered
`ImagePullBackOff` as a result. The immediate fix — resizing the PVC from 50 Gi to 100 Gi —
restored most workloads, but `actual-budget` remained broken: a write interrupted mid-way by
the full disk had left a corrupted `index.json` (null bytes) in the `actualbudget/actual-server`
repository, causing Zot to return 500 on every manifest request for that image. The corruption
was resolved by scaling down Zot, deleting the corrupted directory, and restarting. No data
loss occurred. The two failures were caused by a single root condition: no capacity monitoring
or alerting on the Zot PVC.

***

## Event Summary

**Expected outcome:** All workloads on `lungmen.akn` pull container images on demand via the
Zot proxy at `oci.chezmoi.sh`, which syncs images from upstream registries transparently.

**Actual outcome:** Zot's PVC reached 99.6% capacity (52.31 Gi used / 52.52 Gi total on a
50 Gi volume). New image sync attempts failed with `no space left on device`. Zot returned
404 for all uncached images and 500 for the `ghcr.io/actualbudget/actual-server` repository,
whose `index.json` was corrupted by an incomplete write at disk saturation.

**Impact:** Cluster-wide `ImagePullBackOff` on `lungmen.akn`; all pod starts relying on
uncached images blocked. `actual-budget` remained down for an additional \~2 hours after the
general fix.

**Duration:** Disk saturation confirmed in Zot logs at `2026-05-25T16:28 UTC`; fully resolved
at `~2026-05-25T21:50 UTC` (total incident window ≥ 5h20m).

**First signal:** Zot log entry: `"no space left on device"` at `2026-05-25T16:28:24 UTC`
(discovered retrospectively). User-reported detection: `~2026-05-25T18:30 UTC`.

***

## Timeline

<!-- skew: ±5 min — approximate timestamps for manual actions; exact timestamps for system events sourced from Zot logs -->

| Time (UTC)         | Actor                          | Event or Decision                                                                                                                 |
| ------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-25 16:28   | \[system:zot]                  | First `no space left on device` error logged during `csi-resizer` layer sync                                                      |
| 2026-05-25 \~18:30 | Alexandre                      | Cluster-wide `ImagePullBackOff` on `lungmen.akn` discovered; investigation started                                                |
| 2026-05-25 \~18:37 | \[anthropic:claude-sonnet-4-6] | Zot logs checked; `no space left on device` identified as root cause                                                              |
| 2026-05-25 \~18:38 | \[anthropic:claude-sonnet-4-6] | `talosctl mounts` confirms PVC at 99.6% (0.21 Gi free)                                                                            |
| 2026-05-25 \~18:39 | \[anthropic:claude-sonnet-4-6] | PVC patched live: 50 Gi → 100 Gi (`kubectl patch pvc`)                                                                            |
| 2026-05-25 \~18:40 | \[system:longhorn]             | Volume resized and filesystem expanded; free space 0.21 Gi → 53 Gi (49.65% used)                                                  |
| 2026-05-25 \~18:40 | Alexandre                      | Decision: also update PVC size in code (`zot.helmvalues/default.yaml`)                                                            |
| 2026-05-25 19:37   | \[system:zot]                  | `actual-server:26.5.0` sync starts; write interrupted by full disk; `index.json` partially overwritten with null bytes            |
| 2026-05-25 19:37   | \[system:zot]                  | Subsequent manifest requests for `actual-server` return 500 (`invalid JSON` / `unsupported repository layout version`)            |
| 2026-05-25 \~20:18 | \[system:kubernetes]           | `actual-budget-0` pod restarted and enters `ImagePullBackOff` (estimate from pod age at time of check)                            |
| 2026-05-25 \~21:20 | Alexandre                      | `actual-budget` still in `ImagePullBackOff`; second investigation started                                                         |
| 2026-05-25 \~21:21 | \[anthropic:claude-sonnet-4-6] | 500 error on `actual-server` manifest identified; Zot logs show corrupted `index.json` (null bytes)                               |
| 2026-05-25 \~21:22 | \[anthropic:claude-sonnet-4-6] | First scale-down attempt; ArgoCD (selfHeal=true) immediately restores Zot pod                                                     |
| 2026-05-25 \~21:24 | \[anthropic:claude-sonnet-4-6] | ArgoCD `selfHeal` disabled on `zot-registry` app                                                                                  |
| 2026-05-25 \~21:41 | \[anthropic:claude-sonnet-4-6] | Zot scaled to 0, pod confirmed deleted; cleanup pod created with `system-cluster-critical` to bypass Kyverno image rewrite policy |
| 2026-05-25 \~21:43 | \[anthropic:claude-sonnet-4-6] | Cleanup pod completes: `ghcr.io/actualbudget/actual-server` directory deleted from PVC                                            |
| 2026-05-25 \~21:44 | \[anthropic:claude-sonnet-4-6] | Zot scaled back to 1; pod Ready                                                                                                   |
| 2026-05-25 \~21:44 | \[anthropic:claude-sonnet-4-6] | ArgoCD `selfHeal` re-enabled                                                                                                      |
| 2026-05-25 \~21:45 | \[anthropic:claude-sonnet-4-6] | `HEAD /v2/ghcr.io/actualbudget/actual-server/manifests/26.5.0` returns 200; Zot re-synced from ghcr.io                            |
| 2026-05-25 \~21:50 | \[system:kubernetes]           | `actual-budget-0` Running 1/1                                                                                                     |

***

## What Went Well

* **Zot logs are structured JSON and immediately readable.** Root cause was identified within
  5 minutes of starting the investigation — a single grep surfaced `no space left on device`.
* **Longhorn supports live online resize.** The PVC was expanded from 50 Gi to 100 Gi
  with no pod restart and no service interruption to other clusters.
* **Kyverno policy had a documented escape hatch.** The `system-cluster-critical`
  `priorityClassName` exclusion allowed the emergency cleanup pod to pull `busybox` directly
  from Docker Hub while the Zot registry was offline — no special credentials or policy edits
  required.
* **ArgoCD selfHeal was understood and disabled safely.** The first scale-down attempt was
  reverted by ArgoCD within seconds, but the mechanism was quickly identified and patched
  before proceeding.

***

## Root-Cause Analysis

### Technique: 5 Whys

1. **Why were lungmen workloads in `ImagePullBackOff`?**
   → Zot returned 404 (most images) and 500 (`actual-server`) for manifest requests.

2. **Why did Zot return 404/500?**
   → The PVC was at 99.6% capacity. New sync writes failed with `no space left on device`,
   preventing Zot from caching images. A prior partial write had also corrupted the
   `actual-server` repository index.

3. **Why was the PVC full?**
   → Zot proxy-caches every image requested from all configured upstream registries
   (docker.io, ghcr.io, gcr.io, registry.k8s.io, …). The cumulative cache grew to 52.31 Gi
   over \~165 days, hitting the 50 Gi limit.

4. **Why wasn't the cache kept under control?**
   → The GC interval is 168 h (weekly) and no explicit size-based eviction is configured.
   Retention policies exist for untagged/old images but were not aggressive enough to keep
   total usage below the PVC limit.

5. **Why wasn't the approaching limit caught before saturation?**
   → **No alert exists for Zot PVC usage.** There is no Prometheus rule, no Longhorn alert,
   and no periodic review of storage capacity for this PVC.

### Root Causes

* **No PVC capacity monitoring for the Zot registry** — there is no alert or automated signal
  that fires when the Zot PVC approaches its limit. Without a signal, saturation is discovered
  only when failures cascade to dependent clusters. This is the structural condition that makes
  this class of incident probable.

### Contributing Factors

* **GC interval too infrequent (168 h)** — weekly GC allows the cache to accumulate for up to
  a week before cleanup runs. A shorter interval would reduce headroom consumption between
  cycles, but does not address the absence of a capacity alert.
* **50 Gi PVC undersized** for the number and size of images being mirrored across all
  `lungmen.akn` workloads — provided less buffer time between fills.
* **Disk-full write corruption created a secondary failure** — a partial write left null bytes
  in `index.json`, producing a different and less-obvious error (500 instead of 404), which
  extended the `actual-budget` outage by \~2 h after the primary fix.
* **ArgoCD `selfHeal` delayed the remediation** — the first scale-down attempt was immediately
  reverted, adding \~20 minutes to the resolution path.

***

## Warning Signs Missed

| Signal                                              | When visible                              | Why it wasn't acted on                                   |
| --------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| PVC at 99.6% (52.31 Gi / 52.52 Gi)                  | Continuously, day prior                   | No alert; no one checking PVC utilization                |
| `no space left on device` in Zot logs               | 2026-05-25T16:28 UTC (\~2h before report) | No log-based alert; logs only checked on incident        |
| Zot log: `Copy layer` operations running constantly | Days prior                                | Normal-looking sync traffic; no throughput/size alerting |

***

## Control Analysis

### In Control (what we could have changed)

* Adding a Prometheus/Alertmanager rule on Longhorn PVC usage at 80% would have given \~10 Gi
  of warning headroom before saturation.
* Reducing `gcInterval` from 168 h to 24 h would reduce the window during which obsolete
  layers accumulate.
* A size-based retention policy (max total repo size or max total registry size) would bound
  unbounded cache growth.

### Out of Control (external factors)

| External factor                                                 | What would reduce exposure                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Upstream images grow in size over time (OCI index inflation)    | Monitor total registry size and alert before saturation; size-based retention |
| Upstream registries require on-demand sync (can't pre-populate) | Pre-warm critical images (e.g., `actual-server`) via scheduled sync jobs      |

***

## Systemic Lessons

* **Storage capacity for shared infrastructure has no owner and no monitoring.** The Zot PVC
  is a dependency for every cluster. Its capacity is not tracked anywhere. This is the same
  structural gap that produces "suddenly full disk" incidents across infrastructure: nobody's
  job to watch, so nobody watches. Every shared PVC that is a cluster dependency should have
  a utilization alert.

* **A disk-full event during a write produces corruption, not just failure.** The 500 error on
  `actual-server` was a distinct, harder-to-diagnose failure mode from the 404s. When a write
  fails mid-way, the store is left in an inconsistent state that outlasts the original trigger.
  Cleanup of partial writes should be part of any disk-full recovery runbook.

* **ArgoCD `selfHeal` on infrastructure components complicates emergency operations.** Scaling
  down a registry for maintenance while ArgoCD immediately restores it is a real friction point.
  For infrastructure components that require manual intervention (registry, secret store),
  consider documenting the suspend/unsuspend sequence in a runbook rather than discovering it
  under pressure.

***

## Change Register

| # | Priority | Action                                                                                           | Owner     | Due Date   | Verification                                                                                  |
| - | -------- | ------------------------------------------------------------------------------------------------ | --------- | ---------- | --------------------------------------------------------------------------------------------- |
| 1 | P1       | Reduce Zot `gcInterval` from 168 h to 24 h in `zot.helmvalues/default.yaml`                      | Alexandre | 2026-06-01 | Config present in Helm values; ArgoCD synced; Zot logs show GC run within 24 h of change      |
| 4 | P2       | Add a size-based retention policy in Zot config (`storage.retention` max total size or per-repo) | Alexandre | 2026-06-15 | Policy visible in configmap; `zot-0` logs confirm retention runs after GC                     |
| 5 | P2       | Write emergency maintenance runbook for Zot: scale down, ArgoCD suspend, cleanup, scale up       | Alexandre | 2026-06-15 | Runbook exists in `docs/procedures/`; covers the Kyverno bypass via `system-cluster-critical` |

***

## Verification Schedule

| Checkpoint     | Date       | What we'll check                                                                   | Forum       |
| -------------- | ---------- | ---------------------------------------------------------------------------------- | ----------- |
| 1-week review  | 2026-06-01 | P1 items complete; gcInterval updated and GC running                               | Solo review |
| 1-month review | 2026-06-25 | P1 items complete; Zot PVC usage stable below 70% with daily GC; no recurrence     | Solo review |
| 3-month review | 2026-08-25 | No disk-saturation incident on any shared infrastructure PVC; alert coverage audit | Solo review |
