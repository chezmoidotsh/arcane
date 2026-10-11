# Velero PVC backup (Kopia) - local POC

Disposable proof of concept (EXP-2026-007, issue #1054): back up a PVC-backed Postgres with Velero's Kopia file-system
backend, delete it, restore it, and check the data came back. Runs in a local kind cluster with MinIO as the S3 target;
touches no real cluster or credential.

Write-up (FR):
[Experimentation-2026-08-03-Sauvegarde-de-PVC-avec-Velero.md](../Experimentation-2026-08-03-Sauvegarde-de-PVC-avec-Velero.md)

## Contents

| Path                               | Purpose                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `manifests/minio.yaml`             | Single-node MinIO + bucket-creation Job (S3 target)                |
| `manifests/velero-helmvalues.yaml` | Velero Helm values (Kopia backend, MinIO `backupStorageLocation`)  |
| `manifests/test-app.yaml`          | `manual` StorageClass, static `local` PV, Postgres StatefulSet     |
| `scripts/bootstrap.sh`             | Create the kind cluster and deploy everything (idempotent)         |
| `scripts/validate.sh`              | Backup, delete namespace, restore, check the marker row (7 checks) |
| `scripts/teardown.sh`              | Delete the kind cluster                                            |

## Usage

```sh
mise run poc:bootstrap
mise run poc:validate
mise run poc:teardown
```
