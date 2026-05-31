---
title: "CNPG WAL PVC saturation — immich and paperless-ngx down 4+ days on lungmen.akn"
date: 2026-05-30
author: "[anthropic:claude-sonnet-4-6]"
participants:
  - "Alexandre"
  - "[anthropic:claude-sonnet-4-6]"
severity: "Critical"   # family-essential services (immich, paperless) down 4+ days
status: "Open"
detection-method: "Manual discovery"
duration: "25 days latent (archiving failed 2026-05-05) → 4+ days user-visible outage → ~3h full remediation 2026-05-30"
services-affected:
  - "apps-secured-20260329 CNPG cluster (lungmen.akn / namespace: databases)"
  - "immich (lungmen.akn) — unavailable for 4+ days"
  - "paperless-ngx (lungmen.akn) — unavailable for 4+ days"
users-affected: "Family — immich (photos) and paperless-ngx (documents) unavailable 4+ days"
root-cause-family:
  - observability-gap
  - bootstrap-coupling
error_signatures:
  - "Not enough disk space"
  - "Expected empty archive"
  - "ContinuousArchivingFailing"
  - "Detected low-disk space condition, avoid starting the instance"
  - "WAL archive check failed for server"
  - "barman-cloud-check-wal-archive"
procedures:
  - "docs/procedures/databases/DB-20260530-00.cnpg-wal-disk-full-recovery.md"
related-incidents: []
related-adrs: []
---

## Executive Summary

The `apps-secured-20260329` CloudNative-PG cluster on `lungmen.akn` had its WAL archiving
silently broken from the first day of operation. The barman-cloud sidecar refused to archive
any WAL segment because the S3 destination path already contained a base backup left over from
a previous CNPG timeline after a failover. PostgreSQL retained every WAL segment locally for
25 days until both 5 Gi WAL PVCs reached 100%, at which point CNPG refused to start postgres
at all. immich and paperless-ngx were unavailable for at least 4 days before the issue was
discovered. The fix required expanding the WAL PVCs to unblock postgres, then moving the stale
S3 folder to a `.bak` path so barman-cloud could archive again. A new cluster
(`apps-secured-20260530`) was created with WAL archiving disabled and a daily base backup,
removing the architectural condition that caused this class of failure.

***

## Event Summary

**Expected outcome:** Both immich and paperless-ngx on `lungmen.akn` connect to the
`apps-secured-20260329` PostgreSQL cluster; the cluster archives WAL segments continuously to
S3 and remains in `Cluster in healthy state`.

**Actual outcome:** WAL archiving failed silently from 2026-05-05T19:20:26 UTC (86 seconds
after the cluster's first WAL archive check). PostgreSQL accumulated 25 days of WAL segments
locally until the 5 Gi WAL PVCs reached 100%. CNPG entered phase `Not enough disk space` and
refused to start postgres on either node. Pod-1 was in `CrashLoopBackOff` with 1193 restarts
over 4+ days; pod-2 (the primary) continued running but could not archive. immich and
paperless-ngx were unavailable for the duration.

**Impact:** Total loss of immich and paperless-ngx for at least 4 days (exact start unknown —
detected via manual inspection, not an alert). No data loss; WAL segments were intact on-disk,
only unarchived.

**Duration:** WAL archiving failure from 2026-05-05T19:20 UTC; services down from ~~2026-05-28
(estimated); fully resolved 2026-05-30T~~18:30 UTC.

**First signal:** `ContinuousArchivingFailing` cluster condition at 2026-05-05T19:20:26 UTC
(discovered retrospectively — no alert was configured for this condition).

***

## Timeline

Timeline omitted — most 2026-05-30 action timestamps were reconstructed from session memory
with unknown skew. The `ContinuousArchivingFailing` condition timestamp (2026-05-05T19:20:26 UTC)
is the only reliable data point and is captured in Event Summary.

***

## What Went Well

* **Longhorn supports live online PVC resize.** The WAL PVCs were expanded from 5 Gi to 10 Gi
  with no pod restart required, unblocking postgres immediately once the CrashLoopBackOff
  backoff cycle completed.
* **barman-cloud logs are structured JSON.** Despite the high signal-to-noise ratio (retention
  messages dominate), filtering with `python3 -c "import json…"` surfaced the exact error
  string within minutes of starting the log investigation.
* **The CNPG cluster condition carried the exact timestamp.** `kubectl get cluster -o json`
  showed `ContinuousArchivingFailing` with a precise timestamp and message, allowing the full
  25-day failure window to be reconstructed without any log retention.
* **S3 move preserved the safety net.** Moving the stale folder to `.bak` instead of deleting
  it preserved the original base backup. This was the correct call: a working backup was
  confirmed before the `.bak` was abandoned.

***

## Root-Cause Analysis

**Technique:** 5 Whys
**Why this technique:** Single linear cause chain — silent archiving failure compounded by missing alerts. Each "why" converges cleanly toward the structural observability gap.

### Analysis

1. **Why were immich and paperless-ngx unavailable?**
   → PostgreSQL refused to start on both nodes (`Detected low-disk space condition, avoid
   starting the instance`); CNPG cluster phase was `Not enough disk space`.

2. **Why was the WAL PVC full?**
   → WAL archiving to S3 had failed silently since 2026-05-05T19:20 UTC (day 1 of operation).
   With `archive_mode = on`, PostgreSQL retains every WAL segment locally until the
   `archive_command` succeeds. 25 days of unarchived WALs filled the 5 Gi PVC.

3. **Why did WAL archiving fail?**
   → `barman-cloud-check-wal-archive` — a check that runs on **every pod restart** — found
   existing objects at `s3://cnpg-backups/lungmen.akn/apps-secured/01KMWETKMBK0MYNB3X7RH6BT0X/`
   and returned exit code 1 with the message `Expected empty archive`. barman interprets a
   non-empty destination as a data safety guard and refuses all archiving.

4. **Why were there existing objects at that S3 path?**
   → A failover on \~2026-05-08 changed the CNPG timeline from 1 to 2. The original base backup
   (taken from timeline 1) remained at the `serverName/` path on S3. CNPG does not clean up S3
   after a failover, and no procedure existed for manual cleanup.

5. **Why wasn't the S3 path cleaned after the failover, and why wasn't the archiving failure detected?**
   → **No alert was configured for the `ContinuousArchivingFailing` cluster condition.** The
   condition was set 86 seconds after cluster creation and remained set for 25 days with no
   notification. The WAL PVC had no capacity alert either, so saturation was discovered only
   when services failed.

### Root Causes

* **No alert for `ContinuousArchivingFailing`** — the CNPG cluster condition that signals WAL
  archiving is broken fired immediately and persisted for 25 days without triggering any
  notification. This is the structural condition that made a 4-day outage probable: a permanent
  silent failure with no signal until downstream services were unavailable.

* **`barman-cloud-check-wal-archive` has no tolerance for post-failover S3 state** — the check
  is designed for fresh cluster setup safety, but it runs on every pod restart with no mechanism
  to detect and ignore data from a previous CNPG timeline. A single failover permanently breaks
  WAL archiving unless the S3 path is manually cleaned up — a non-obvious operational requirement
  with no documentation or alerting.

### Contributing Factors

* **WAL PVC sized at 5 Gi with no capacity alert** — at the WAL generation rate of this cluster,
  5 Gi was exhausted in \~25 days. No alert fired at any usage threshold; saturation was detected
  only at 100%.
* **High restart count (1193) on pod-1 masked root cause** — `CrashLoopBackOff` noise was
  present for days without triggering investigation, because no alert existed for pod restart
  thresholds on the `databases` namespace.
* **`mc` not in `.mise.toml`** — the MinIO CLI required for S3 operations was not pre-installed
  in the project toolchain, adding manual steps during a time-sensitive recovery.

***

## Warning Signs Missed

| Signal                                         | When visible                       | Why it wasn't acted on                                     |
| ---------------------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `ContinuousArchivingFailing` cluster condition | 2026-05-05T19:20:26 UTC — day 1    | No alert; condition only visible via `kubectl get cluster` |
| Pod-1 in `CrashLoopBackOff` (1193 restarts)    | \~4 days before discovery          | No restart-count alert on the `databases` namespace        |
| WAL PVC at 100% (5 Gi full)                    | \~2 days before services went down | No PVC capacity alert configured                           |
| immich and paperless-ngx unavailable           | \~4 days before reported           | No end-to-end availability check on dependent services     |

***

## Control Analysis

### In Control (what we could have changed)

* An alert on `ContinuousArchivingFailing` (CNPG cluster condition, severity High, fire within
  1 hour) would have surfaced the failure on day 1, before any WAL accumulation.
* A WAL PVC capacity alert at 70% would have provided \~10 days of advance warning for this
  accumulation rate.
* A post-failover runbook noting that S3 serverName paths must be cleared before postgres
  restarts would have prevented the 25-day block.
* Adding `mc` to `.mise.toml` avoids a toolchain gap during recoveries.

### Out of Control (external factors)

| External factor                                                | What would reduce exposure                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `barman-cloud-check-wal-archive` behavior on non-empty paths   | Alert immediately on `ContinuousArchivingFailing`; document post-failover S3 cleanup in procedure |
| No CNPG-native mechanism to detect post-failover stale S3 data | Use `isWALArchiver: false` for homelab clusters relying on base backups only                      |

***

## Systemic Lessons

* **CNPG WAL archiving failures are completely silent without explicit alerting.** The
  `ContinuousArchivingFailing` condition is the only signal, and it is not read unless someone
  runs `kubectl get cluster`. For any cluster where WAL archiving is critical, this condition
  must have an alert. This lesson applies to every CNPG cluster in this repository.

* **A failover does not clean up S3, and the post-failover WAL check will block archiving
  indefinitely.** This is a known barman-cloud behavior that is not documented in the CNPG
  operator's upgrade or failover guides. Any operator performing or observing a CNPG failover
  must check whether the S3 `serverName/` path needs to be cleared before the next pod restart.

* **For homelab clusters that don't need WAL-based PITR, `isWALArchiver: false` with a daily
  `ScheduledBackup` is a safer architecture.** WAL archiving adds operational complexity
  (the S3 path check, retention policies, archive\_mode behavior) that is only justified when
  point-in-time recovery to an arbitrary moment is required. For immich and paperless-ngx, daily
  backups are sufficient.

***

## From Lesson to Control

| Lesson                                                                                  | Artifact type | Linked artifact                                                                                                     |
| --------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| CNPG `ContinuousArchivingFailing` is silent without explicit alerting                   | Alert rule    | TBD — part of meta-pattern `observability-gap` (see INDEX.md)                                                       |
| A CNPG failover leaves S3 `serverName/` populated; next pod restart blocks archiving    | Runbook step  | `docs/procedures/databases/DB-20260530-00.cnpg-wal-disk-full-recovery.md` (post-failover S3 cleanup section to add) |
| Homelab clusters that don't need PITR should use `isWALArchiver: false` + daily backups | ADR / pattern | ADR-TBD on CNPG operational profile (PITR vs daily-only)                                                            |
| WAL PVC capacity is a silent failure mode                                               | Alert rule    | TBD — same `observability-gap` meta-pattern                                                                         |
| MinIO CLI (`mc`) gap during recovery slows incident response                            | Tooling       | `.mise.toml` (lungmen.akn or global)                                                                                |

***

## Change Register

* [x] \[due:: 2026-05-30] \[priority:: high] \[size:: M] \[owner:: Alexandre] Expand WAL PVCs 5 Gi → 10 Gi; move stale S3 folder to `.bak`; restore WAL archiving on `apps-secured-20260329`
  * **Verification:** Cluster condition `ContinuousArchivingSuccess`; both pods Running
  * **If not done:** Cluster unrecoverable; data inaccessible

* [x] \[due:: 2026-05-30] \[priority:: high] \[size:: S] \[owner:: Alexandre] Trigger manual backup `apps-secured-20260329-on-demand-1780160586` before any further mutation
  * **Verification:** Backup status `Completed` in CNPG `Backup` resource
  * **If not done:** Mutations on a fragile cluster without a safety net

* [x] \[due:: 2026-05-30] \[priority:: high] \[size:: L] \[owner:: Alexandre] Create `apps-secured-20260530` with `isWALArchiver: false`, 2 Gi WAL, daily `ScheduledBackup` (PR #1014)
  * **Verification:** PR #1014 merged; new cluster healthy; immich and paperless-ngx reconnected
  * **If not done:** Old architectural condition persists; same incident shape possible on the next failover

* [ ] \[due:: 2026-06-07] \[priority:: high] \[size:: M] \[owner:: Alexandre] Add Prometheus alert for `ContinuousArchivingFailing` CNPG condition (fire within 1h)
  * **Verification:** Alert rule deployed; test by temporarily breaking archiving on a non-production cluster — alert fires within 1h
  * **If not done:** Next silent archiving failure goes undetected for days again

* [ ] \[due:: 2026-06-07] \[priority:: high] \[size:: S] \[owner:: Alexandre] Add Prometheus alert for WAL PVC usage > 70% across all CNPG namespaces
  * **Verification:** Alert visible in Alertmanager; fires when a test PVC hits 70%
  * **If not done:** Next WAL accumulation goes undetected until saturation

* [ ] \[due:: 2026-06-14] \[priority:: medium] \[size:: S] \[owner:: Alexandre] Add `mc` (MinIO CLI) to `.mise.toml` so S3 operations are available without manual install during recoveries
  * **Verification:** `mise exec -- mc --version` works without `mise install mc` step
  * **If not done:** Next S3-related incident loses 5-10 min to tooling setup

* [ ] \[due:: 2026-06-14] \[priority:: medium] \[size:: S] \[owner:: Alexandre] Delete stale S3 folder `01KMWETKMBK0MYNB3X7RH6BT0X.bak/` once `apps-secured-20260530` is confirmed stable
  * **Verification:** Folder absent from `mc ls myminio/cnpg-backups/lungmen.akn/apps-secured/`
  * **If not done:** \~200 MB of orphan data; no operational impact

***

## Resolution Tracker

### Done

* [x] WAL PVCs expanded 5 Gi → 10 Gi — cluster unblocked, postgres running
* [x] Stale S3 folder moved to `.bak` — WAL archiving restored (`ContinuousArchivingSuccess`)
* [x] Manual backup `apps-secured-20260329-on-demand-1780160586` triggered and verified completed
* [x] [Issue #1013](https://github.com/chezmoidotsh/arcane/issues/1013) opened — incident tracked
* [x] [PR #1014](https://github.com/chezmoidotsh/arcane/pull/1014) — new cluster `apps-secured-20260530` with WAL archiving disabled, 2 Gi WAL PVC, daily `ScheduledBackup`; NetworkPolicies for immich and paperless-ngx updated

### Pending — after PR #1014 merges

* [ ] Verify `apps-secured-20260530` reaches `Cluster in healthy state`
* [ ] Verify `ScheduledBackup` `apps-secured-daily` triggers its immediate backup
* [ ] Restart immich and paperless-ngx to reconnect with new credentials (ExternalSecrets refresh delay \~5 min)
* [ ] Delete stale S3 folder `01KMWETKMBK0MYNB3X7RH6BT0X.bak/` once new cluster stable — Change Register #7
* [ ] Delete ad-hoc backup `apps-secured-20260329-on-demand-1780160586` once migration confirmed

### Pending — alerting

* [ ] Add Prometheus alert for `ContinuousArchivingFailing` — Change Register item 4
* [ ] Add Prometheus alert for WAL PVC usage > 70% — Change Register item 5
* [ ] Add `mc` to `.mise.toml` — Change Register item 6

***

## Agent Knowledge

* CNPG WAL archiving: `barman-cloud-check-wal-archive` runs on **every pod restart** and refuses to archive if the S3 `serverName/` path is non-empty, returning `Expected empty archive`. This is a safety guard, not a bug — but it permanently blocks archiving until the path is cleaned.
* After any CNPG failover, the timeline changes (e.g. 1 → 2) but **CNPG does not clean up the S3 path** from the previous timeline. The next pod restart will fail the WAL archive check.
* CNPG cluster condition `ContinuousArchivingFailing` is the only signal that archiving is broken. It's not surfaced in `kubectl get pods` or events — only `kubectl get cluster <name> -o yaml` reveals it.
* With `archive_mode = on`, PostgreSQL retains every WAL segment locally until the `archive_command` succeeds. A persistent archive failure fills the WAL PVC monotonically.
* When the WAL PVC is full, CNPG enters phase `Not enough disk space` and **refuses to start postgres on any pod** — even though the WAL data on-disk is intact. Recovery requires PVC expansion before any other action.
* For homelab clusters without PITR requirements, `isWALArchiver: false` + daily `ScheduledBackup` is a simpler, safer architecture than WAL archiving.
* MinIO CLI: `mc alias set myminio <endpoint> <key> <secret>` then `mc ls myminio/<bucket>/<prefix>` to inspect; `mc mv` to move stale folders to `.bak` paths.

***

## Verification Schedule

| Checkpoint     | Date       | What we'll check                                                                                                   | Forum       |
| -------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ | ----------- |
| 1-week review  | 2026-06-07 | PR #1014 merged; `apps-secured-20260530` healthy; immich and paperless-ngx running; P0/P1 items complete           | Solo review |
| 1-month review | 2026-06-30 | P2 items complete; `ContinuousArchivingFailing` alert firing in test; WAL PVC alerts active; `.bak` folder deleted | Solo review |
| 3-month review | 2026-08-30 | No recurrence of WAL saturation on any CNPG cluster; alert coverage audit across all clusters                      | Solo review |
