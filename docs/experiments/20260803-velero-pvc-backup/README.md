---
experiment: EXP-2026-007
title: Velero PVC backup (Kopia file-system backend) — local POC
status: OK
created: 2026-08-03
updated: 2026-08-03
velero: v1.18.1 (chart 12.1.0)
velero-plugin-for-aws: v1.13.1
issue: https://github.com/chezmoidotsh/arcane/issues/1054
---

## Abstract

Local, disposable proof of concept for the Kopia file-system-backup path of #1054: deploy Velero against an
S3-compatible target, back up a real PVC-backed stateful app, delete it, and restore it — proving the round trip
preserves actual application data, not just that some bytes moved around.

Everything runs in a **disposable local kind cluster** with MinIO standing in for the real S3 target (MinIO/Backblaze B2
per the issue) and a throwaway Postgres StatefulSet standing in for a real app (CNPG, Paperless, Immich, …). No real
cluster, no real backup bucket, no real Proxmox API calls.

**Explicitly out of scope for this POC**: the CSI-snapshotter path (issue #1054's incremental-backup question). That
needs the real `proxmox-csi-plugin`'s `VolumeSnapshotClass`, which only exists on actual Proxmox-backed clusters — see
[§8.2](#82-deferred).

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

#1054 needs to know, before touching any real cluster: does Velero's Kopia file-system-backup path actually preserve PVC
data through a full backup → data-loss → restore cycle? "Works" is a specific, checkable claim (the restored app reads
back the exact same data it wrote before deletion) — worth proving locally, cheaply, and repeatably before spending time
on `lungmen.akn`.

## 2. Requirements

- Disposable and reproducible from a clean checkout with one command (`mise run poc:bootstrap`).
- S3-compatible backup target, matching the real candidates (MinIO or Backblaze B2) closely enough that the
  `backupStorageLocation` config is representative.
- A real PVC-backed stateful app, not a synthetic file — the check must prove an _application_ reads its data back after
  restore, matching what a real CNPG/Paperless PVC needs to guarantee.
- Never touch `lungmen.akn`, `rhodes.akn`, or any real OpenBao/Cloudflare/S3 credentials.

**Out of scope**: CSI-snapshot backups (needs real Proxmox CSI), Backblaze B2 specifically (MinIO's S3 API is sufficient
to validate the Velero↔S3 plumbing), multi-cluster packaging (issue AC item 5 — deferred until this POC's approach is
confirmed).

---

## 3. Sandbox Architecture

```text
kind cluster "velero-poc"
├── velero-poc namespace
│     └── MinIO (single-node, S3 API) — bucket "velero-backups"
├── velero namespace
│     ├── Velero deployment (Kopia backend, no CSI VolumeSnapshotLocation)
│     └── node-agent DaemonSet (runs the actual Kopia backup/restore data path)
└── velero-poc-app namespace
      └── test-app StatefulSet (Postgres 17) — PVC "data-test-app-0"
            bound to a static `local` PV (see §4.2 for why not kind's default SC)
```

MinIO is used instead of Garage (the S3-compatible store the
[Pulumi/Crossplane POC](../20260702-pulumi-crossplane-evaluation/) uses) specifically because the real target for #1054
is "existing MinIO or Backblaze B2" — matching the production backend keeps the `s3ForcePathStyle`/region config
representative of what actually gets deployed.

### 3.1 Kopia only backs up volumes you opt in

`configuration.defaultVolumesToFsBackup: true` (Velero's global opt-out flag) was tried first — Velero accepted it
without error, but the `data` PVC volume was silently never backed up (only the pod's two `emptyDir` volumes were). Not
investigated to a root cause (would need tracing `volumeHelperImpl.ShouldPerformFSBackup` in Velero's source, several
layers past what a quick POC warrants) — switched instead to the explicit, documented mechanism:

```yaml
metadata:
  annotations:
    backup.velero.io/backup-volumes: data
```

This is the officially documented way to select PVC volumes for fs-backup per-pod (`manifests/test-app.yaml`) and worked
correctly. `configuration.defaultVolumesToFsBackup` is left unset in `manifests/velero-helmvalues.yaml`.

### 3.2 kind's default StorageClass is incompatible with fs-backup

kind's bundled `standard` StorageClass (`rancher.io/local-path`) provisions PVs of type `hostPath`. Velero's fs-backup
explicitly refuses these:

```text
level=warning msg="Volume data in pod velero-poc-app/test-app-0 is a hostPath volume which is not supported for
pod volume backup, skipping" logSource="pkg/podvolume/backupper.go:347"
```

This is a real, documented Velero limitation — not a config mistake. Velero's own e2e suite works around it by deploying
the community `csi-driver-host-path` CSI driver, which produces properly CSI-typed PVs backed by the same underlying
node storage. That driver is a full sidecar-heavy install (external-provisioner, external-attacher, external-resizer,
node-driver-registrar, the plugin itself); a static `local`-type PV inside a `manual` StorageClass gets the same result
— kubelet mounts the volume into the pod the identical way, and `local` isn't `hostPath` from Velero's check's point of
view — for a fraction of the setup:

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: velero-poc-data
spec:
  local:
    path: /mnt/velero-poc-data # pre-created on the kind node, see scripts/bootstrap.sh
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions: [{ key: kubernetes.io/hostname, operator: In, values: [velero-poc-control-plane] }]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
```

`manual` has `provisioner: kubernetes.io/no-provisioner` — no dynamic provisioning, so `Retain` (not `Delete`) is
mandatory: nothing would ever execute the delete. After the simulated data-loss step deletes the PVC, the PV is left
`Released` with a stale `claimRef`; `scripts/validate.sh` clears it
(`kubectl patch pv ... --type json -p '[{"op": "remove", "path": "/spec/claimRef"}]'`) so the restored PVC (same name,
new UID) binds to it normally.

**On real infra this whole workaround doesn't apply.** `proxmox-csi-plugin`-provisioned PVs are genuinely CSI-typed
(confirmed in [the CSI/CCM experiment](../20260617-proxmox-csi-ccm/)), so the hostPath exclusion never triggers there —
this is purely a kind sandbox artifact.

### 3.3 Postgres needs real ownership, not just group access

`fsGroup` alone (group-writable via kubelet's recursive chown-to-group on mount) isn't enough for Postgres's entrypoint
— it calls `chmod` on `PGDATA`, and `chmod` requires actual file _ownership_ (or `CAP_FOWNER`), which group membership
doesn't grant. A root `initContainer` that `chown -R 70:70`s the PVC and the `run` emptyDir before the non-root Postgres
container starts fixes it — but that init container must **not** inherit the main container's
`capabilities.drop: [ALL]`, or even `uid 0` can't `chown` a path it doesn't already own (`CAP_CHOWN`/`CAP_FOWNER` are
what actually grant that, not the UID).

---

## 4. Implementation

### 4.1 Bootstrap

```sh
mise run poc:bootstrap
```

Idempotent — creates the kind cluster if missing (and the `/mnt/velero-poc-data` directory the static PV needs on the
node), reuses it otherwise. Deploys, in order: MinIO + bucket-creation Job (`manifests/minio.yaml`), Velero via the
official Helm chart (`manifests/velero-helmvalues.yaml`, Kopia backend, no VolumeSnapshotLocation), and the Postgres
test app (`manifests/test-app.yaml`).

```sh
mise run poc:teardown   # deletes the kind cluster and everything in it
```

### 4.2 Validation

```sh
mise run poc:validate
```

Writes a timestamped marker row into Postgres, takes a Kopia backup (`velero backup create --wait`), deletes the whole
`velero-poc-app` namespace (simulated data loss), clears the static PV's stale `claimRef`, restores from the backup
(`velero restore create --wait`), and checks the marker row is back — see §3.2/§3.3 for why the sandbox needs the extra
steps a real CSI-backed cluster wouldn't.

### 4.3 Manifests

| File                                               | Purpose                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `manifests/minio.yaml`                             | Single-node MinIO + bucket-creation Job (S3 backup target)        |
| `manifests/velero-helmvalues.yaml`                 | Velero Helm values — Kopia backend, MinIO `backupStorageLocation` |
| `manifests/test-app.yaml`                          | `manual` StorageClass + static `local` PV + Postgres StatefulSet  |
| `scripts/bootstrap.sh`/`validate.sh`/`teardown.sh` | Sandbox lifecycle, wired into `mise run poc:*`                    |

---

## 5. Test Environment

| Component  | Value                                       |
| ---------- | ------------------------------------------- |
| kind       | v0.32.0, node image `kindest/node:v1.36.1`  |
| Velero     | chart 12.1.0, app v1.18.1, Kopia uploader   |
| AWS plugin | `velero/velero-plugin-for-aws:v1.13.1`      |
| MinIO      | `minio/minio:RELEASE.2025-09-07T16-13-09Z`  |
| Test app   | `postgres:17-alpine`, 1Gi static `local` PV |

---

## 6. Validation Criteria

```sh
mise run poc:validate
```

| ID    | Criterion                                         |
| ----- | ------------------------------------------------- |
| V-001 | Backup phase is `Completed`                       |
| V-002 | Namespace is gone after deletion                  |
| V-003 | Restore phase is `Completed`                      |
| V-004 | Namespace restored                                |
| V-005 | PVC restored and `Bound`                          |
| V-006 | Postgres ready after restore                      |
| V-007 | Marker row survived the backup/restore round trip |

---

## 7. Results

`mise run poc:bootstrap` followed by `mise run poc:validate` passes all 7 checks on a clean run:

```text
=== Results: 7 passed, 0 failed ===
```

Two real bugs were found and fixed along the way (both already folded into the manifests/scripts above, not left as open
issues in this repeatable POC):

- A `((pass++))`-style post-increment in `check()` evaluates to `0` (falsy) the first time `pass` goes from 0 → 1, which
  trips `set -e` and silently kills the script right after the first `PASS` line. Fixed with `pass=$((pass + 1))`. Worth
  a quick check if `docs/experiments/20260617-proxmox-csi-ccm/scripts/validate.sh` (same pattern) has ever been re-run
  since — out of scope to fix here since that experiment is already closed.
- The `minio-create-bucket` Job originally used `envFrom: secretRef` with secret keys named `root_user`/ `root_password`
  while the script referenced `$MINIO_ROOT_USER`/`$MINIO_ROOT_PASSWORD` — `envFrom` propagates the secret's own key
  names as env-var names, not a chosen alias. Fixed with explicit `env: valueFrom: secretKeyRef` entries.

## 8. Conclusions

**The Kopia file-system-backup path works** — a real Postgres PVC's data survives a full delete → restore cycle intact,
using the exact backup-target shape (S3-compatible, MinIO/B2) and StatefulSet pattern #1054's real workloads (CNPG,
Paperless, Immich) will use. This directly closes 2 of #1054's acceptance criteria: "Velero is deployed and healthy" and
"at least one backup completes successfully, restore test passes".

The `defaultVolumesToFsBackup` silent-skip (§3.1) is worth a note for whoever deploys this on a real cluster: use the
explicit `backup.velero.io/backup-volumes` annotation per workload rather than the global flag, since the global flag
was observed to silently exclude a PVC volume with zero error or warning — a false sense of "everything's covered"
otherwise.

Everything in §3.2 (hostPath exclusion, the static local-PV workaround) is a kind-sandbox-only concern.
`proxmox-csi-plugin` PVs are genuinely CSI-typed, so this doesn't recur on `lungmen.akn`.

### 8.1 Not answered by this POC

- **CSI-snapshot incremental backups** — #1054's other acceptance-criteria item. Needs the real Proxmox CSI driver's
  `VolumeSnapshotClass`; no local stand-in reproduces it faithfully enough to be worth building. Validate directly on
  `lungmen.akn` once the baseline (this POC's Kopia path) is deployed there.
- **Restore into a different cluster/namespace** — this POC restores into the same cluster it backed up from. #1054
  doesn't require cross-cluster restore, so not tested.
- **Backup of a real CNPG cluster** (vs. a plain Postgres StatefulSet) — CNPG's own backup/WAL-archiving machinery may
  interact with a concurrent Kopia snapshot differently (e.g. needing pre/post hooks to fsfreeze). Worth a follow-up
  check before relying on this for `lungmen.akn`'s actual CNPG clusters.

### 8.2 Deferred

- **Reusable ArgoCD Application packaging** (#1054 AC item 5) — this POC used raw manifests/Helm CLI for speed; an
  ArgoCD-managed `Application` + per-cluster `velero.helmvalues/` overlay (matching this repo's `<chart>.helmvalues/`
  convention) is the next step once the approach above is confirmed on real infra.
- **Real S3 backup target** (MinIO already deployed in the homelab, or Backblaze B2) — this POC's in-cluster MinIO is
  throwaway; the real deployment needs a persistent, external bucket per #1054's acceptance criteria.

### 8.3 References

- Issue: [#1054](https://github.com/chezmoidotsh/arcane/issues/1054)
- Related: [#1051](https://github.com/chezmoidotsh/arcane/issues/1051) (EXP-2026-005, Proxmox CSI snapshotter requires
  `root@pam` — the reason this POC exists), [#1028](https://github.com/chezmoidotsh/arcane/issues/1028)
  (proxmox-csi-plugin rollout), [#1188](https://github.com/chezmoidotsh/arcane/issues/1188) (lungmen.akn recreation —
  the eventual real-cluster target for this backup strategy)
- Velero docs: <https://velero.io/docs/main/file-system-backup/>
- Velero fs-backup hostPath limitation: `pkg/podvolume/backupper.go` (vmware-tanzu/velero, tag v1.18.1)
- Proxmox CSI/CCM precedent: `docs/experiments/20260617-proxmox-csi-ccm/`

---

## 9. Actionable Next Steps

- Deploy this same Kopia-backend Velero configuration on `lungmen.akn` against a real S3 target (MinIO or B2), with the
  `backup.velero.io/backup-volumes` annotation pattern from §3.1, and repeat the backup/restore validation against a
  real app's PVC.
- Separately validate the CSI-snapshot path directly on `lungmen.akn` once `proxmox-csi-plugin` is live there — no local
  stand-in for this, see [§8.1](#81-not-answered-by-this-poc).
- Package as a reusable ArgoCD Application per #1054 AC item 5, once the above is confirmed.
