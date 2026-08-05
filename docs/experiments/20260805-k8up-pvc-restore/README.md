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
8. [Conclusions](#8-conclusions)
9. [Actionable Next Steps](#9-actionable-next-steps)

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

## 8. Conclusions

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

### 8.1 Not answered by this POC

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

### 8.2 References

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

---

## 9. Actionable Next Steps

- Deploy this same k8up configuration on `lungmen.akn` against the real S3 target (`s3.chezmoi.sh`), scoped to one or
  two apps with local PVCs (actual-budget, jellyfin, or paperless-ngx per #1208), with `podSecurityContext` matched to
  each app's actual PVC ownership (§3.3) and explicit retention values for every `keep*` dimension (§3.4) — repeat the
  backup/restore validation against a real app's PVC.
- Add a rollout-time (or scheduled) check that a Schedule's most recent backup Job reported `new files > 0` — the CR
  status alone (§3.3) is not sufficient signal that a backup actually captured data.
- Package as a reusable ArgoCD Application, matching this repo's `<chart>.helmvalues/` convention (Velero POC's own
  deferred item, same shape here).
- Validate CNPG-specific behavior directly on `lungmen.akn` before relying on this for real CNPG clusters
  ([§8.1](#81-not-answered-by-this-poc)).
