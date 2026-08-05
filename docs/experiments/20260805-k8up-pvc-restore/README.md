---
experiment: EXP-2026-008
title: k8up as a PVC-focused Velero alternative — local POC
status: OK
created: 2026-08-05
updated: 2026-08-05
k8up: v2.16.0 (chart 4.10.0)
issue: https://github.com/chezmoidotsh/arcane/issues/1208
---

## Abstract

Local, disposable proof of concept for #1208: deploy k8up against an S3-compatible target, back up a real PVC-backed
stateful app twice, delete its data, and restore it from an **explicitly named, non-latest snapshot** into the PVC that
already exists — the exact shape #1188 found Velero's restore controller unable to handle on a GitOps-managed cluster
(see [docs/experiments/20260803-velero-pvc-backup](../20260803-velero-pvc-backup/)).

Everything runs in a **disposable local kind cluster** with MinIO standing in for the real S3 target and a throwaway
Postgres StatefulSet standing in for a real app (jellyfin, paperless-ngx, actual-budget). No real cluster, no real
backup bucket.

Three real, evidenced operational gotchas turned up by actually running this — not by reading k8up's docs — are the main
payoff of this POC: see [§3.3](#33-backup-jobs-run-as-a-fixed-uid--silent-empty-backups) and
[§3.4](#34-retention-keepdaily-silently-defaults-to-14). Both directly bear on the issue's real bar: "is this
simple/deterministic enough for a small local model, or a human on a short runbook, to operate correctly."

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Requirements](#2-requirements)
3. [Sandbox Architecture](#3-sandbox-architecture)
4. [Implementation](#4-implementation)
5. [Test Environment](#5-test-environment)
6. [Validation Criteria](#6-validation-criteria)
7. [Results](#7-results)
8. [Comparison with Velero](#8-comparison-with-velero)
9. [Conclusions](#9-conclusions)
10. [Actionable Next Steps](#10-actionable-next-steps)

---

## 1. Problem Statement

#1188 (lungmen.akn recreation) found Velero's `PodVolumeRestore` controller structurally unable to restore PV data into
a pod that ArgoCD/Kustomize already created declaratively — the controller only progresses once Velero itself
creates/owns the target pod, which never happens on this cluster. #1208 asks whether k8up's restic-based, PVC-only
backup avoids that specific failure mode, and whether its restore path is simple and deterministic enough that a small
(32B-class) local model — the repo's stated long-term maintainability bar, see #1208's own comment thread — could
operate it correctly during a real incident, not just that it technically supports S3/schedule/retention/restore.

## 2. Requirements

- Disposable and reproducible from a clean checkout with one command (`mise run poc:bootstrap`).
- S3-compatible backup target, matching the real candidate (`s3.chezmoi.sh`, Garage) closely enough that the
  `backend.s3` config is representative — MinIO, same reasoning as the Velero POC.
- A real PVC-backed stateful app, not a synthetic file — same Postgres + marker-row pattern as the Velero POC, reused
  because it already proved a live filesystem-level backup round-trips real application data.
- Explicitly exercise the failure mode named in #1208's acceptance criteria: k8up-io/k8up#1062 ("restore can take the
  latest backup regardless of which snapshot was requested").
- Never touch `lungmen.akn`, `rhodes.akn`, or any real OpenBao/S3 credentials.

**Out of scope**: real S3 target (MinIO is throwaway here, same as the Velero POC), packaging as an ArgoCD Application
(follow the Velero POC's deferred pattern once this approach is confirmed), CNPG-specific behavior (this POC uses a
plain Postgres StatefulSet, not a CNPG cluster).

---

## 3. Sandbox Architecture

```text
kind cluster "k8up-poc"
├── k8up-poc namespace
│     └── MinIO (single-node, S3 API) — bucket "k8up-backups"
├── k8up namespace
│     └── k8up operator deployment (global S3/repo-password env vars, §3.1)
└── k8up-poc-app namespace
      ├── test-app StatefulSet (Postgres 17) — PVC "data-test-app-0"
      └── Schedule "test-app" (backup/check/prune cron, §3.2)
```

MinIO is used instead of Garage for the same reason as the Velero POC: the real target is "existing MinIO or Backblaze
B2," and MinIO's S3 API keeps the `backend.s3` config representative.

### 3.1 Global backend config, not per-CR

k8up's operator supports setting the S3 backend and restic repository password **once, globally**, via `BACKUP_GLOBAL*`
env vars on the operator Deployment (`operator/cfg/config.go` / `operator/executor/envvarconverter.go` in k8up-io/k8up —
confirmed by reading the source, not assumed from partial docs). `manifests/k8up-helmvalues.yaml` sets these from a
`k8up-repo-credentials` Secret; every Schedule/Backup/Restore/Prune CR in this POC then omits `spec.backend` entirely.
This is a real ergonomic advantage over Velero, whose `BackupStorageLocation` is also global but the fs-backup
annotation model still requires per-workload configuration (§3.1 of the Velero POC).

### 3.2 Opt-out PVC discovery, not opt-in

k8up's Schedule covers every PVC in its namespace by default (RWX always, RWO unless `k8up.io/backup: "false"`) — no
per-pod annotation needed. This directly avoids the Velero POC's §3.1 finding (`defaultVolumesToFsBackup` silently
skipping a PVC with zero error). `manifests/test-app.yaml` needs no backup-related annotation at all, unlike the Velero
POC's `backup.velero.io/backup-volumes`.

Also unlike Velero's fs-backup, which explicitly refuses hostPath-typed PVs (Velero POC §3.2), k8up's backup Job mounts
the target PVC directly into its own pod — it never inspects the underlying PV type, so kind's bundled `standard`
StorageClass works with **zero** workaround (no static `local` PV, no `manual` StorageClass).

### 3.3 Backup Jobs run as a fixed UID — silent empty backups

**This is the headline finding of this POC.** Confirmed as a known, open upstream bug —
[k8up-io/k8up#1032](https://github.com/k8up-io/k8up/issues/1032), same symptom (uid 65532,
`error occurred during backup` during scan and archival, empty snapshot reported as success) reported independently
against a real Longhorn/nginx volume — this isn't a sandbox artifact. k8up's backup Job pod runs as a fixed non-root UID
(65532, the operator image's own default) unless `spec.podSecurityContext` overrides it. Postgres's PGDATA is owned by
uid 70 with mode `0700` — the backup Job, running as uid 65532, cannot read into it.

This is **not a hard failure**. The Job pod's own log shows:

```text
backup finished	{"new files": 0, "changed files": 0, "errors": 2}
```

(two "error occurred during backup" lines, one for scan, one for archival) — but the `Backup` CR's `Completed` condition
still reports `status: "True", reason: "Succeeded"`. `kubectl get backup` prints a `COMPLETION` column that says
`Succeeded`. Nothing on the CR's status distinguishes "backed up 1271 files" from "backed up 0 files because it couldn't
read any of them." The only way to catch this is reading the Job pod's own logs for `"errors": 2` / `"new files": 0` —
something neither a human skimming `kubectl get backup` nor (per #1208's own stated bar) a small local model would
reliably think to check.

Fix: set `spec.podSecurityContext.runAsUser`/`runAsGroup` to match whatever UID actually owns the target PVC's data
(confirmed working — `manifests/schedule.yaml`, and every ad-hoc CR in `scripts/validate.sh`, set `70`/`70` for
Postgres). **There is no cluster-wide default for this** the way there is for the S3 backend (§3.1) — every app with
non-default PVC ownership needs its own value, discovered per-app, not assumed.

### 3.4 Retention: `keepDaily` silently defaults to 14

Also a known, open upstream bug — [k8up-io/k8up#1106](https://github.com/k8up-io/k8up/issues/1106), which quotes the
exact same `operator/prunecontroller/executor.go` snippet independently. k8up's prune executor (its own code comment:
`// FIXME(mw): this is ugly`) hardcodes `KEEP_DAILY=14` whenever `spec.retention.keepDaily` is `0`/unset — there is no
way to express "don't also keep one per day" by omission. Found by setting only `keepLast: 1` and getting 2 snapshots
back instead of 1: restic's actual policy, "keep 1 latest, 14 daily," correctly kept both snapshots because they landed
on the same UTC day. `scripts/validate.sh`'s Prune CR sets `keepDaily: 1` explicitly to get a deterministic
single-snapshot result. A production Schedule that only sets `keepLast` will silently retain far more than intended.

### 3.5 Completed backup Jobs pin the PVC

A `pvc-protection` finalizer blocks PVC deletion while _any_ pod — running or long-Completed — still lists that PVC
under `spec.volumes`. k8up's own backup Job pods aren't garbage-collected on completion, so simulating data loss
(deleting a PVC to force a fresh one) hangs on `kubectl delete pvc --wait` until the old backup Job(s) are also deleted.
Harmless for normal operation, but a real trap for anyone doing an actual disaster-recovery PVC recreation without
knowing to clean up old backup Jobs first. `scripts/validate.sh` does this explicitly before its data-loss simulation.

---

## 4. Implementation

### 4.1 Bootstrap

```sh
mise run poc:bootstrap
```

Idempotent — creates the kind cluster if missing, reuses it otherwise. Deploys, in order: MinIO + bucket-creation Job
(`manifests/minio.yaml`), k8up via the official Helm chart (`manifests/k8up-helmvalues.yaml`, global S3/repo env vars),
the Postgres test app (`manifests/test-app.yaml`), and its Schedule (`manifests/schedule.yaml`).

```sh
mise run poc:teardown   # deletes the kind cluster and everything in it
```

### 4.2 Validation

```sh
mise run poc:validate
```

Writes marker1, takes backup-1; writes marker2, takes backup-2; simulates data loss (scales the StatefulSet to 0,
deletes the PVC, scales back up to get a fresh empty one — §3.5's job cleanup happens first); restores **explicitly from
backup-1's snapshot ID**, not the latest; checks marker1 came back and marker2 did **not** (the actual test of
k8up-io/k8up#1062); prunes down to 1 snapshot (§3.4's explicit `keepDaily`).

### 4.3 Manifests

| File                                               | Purpose                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| `manifests/minio.yaml`                             | Single-node MinIO + bucket-creation Job (S3 backup target)          |
| `manifests/k8up-helmvalues.yaml`                   | k8up Helm values — global S3/repo-password env vars (§3.1)          |
| `manifests/test-app.yaml`                          | Postgres StatefulSet, kind's default StorageClass (§3.2)            |
| `manifests/schedule.yaml`                          | Namespace-scoped Schedule — backup/check/prune cron, uid fix (§3.3) |
| `scripts/bootstrap.sh`/`validate.sh`/`teardown.sh` | Sandbox lifecycle, wired into `mise run poc:*`                      |

---

## 5. Test Environment

| Component | Value                                            |
| --------- | ------------------------------------------------ |
| kind      | v0.32.0, node image `kindest/node:v1.36.1`       |
| k8up      | chart 4.10.0, app v2.16.0                        |
| MinIO     | `minio/minio:RELEASE.2025-09-07T16-13-09Z`       |
| Test app  | `postgres:17-alpine`, 1Gi dynamic `standard` PVC |

---

## 6. Validation Criteria

```sh
mise run poc:validate
```

| ID    | Criterion                                                             |
| ----- | --------------------------------------------------------------------- |
| V-001 | backup-1 completed successfully                                       |
| V-002 | backup-2 completed successfully                                       |
| V-003 | PVC recreated empty (marker gone after simulated data loss)           |
| V-004 | restore-1 (explicit, non-latest snapshot) completed successfully      |
| V-005 | PVC restored and Bound                                                |
| V-006 | Postgres ready after restore                                          |
| V-007 | marker1 (the explicitly targeted, older snapshot) came back           |
| V-008 | marker2 (the newer snapshot) did **not** come back — guards k8up#1062 |
| V-009 | prune-1 completed successfully                                        |
| V-010 | exactly 1 snapshot remains after pruning                              |

---

## 7. Results

`mise run poc:bootstrap` followed by `mise run poc:validate` passes all 10 checks on a clean run:

```text
=== Results: 10 passed, 0 failed ===
```

Getting there took 2 real, reproducible failures along the way (not injected — found by running the script and reading
the actual error), both documented as findings above rather than smoothed over:

1. First run: `kubectl delete pvc --wait` hung to its timeout — the StatefulSet controller re-created the pod
   (remounting the old PVC) before the delete could land, because the pod was deleted with replicas still at 1. Fixed by
   scaling to 0 first (`scripts/validate.sh`'s data-loss step).
2. Second run: restore "succeeded" but the restored database had none of the expected data — traced to §3.3 (the
   silent-empty-backup UID mismatch), not a restore bug at all; the _backups themselves_ were empty. Fixed by setting
   `podSecurityContext` on every CR.

## 8. Comparison with Velero

| Dimension                               | Velero (EXP-2026-007)                                                                                                                                                                                                              | k8up (this POC)                                                                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restore into an already-existing PVC    | **Structurally broken on this cluster** — `PodVolumeRestore` only progresses if Velero itself creates/owns the target pod, which never happens once ArgoCD already declared it (#1188, the reason this whole investigation exists) | **Works** — the restore Job mounts the target PVC directly, never needs to own/create the pod (V-004/V-005)                                                                                    |
| Explicit snapshot targeting             | Not exercised in the Velero POC                                                                                                                                                                                                    | Explicitly tested against k8up-io/k8up#1062's failure mode — correct (V-007/V-008)                                                                                                             |
| Backend config                          | Global (`BackupStorageLocation`), but the fs-backup annotation is still per-workload                                                                                                                                               | Fully global (`BACKUP_GLOBAL*` env vars) — every CR in this POC omits `spec.backend` (§3.1)                                                                                                    |
| PVC discovery                           | Opt-in per pod (`backup.velero.io/backup-volumes`); the global opt-out flag silently skips volumes with zero error (Velero POC §3.1)                                                                                               | Opt-out per namespace by default (§3.2) — no annotation needed, no silent-skip failure mode found                                                                                              |
| Underlying PV type dependency           | fs-backup explicitly refuses hostPath-typed PVs (Velero POC §3.2) — needed a static `local` PV workaround in kind                                                                                                                  | None — the backup Job mounts the PVC directly regardless of PV type (§3.2)                                                                                                                     |
| **Default backup consistency (freeze)** | **No freeze.** Velero's own docs: fs-backup "backs up data from the live file system, in which way the data is not captured at the same point in time, so is less consistent than the snapshot approaches"                         | **No freeze either.** k8up's own docs warn the direct-PVC-mount method "does not work when files are kept open for a long period of time, like databases do"                                   |
| App-aware / consistent backup path      | Pre/post exec hooks (`pre.hook.backup.velero.io/command`) — documented pattern is literally calling `fsfreeze`/`fsunfreeze` around the backup                                                                                      | `k8up.io/backupcommand` annotation (exec inside the app pod) or a separate `PreBackupPod` — same idea, different shape. Neither Velero's hooks nor k8up's exec paths were tested in either POC |
| Storage-level atomic snapshot option    | **Yes** — CSI `VolumeSnapshotLocation`, genuinely atomic at the storage layer, no app-level freeze needed (out of scope for both POCs — needs a real CSI driver)                                                                   | **No equivalent.** k8up is restic-based file backup only; there is no CSI-snapshot alternative to fall back on for consistency                                                                 |
| Silent-failure modes found              | `defaultVolumesToFsBackup` silently skips a PVC with zero error/warning (Velero POC §3.1)                                                                                                                                          | Backup Job silently backs up 0 files on a UID mismatch, `Backup` CR still reports `Succeeded` (§3.3, confirmed as open upstream bug k8up-io/k8up#1032)                                         |
| Retention footguns found                | None found in the Velero POC                                                                                                                                                                                                       | `keepDaily` silently defaults to 14 regardless of what's requested (§3.4, confirmed as open upstream bug k8up-io/k8up#1106)                                                                    |
| Community / maturity                    | Larger community, CNCF-adjacent, VMware/Broadcom-backed                                                                                                                                                                            | Smaller (VSHN-backed), but active — weekly/monthly release cadence                                                                                                                             |

**On the freeze question specifically** (researched directly against both projects' docs, not assumed): **neither tool
freezes anything by default.** Both Velero's fs-backup and k8up's direct-PVC-mount backup are a live read of whatever
the filesystem looks like at scan time — both projects' own documentation carries the identical warning about open
files/databases. Consistency for a real database is entirely opt-in and entirely the same shape on both sides: an
exec-based hook that runs a tool with its own consistency guarantees (`pg_dump`, `fsfreeze`, …) before the raw files are
read. The one **structural** difference is that Velero additionally offers CSI volume snapshots — an atomic,
storage-layer mechanism that sidesteps the freeze question entirely because the snapshot itself is a single
point-in-time copy-on-write operation — which k8up has no equivalent for. That gap doesn't matter for this repo
specifically (the issue that started this investigation already ruled CSI snapshots out of scope for `lungmen.akn`), but
it's a real capability Velero has and k8up structurally doesn't.

## 9. Conclusions

**k8up solves the specific problem that sent this investigation down this path.** Restore into an already-existing,
ArgoCD-owned PVC works cleanly and deterministically — no controller-timing flakiness, no "Velero must own the pod"
requirement (Velero POC's whole reason for existing, and #1188's original blocker). Explicit snapshot targeting is
correct (V-007/V-008 directly rule out k8up-io/k8up#1062's failure mode). The opt-out PVC discovery model (§3.2) removes
an entire class of "silently skipped this PVC" failure Velero has.

**It is not drop-in "just works," though.** §3.3 and §3.4 are two real gotchas that don't show up anywhere in k8up's own
CRD status or `kubectl get` output — they require either reading the Job pod's logs (§3.3) or knowing about an internal
hardcoded default (§3.4) to catch. Both are the kind of thing a small local model, or a human on a short runbook, would
walk straight past: `kubectl get backup` says `Succeeded` even when nothing was backed up at all. Neither is a sandbox
artifact — both are confirmed, open, upstream bugs ([k8up-io/k8up#1032](https://github.com/k8up-io/k8up/issues/1032),
[k8up-io/k8up#1106](https://github.com/k8up-io/k8up/issues/1106)) reported independently against real production
volumes, unfixed as of chart 4.10.0/app v2.16.0.

**Verdict: keep k8up, start migrating lungmen.akn's local-PVC apps (actual-budget, jellyfin, paperless-ngx) off Velero's
fs-backup path — but treat "does this app's backup Job actually report `new files > 0`" as a mandatory per-app health
check at rollout time, not something the CR status alone can be trusted to surface.** Don't run both tools for the same
apps: Velero doesn't solve the restore problem this cluster actually has, so keeping it alongside k8up buys nothing but
a second thing to maintain.

### 9.1 Not answered by this POC

- **CNPG-specific backup behavior** — this POC uses a plain Postgres StatefulSet, not a CNPG cluster. CNPG's own
  backup/WAL-archiving machinery may interact with a concurrent restic snapshot differently. Worth a follow-up check
  before relying on this for `lungmen.akn`'s real CNPG clusters (same caveat the Velero POC raised).
- **Scheduled (cron-triggered) backup firing** — this POC validates the Schedule CR is accepted (`Ready` condition) and
  drives the actual backup/restore/prune round trip via standalone one-off CRs for speed, same convention as the Velero
  POC's `velero backup create --wait`. Cron firing itself isn't exercised.
- **RWO backup-Job node scheduling** — #1208's own risk section flags that RWO PVC backup Jobs must land on the same
  node as the pod using the volume. Not exercised here (kind is single-node); worth checking against `lungmen.akn`'s
  actual node topology before rollout.
- **k8up-io/k8up#803 (single-file restore) and #1210 (restoreMethod misconfiguration error UX)** — not specifically
  exercised; this POC's restore is a whole-folder restore into an existing PVC, not a single-file restore, and every CR
  here is correctly configured by construction.
- **Whether the target pod can stay up during restore** — `scripts/validate.sh` explicitly scales the StatefulSet to 0
  before creating the Restore CR and only scales back up once it completes (see the "Scaling down" step). This wasn't
  arbitrary — restoring restic-managed files into a directory a live Postgres has open risks corruption regardless of
  which backup tool is involved — but it means **restoring with the pod left running was never exercised**, only "stop,
  restore, start." On `lungmen.akn`, the StatefulSet is ArgoCD-managed: if self-heal is enabled, a manual
  `kubectl scale --replicas=0` done out-of-band (not through Git) is likely to get fought and reverted by ArgoCD's own
  reconciliation before the restore Job ever gets exclusive access to the PVC. Not tested here — kind has no ArgoCD. The
  real procedure almost certainly needs to pause/unsync the Application first, not just scale the workload.
- **Whether restore is destructive or additive** — every restore in this POC targets a PVC that was just freshly
  (re)created and is genuinely empty (§3.5's data-loss simulation deletes and recreates it). `restic restore` is not
  necessarily a wipe-then-restore operation — by default it writes/overwrites the files present in the snapshot but does
  not clearly guarantee removal of files that exist in the target but aren't in the snapshot. Restoring "in place" onto
  a PVC that already has some (possibly partial or corrupted) data — rather than a freshly emptied one — was never
  tested, so whether stale files survive a restore and give a false sense of a clean recovery is an open question, not
  an assumption this POC can back up.
- **Backup consistency under concurrent writes / app-aware hooks** — backup-1 and backup-2 were both taken while
  Postgres was live and serving queries, and the round trip preserved the marker row correctly both times. That worked
  here, but neither tool freezes anything by default (confirmed against both projects' own docs, see
  [§8](#8-comparison-with-velero)): k8up's direct-PVC-mount backup and Velero's fs-backup carry the identical warning
  about open files/databases. k8up's app-aware alternative to the raw file-level backup, the `k8up.io/backupcommand`
  annotation (exec a command — e.g. a `pg_dump`, or a pause/flush — instead of reading the mounted files directly),
  mirrors Velero's own pre/post backup hooks exactly. Neither this POC nor the Velero one tested the hook-based path;
  both only validated the naive file-level backup. For lungmen.akn's actual CNPG clusters this matters more than it did
  here, since CNPG already has its own WAL-archiving backup machinery that a concurrent restic snapshot could interact
  with unpredictably (see the CNPG bullet above).

### 9.2 References

- Issue: [#1208](https://github.com/chezmoidotsh/arcane/issues/1208)
- Related: [#1188](https://github.com/chezmoidotsh/arcane/issues/1188) (lungmen.akn recreation — where the Velero
  restore reliability problem was found), [docs/experiments/20260803-velero-pvc-backup](../20260803-velero-pvc-backup/)
  (EXP-2026-007, the Velero POC this one is a direct counterpart to)
- k8up docs: <https://docs.k8up.io/k8up/2.16/>
- k8up-io/k8up source read directly for this POC: `operator/cfg/config.go`, `operator/executor/envvarconverter.go`,
  `operator/prunecontroller/executor.go`, `restic/cli/prune.go`, `api/v1/status.go`, `api/v1/common_types.go`
- k8up-io/k8up#1062, #803, #1210 (named in #1208's own research)
- k8up-io/k8up#1032 (§3.3 — silent empty backup, open), #1106 (§3.4 — undocumented `keepDaily: 14` default, open) —
  found independently by searching upstream after reproducing both locally, confirming neither is a sandbox artifact
- k8up backup consistency: <https://docs.k8up.io/k8up/2.16/explanations/backup.html> (direct-PVC-mount method, open
  files/database warning), `k8up.io/backupcommand` and `PreBackupPod` samples
  (`config/samples/k8up_v1_prebackuppod.yaml` in k8up-io/k8up)
- Velero backup consistency: <https://velero.io/docs/main/file-system-backup/> ("data is not captured at the same point
  in time" caveat), <https://velero.io/docs/main/backup-hooks/> (`fsfreeze` pre/post hook pattern) — read directly for
  §8's comparison, not assumed from memory

---

## 10. Actionable Next Steps

- Deploy this same k8up configuration on `lungmen.akn` against the real S3 target (`s3.chezmoi.sh`), scoped to one or
  two apps with local PVCs (actual-budget, jellyfin, or paperless-ngx per #1208), with `podSecurityContext` matched to
  each app's actual PVC ownership (§3.3) and explicit retention values for every `keep*` dimension (§3.4) — repeat the
  backup/restore validation against a real app's PVC.
- Add a rollout-time (or scheduled) check that a Schedule's most recent backup Job reported `new files > 0` — the CR
  status alone (§3.3) is not sufficient signal that a backup actually captured data.
- Package as a reusable ArgoCD Application, matching this repo's `<chart>.helmvalues/` convention (Velero POC's own
  deferred item, same shape here).
- Validate CNPG-specific behavior directly on `lungmen.akn` before relying on this for real CNPG clusters
  ([§9.1](#91-not-answered-by-this-poc)).
- **Build an operational script for the full restore procedure**, matching the `scripts/*` convention already used for
  other stateful operations in this repo (`argocd:app:sync`, `cnpg:db:migrate`, `bao:kv:copy`). A raw `kubectl apply` of
  a `Restore` CR isn't the real procedure on an ArgoCD-managed cluster — per the pod-concurrency finding above, it needs
  at minimum: unsync/pause the app's ArgoCD `Application` (so self-heal doesn't fight the scale-down), scale the
  workload to 0, create and wait on the `Restore`, scale back up and confirm the rollout, then re-sync ArgoCD. Building
  this as a reusable script (rather than a one-off manual sequence during an actual incident) is exactly the kind of
  simple, deterministic tooling #1208's own bar for "a small local model can operate this" calls for — worked out and
  tested once, not improvised live during a real recovery.
