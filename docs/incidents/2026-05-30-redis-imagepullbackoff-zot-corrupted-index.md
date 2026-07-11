---
title: "Redis ImagePullBackOff — Zot corrupted index.json + Docker Hub rate limiting"
date: 2026-05-30
author: "[anthropic:claude-sonnet-4-6]"
participants:
  - "Alexandre"
  - "[anthropic:claude-sonnet-4-6]"
severity: "High" # paperless down 7h; immich rolling update stalled; family-visible
status: "Open"
detection-method: "Manual discovery"
duration: "~8h (first Zot error 11:15 UTC → both pods Running ~19:20 UTC)"
services-affected:
  - "zot-registry (amiya.akn) — OCI mirror for all clusters"
  - "immich (lungmen.akn) — rolling update blocked; service unavailable"
  - "paperless-ngx (lungmen.akn) — redis pod in ImagePullBackOff; service unavailable"
users-affected: "Family — paperless-ngx unavailable ~7h; immich rolling update stalled (old pod stayed up)"
root-cause-family:
  - observability-gap
  - upstream-regression
error_signatures:
  - "invalid character '\\xc9' looking for beginning of value"
  - "unsupported repository layout version"
  - "rate limit exceeded [http 429]"
  - "ImagePullBackOff"
related-incidents:
  - path: "docs/incidents/2026-05-26-amiya-kyverno-zot-circular-imagepullbackoff.md"
    relation:
      "Suspected origin of the Zot index corruption — concurrent Zot writes during the Kyverno-induced cluster crash"
  - path: "docs/incidents/2026-05-25-zot-disk-full-imagepullbackoff.md"
    relation: "Same Zot index.json corruption failure mode (500 errors on a specific repo), distinct root trigger"
related-adrs: []
---

## Executive Summary

The Zot OCI registry on `amiya.akn` had a corrupted `index.json` for the `docker.io/library/redis` repository — of
unknown origin, present since at least 2026-05-26T21:04 UTC. The corruption went undetected until an ArgoCD sync updated
both `immich` and `paperless-ngx` to `redis:8.8.0-alpine`. Zot's on-demand sync attempted to repair the registry by
downloading the image from Docker Hub, but the corrupted index prevented the downloaded layers from being committed, and
the failed attempt exhausted the anonymous Docker Hub rate limit. With both the local store broken and upstream
unreachable, Zot returned HTTP 500 on every manifest request for `redis:8.8.0-alpine` for nearly seven hours. The issue
was resolved by manually reconstructing the Zot OCI storage for that repository.

---

## Event Summary

**Expected outcome:** ArgoCD sync updates `immich` and `paperless-ngx` to `redis:8.8.0-alpine`; Zot fetches the image on
demand from Docker Hub and serves it transparently to `lungmen.akn` nodes.

**Actual outcome:** Zot's `index.json` for `docker.io/library/redis` contained binary garbage (`\xc9\x17\x30\x4e…`).
Zot's first on-demand sync downloaded several image layers from Docker Hub but failed to commit them (the corrupted
index blocked writes). The wasted pulls consumed the anonymous rate-limit quota; every subsequent sync attempt was
rejected by Docker Hub with HTTP 429. Zot returned HTTP 500 on all manifest requests for the repository, causing both
`immich-redis` and `paperless-ngx-redis` pods to enter `ImagePullBackOff`.

**Impact:** `paperless-ngx` fully unavailable for \~7h; `immich` partially degraded (old redis pod kept running, new
deployment stalled for the same duration). No data loss.

**Duration:** `2026-05-30T11:15Z` (first Zot error) → `±? 2026-05-30T19:20Z` (both pods Running) — approximately **8h**.

**First signal:** `2026-05-30T11:15:13Z` — Zot log
`failed to unmarshal index.json for repo invalid character '\xc9' looking for beginning of value` (unobserved at the
time; no alert configured).

---

## Timeline

<!-- skew: Zot timestamps sourced from structured JSON logs (UTC, sub-second precision) — reliable.
     Investigation/fix timestamps are not reliably reconstructable; omitted below. -->

| Time (UTC)                      | Actor                                      | Event or Decision                                                                                                                           |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-30T11:13:09             | \[system:argocd]                           | ArgoCD sync updates `immich` and `paperless-ngx` to `redis:8.8.0-alpine@sha256:9156d3e4…`; new ReplicaSet `immich-redis-86c5b874b9` created |
| 2026-05-30T11:15:13             | \[system:zot]                              | First pull request hits Zot; `index.json` parsed: `invalid character '\xc9'` — scrub also fails with `repository not found`                 |
| 2026-05-30T11:15:35             | \[system:zot]                              | Zot returns HTTP 500 to requesting node; triggers on-demand sync from Docker Hub                                                            |
| 2026-05-30T11:15:36             | \[system:zot]                              | Sync partially succeeds: several layer blobs downloaded from Docker Hub (\~10–15 anonymous pulls consumed from rate-limit quota)            |
| 2026-05-30T11:16:05             | \[system:zot]                              | Sync fails to commit: `unsupported repository layout version` — corrupted index blocks writes; downloaded blobs wasted                      |
| 2026-05-30T11:19:26             | \[system:zot]                              | First Docker Hub HTTP 429: `rate limit exceeded` — anonymous quota exhausted by the failed first attempt                                    |
| 2026-05-30T11:19:26 → T11:36:32 | \[system:zot]                              | Repeated sync retries, all rejected with HTTP 429 (exponential backoff); auto-healing path permanently blocked                              |
| ±? 2026-05-30T18:00             | Alexandre                                  | Manually observes `ImagePullBackOff` on immich and paperless-ngx redis pods; begins investigation                                           |
| ±? 2026-05-30T18:05             | Alexandre / \[anthropic:claude-sonnet-4-6] | Zot logs examined; dual root cause identified: corrupted `index.json` + Docker Hub 429                                                      |
| ±? 2026-05-30T18:15             | \[anthropic:claude-sonnet-4-6]             | `index.json` replaced with valid empty OCI index JSON via debug busybox pod; Zot's 500 becomes 404                                          |
| ±? 2026-05-30T18:20             | \[anthropic:claude-sonnet-4-6]             | `crane copy` to push image directly to Zot attempted but fails — Zot has no user auth (anonymous read-only policy)                          |
| ±? 2026-05-30T18:30             | \[anthropic:claude-sonnet-4-6]             | All blobs downloaded from Docker Hub via authenticated token API (index manifest, amd64 manifest, config, 6 layers; \~37 MB) and injected   |
| ±? 2026-05-30T19:00             | \[anthropic:claude-sonnet-4-6]             | Correct `index.json` reconstructed with OCI Image Index structure; blob ownership fixed (`32460:32460`)                                     |
| ±? 2026-05-30T19:10             | Alexandre                                  | Zot verified: `GET /v2/docker.io/library/redis/tags/list` → HTTP 200; manifest by digest → HTTP 200                                         |
| ±? 2026-05-30T19:15             | Alexandre                                  | Failing pods deleted; both `immich-redis` and `paperless-ngx-redis-0` restart and reach `Running`                                           |

---

## What Went Well

- **Root cause was found quickly after manual investigation started** — structured Zot JSON logs provided exact
  timestamps and error messages with no ambiguity about what failed and when.
- **Manual blob injection procedure worked** — the OCI Image Layout format is well-specified; reconstructing the storage
  from Docker Hub blobs was straightforward once the approach was identified.
- **No data loss** — all affected services store state in separate PostgreSQL/volume PVCs; a redis restart causes no
  data loss.

---

## Root-Cause Analysis

**Technique:** Swiss Cheese **Why this technique:** Three independent defensive layers failed simultaneously (storage
integrity, on-demand sync, write idempotence). A 5 Whys would collapse them into a single chain and hide the multi-layer
nature.

### Analysis

Three independent defensive layers all had holes that aligned simultaneously:

#### Layer 1 — Zot storage integrity

The `index.json` for `docker.io/library/redis` was corrupted (binary content) since approximately 2026-05-26T21:04Z —
four days before the incident. Zot performs no integrity check on existing OCI repositories at startup or on a schedule.
The corruption was invisible until a pull request for a new image tag triggered a manifest lookup against the corrupted
file.

> _Hole_: no periodic or startup OCI index validation; corruption silently persists until exercised.

#### Layer 2 — On-demand sync auto-healing

When Zot can't serve an image locally, it triggers an on-demand sync from the upstream registry. This mechanism should
have repaired the missing manifest. However:

1. The first sync attempt downloaded several layers from Docker Hub (anonymous, no credentials configured).
2. When attempting to commit the downloaded content, Zot hit the corrupted index and failed.
3. The failed attempt consumed a significant fraction of the anonymous Docker Hub rate-limit quota.
4. All subsequent sync retries were rejected by Docker Hub with HTTP 429.

> _Hole_: Zot's `docker.io` sync registry has no `credentials:` configured. Anonymous Docker Hub pulls are rate-limited
> to \~100 per 6 hours per egress IP. A single failed sync attempt can exhaust the quota, permanently blocking the
> auto-healing path.

#### Layer 3 — Observability and alerting

The failure was visible in Zot logs from `2026-05-30T11:15:13Z`, and in pod events from shortly after. Neither triggered
an alert. The issue was discovered many hours later by manual inspection.

> _Hole_: no alert on repeated Zot HTTP 500 responses; no alert on pods in `ImagePullBackOff` for more than a few
> minutes.

### Root Causes

- **No OCI storage integrity validation in Zot** — Corrupted `index.json` files are not detected until a request
  exercises them. Without a periodic integrity scan, latent corruption can persist indefinitely until a new image tag
  triggers the affected repository.

- **Docker Hub sync configured without credentials** — The `docker.io` sync registry entry in Zot's Helm values has no
  `credentials:` field. Any unauthenticated pull against the rate limit makes auto-healing fragile: a single failed
  attempt can exhaust the quota and permanently block recovery for hours.

### Contributing Factors

- **Zot does not validate or roll back partial writes** — When a sync fails mid-commit, any partially overwritten state
  (including the index) is left in an inconsistent state with no rollback.

---

## Warning Signs Missed

| Signal                                                          | When visible                | Why it wasn't acted on                                                                |
| --------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| `redis` `index.json` corrupted (binary, 8 KB; mtime 2026-05-26) | Unknown — no integrity scan | No mechanism to detect corruption at rest; origin of write is also unknown            |
| Zot's `docker.io` sync has no credentials configured            | Pre-incident (config state) | Anonymous pull limit never previously exhausted on this cluster; risk not prioritized |
| Repeated Zot `invalid JSON` errors in structured logs           | 2026-05-30T11:15:13Z        | No alert configured on Zot error log patterns                                         |
| Pods in `ImagePullBackOff` for 7h                               | 2026-05-30T11:15Z           | No alert configured on sustained ImagePullBackOff                                     |

---

## Control Analysis

### In Control (what we could have changed)

- **Zot sync credentials** — Adding a Docker Hub `credentials:` field to the `docker.io` sync registry would give Zot
  authenticated pulls (5000/6h per account vs 100/6h anonymous), making the rate limit essentially impossible to hit
  under normal operation.
- **OCI index integrity scan** — A scan of all OCI repository `index.json` files for corruption would have detected the
  `redis` repo.
- **Alerting on `ImagePullBackOff`** — A Prometheus/AlertManager rule firing when a pod stays in `ImagePullBackOff`
  for >5 minutes would have cut MTTD to minutes.

### Out of Control (external factors)

| External factor                                    | What would reduce exposure?                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Docker Hub anonymous rate limits (100 pulls/6h/IP) | Add Docker Hub credentials to Zot sync config (in-control decision)                                   |
| Docker Hub becoming unavailable entirely           | Pre-cache all required images; Zot's sync-on-demand model inherently depends on upstream availability |

---

## Systemic Lessons

- **Credentials for upstream registries are a reliability requirement, not a convenience** — Relying on anonymous Docker
  Hub pulls means any high-pull-count event (new image tag rollout, failed sync retries) can exhaust the quota and block
  recovery. This is a systemic risk for every registry in Zot's sync config that has no credentials.

- **Defensive layers that share a single resource (rate-limit quota) are not independent** — The Swiss Cheese model
  assumes each defensive layer fails independently. Here, the on-demand sync (Layer 2) and storage write (Layer 1)
  shared the Docker Hub rate-limit quota: Layer 1's failure caused Layer 2 to consume the quota, which then also failed
  Layer 2 permanently. Systems with shared resource dependencies between defensive layers require explicit quota
  headroom analysis.

---

## From Lesson to Control

| Lesson                                                                                | Artifact type  | Linked artifact                                                                |
| ------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| Upstream credentials are a reliability requirement, not convenience                   | Config         | `projects/amiya.akn/src/apps/zot-registry/zot.helmvalues/` (Docker Hub creds)  |
| Defensive layers sharing a quota are not independent — Swiss Cheese assumption breaks | Knowledge file | `.agents/knowledge/zot.md`                                                     |
| Zot scrub fails silently when `index.json` is corrupted (`failed to run scrub`)       | Alert rule     | TBD — part of meta-pattern `observability-gap`                                 |
| `ImagePullBackOff` lasting > 5min must be an alert                                    | Alert rule     | TBD — same meta-pattern                                                        |
| Post-incident Zot recoveries need an OCI index integrity scan step                    | Runbook step   | `docs/procedures/` Zot emergency maintenance (referenced by the 2026-05-25 PM) |

---

## Change Register

- [ ] \[due:: 2026-06-06] \[priority:: high] \[size:: S] \[owner:: Alexandre] Add Docker Hub credentials to Zot sync
      config (`credentials:` field under `docker.io` registry in Helm values)
  - **Verification:** `docker.io` sync in Zot logs shows authenticated requests; controlled test pulls 50+ images
    without hitting 429
  - **If not done:** Next high-pull event (image tag rollout, sync retries) exhausts the 100/6h anonymous quota and
    blocks recovery

- [ ] \[due:: 2026-06-06] \[priority:: high] \[size:: M] \[owner:: Alexandre] Add log-based alert on Zot
      `failed to run scrub … repository not found` pattern
  - **Verification:** Controlled test: corrupt an `index.json` on a non-prod Zot, wait for next 24h scrub cycle, alert
    fires
  - **If not done:** Next index corruption goes undetected until a pull is attempted (potentially days)

- [ ] \[due:: 2026-06-06] \[priority:: medium] \[size:: S] \[owner:: Alexandre] Add Prometheus alert: pod in
      `ImagePullBackOff` for >5 minutes in any namespace
  - **Verification:** Controlled test: set an image to a nonexistent tag; alert fires within 5min
  - **If not done:** MTTD on next pull failure remains hours, not minutes

- [ ] \[due:: 2026-06-06] \[priority:: medium] \[size:: S] \[owner:: Alexandre] Add Prometheus alert: Zot HTTP 5xx
      rate > 0 for >2 minutes
  - **Verification:** Controlled test on non-prod Zot; alert fires when index.json corrupted
  - **If not done:** Server-side errors silent until downstream pods fail to pull

- [ ] \[due:: 2026-06-15] \[priority:: medium] \[size:: M] \[owner:: Alexandre] Write OCI integrity scan procedure
      (check valid JSON, non-empty manifests list across all repos)
  - **Verification:** Procedure documented in `docs/procedures/`; executed once on production Zot with results recorded
  - **If not done:** Hidden corruption can persist undetected for weeks

- [ ] \[due:: 2026-06-15] \[priority:: medium] \[size:: S] \[owner:: Alexandre] Add post-event checklist to Zot
      emergency runbook: scan all OCI repositories after any Zot crash, restart, or storage incident
  - **Verification:** Checklist item visible in `docs/procedures/`; rehearsed once on staging
  - **If not done:** Repeats discovery-by-failure pattern after every Zot event

- [ ] \[due:: 2026-06-15] \[priority:: low] \[size:: S] \[owner:: Alexandre] Investigate the origin of the `redis`
      `index.json` corruption (\~2026-05-26T21:04Z) — likely concurrent write during the Kyverno cluster crash
  - **Verification:** Finding documented either as an update to the Kyverno PM or as a new note; Zot timeline reconciled
  - **If not done:** Same write-corruption path may exist elsewhere; root condition unverified

---

## Resolution Tracker

### Done

- [x] Replaced corrupted `index.json` with valid empty OCI index → unblocked Zot from returning HTTP 500
- [x] Manually downloaded all required blobs from Docker Hub (index manifest, amd64 platform manifest, config, 6 layers;
      \~37 MB)
- [x] Injected blobs into Zot PVC storage at correct paths with correct ownership (`32460:32460`)
- [x] Reconstructed correct `index.json` with OCI Image Index structure referencing `sha256:9156d3e4…` (tagged
      `8.8.0-alpine`) and `sha256:5537c978…` (amd64 platform manifest)
- [x] Verified Zot serves the image with HTTP 200 (tag list + manifest by digest)
- [x] Deleted failing pods; both `immich-redis` and `paperless-ngx-redis-0` returned to `Running`

### Pending — Docker Hub credentials + scrub alerting (P1)

- [ ] Add `credentials:` to Zot `docker.io` sync registry config — no GitHub issue yet
- [ ] Add log-based alert on `failed to run scrub` pattern in Zot logs — no GitHub issue yet

### Pending — Alerting (P1)

- [ ] `ImagePullBackOff` alert — no GitHub issue yet
- [ ] Zot HTTP 5xx alert — no GitHub issue yet

### Pending — Procedures and investigation (P2)

- [ ] OCI integrity scan procedure — no GitHub issue yet
- [ ] Post-disk-event checklist update — no GitHub issue yet
- [ ] Origin investigation for `redis` index corruption — no GitHub issue yet

---

## Agent Knowledge

- Zot `index.json` corruption is a recurring failure mode on this homelab — happened with `actualbudget/actual-server`
  (2026-05-25 disk-full) and `docker.io/library/redis` (2026-05-30, \~7h outage). Recovery requires manual
  reconstruction or directory deletion + re-sync.
- Zot `scrub` (24h interval) **does not detect** corrupted `index.json` — it logs
  `failed to run scrub … repository not found` and moves on silently. The scrub log pattern is the only signal of
  corrupted state.
- Docker Hub anonymous rate limit: **100 pulls / 6h / IP**. A high-pull event (e.g., Zot retrying failed syncs of a
  popular image) can exhaust the quota and block all subsequent pulls — even authenticated ones from the same IP wait
  for the quota window to reset.
- Defensive layers that share a quota (e.g., on-demand sync + storage write both consuming Docker Hub pulls) **violate
  the Swiss Cheese independence assumption**. Quota-sharing dependencies must be modeled explicitly when designing
  fallback paths.
- Manual Zot repo reconstruction: download blobs (`docker pull` + `crane export`), inject into the PVC at
  `/var/lib/registry/<repo>/blobs/sha256/` with ownership `32460:32460`, then write a valid `index.json` referencing the
  new manifest digests.

---

## Verification Schedule

| Checkpoint     | Date       | What we'll check                                                                                                | Forum           |
| -------------- | ---------- | --------------------------------------------------------------------------------------------------------------- | --------------- |
| 1-week review  | 2026-06-06 | P1 items complete (Docker Hub credentials merged, alerts firing in test); no new ImagePullBackOff               | Personal review |
| 1-month review | 2026-06-30 | P2 items complete (scan procedure, checklist, investigation); Zot logs show authenticated Docker Hub pulls      | Personal review |
| 3-month review | 2026-08-30 | No recurrence of Zot `index.json`-class incident; alert history confirms MTTD <5min on any new ImagePullBackOff | Personal review |
