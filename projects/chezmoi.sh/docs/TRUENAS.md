<h1 align="center">
  <picture>
    <img alt="TrueNAS SCALE logo" src="assets/icons/hardware/truenas-scale.svg" width="201">
  </picture>
</h1>

<h4 align="center">TrueNAS SCALE - Home NAS</h4>

---

> [!NOTE]
> This document is **auto-generated** from the `chezmoi-sh-infra` Pulumi stack's
> own live state — do not edit it by hand. Regenerate it with
> `mise run truenas:docs:generate` (already chained onto `mise run pulumi:apply`).

`nas.chezmoi.sh` is the household NAS. Its sole role is **data storage**: the
media library (films, series, anime, music, books), personal documents and home
archives, data volumes for select self-hosted applications (Immich,
Paperless-ngx, Silverbullet), and backup targets — including database dumps
pushed to S3.

The only services it runs beyond plain file storage are
[Garage](https://garagehq.deuxfleurs.fr/), an S3-compatible object store —
TrueNAS SCALE has no native S3, so Garage fills that gap — and a small internal
reverse proxy (Nginx Proxy Manager). Both stay in the data-serving domain, not
application hosting; see "Applications" below.

It runs as a TrueNAS SCALE virtual machine on Proxmox, with
2 ZFS pools detailed
in the section below, plus an off-site copy of the data pushed to Backblaze B2.

## Quick reference

| I need to… | Go to |
| --- | --- |
| Deploy a change to the NAS | [How it's managed](#how-its-managed) |
| Find a dataset, its quota or encryption | [Pools, disks & datasets](#pools-disks--datasets) |
| Add a dataset or a share | [Add a dataset or a share](#add-a-dataset-or-a-share) |
| Set or fix permissions on a dataset | [Permissions](#permissions) |
| Recover a deleted or overwritten file | [Recover a file from a snapshot](#recover-a-file-from-a-snapshot) |
| See what is backed up, where, and when | [Backups](#backups) |
| Understand Garage (S3) and what depends on it | [Applications](#applications-garage--nginx-proxy-manager) |
| Rebuild the NAS after losing the VM | [Rebuild the NAS](#rebuild-the-nas) |

## How it's managed

`nas.chezmoi.sh` (TrueNAS SCALE) is managed as code via the
[`chezmoi-sh-infra`](../src/infrastructure/pulumi/) Pulumi stack.

```sh
mise run pulumi:diff              # preview pending changes
mise run pulumi:apply             # apply changes (regenerates this doc automatically)
mise run truenas:docs:generate    # regenerate this document only
```

Any change to the NAS (datasets, shares, users, snapshots, …) is declared in
the stack above and applied through Pulumi. Applying the stack also regenerates
this document — there is normally no reason to run the generator by hand.

## Network & services

`nas.chezmoi.sh` sits behind gateway `10.0.0.1` and resolves
DNS through 10.0.0.1 and 9.9.9.9. Its physical interfaces:
- `ens18` at `10.0.0.30/22`, `10.0.0.31/22` _(MTU 1500)_
- `ens27` at `172.31.255.253/30` _(MTU 1500)_

The NAS exposes only the protocols it needs: cifs, nfs and ssh
are enabled; ftp, iscsitarget, snmp and ups stay off.


## Pools, disks & datasets

Each pool below is a set of mirrored or RAIDZ disk groups (vdevs) that TrueNAS
already manages physically -- Pulumi never creates or resizes a pool, it only
manages the ZFS datasets carved out of it. The diagram under each pool name is
its live vdev/disk layout, fetched straight from the NAS rather than declared
anywhere in code; the tree under that lists every dataset Pulumi manages in
that pool, with its quota, encryption and purpose where relevant. The
4-character code under each disk identifies its *model* (a stable hash), so
two identical disks deliberately share the same code.

### `zp1cs01`

Physical layout, as reported live by the NAS:

```text
─────[ DATA ]─────
┌────────────────┐
│  MIRROR - 4To  │
│┌──────┐┌──────┐│
││ DISK ││ DISK ││
││ HDD  ││ HDD  ││
││ 4To  ││ 4To  ││
│└──────┘└──────┘│
│  92f7    8918  │
└────────────────┘
```

Datasets carved out of `zp1cs01`:

```text
zp1cs01
└─ media         Bibliothèque multimédia du foyer
   ├─ animes     Séries animées
   ├─ books      Livres
   ├─ movies     Films
   ├─ musics     Musiques
   └─ tvshows    Séries TV
```

### `zp1hs01`

Physical layout, as reported live by the NAS:

```text
────────[ DATA ]────────
┌──────────────────────┐
│   MIRROR - 996.4Go   │
│┌─────────┐┌─────────┐│
││  DISK   ││  DISK   ││
││   SSD   ││   SSD   ││
││ 996.4Go ││ 996.4Go ││
│└─────────┘└─────────┘│
│   74c4       74c4    │
└──────────────────────┘
```

Datasets carved out of `zp1hs01`:

```text
zp1hs01
├─ applications                                       Applications hébergées : natives (TrueNAS Apps) et Kubernetes (lungmen.akn)
│  ├─ immich                    quota=50Gi            Immich (TrueNAS Apps) -- ancienne instance, voir managed/app.immich
│  ├─ managed                   encrypted             Applications Kubernetes montées en SMB
│  │  ├─ app.immich             quota=50Gi,encrypted  Immich (Kubernetes)
│  │  └─ com.paperless-ngx      quota=10Gi,encrypted  Paperless-ngx (Kubernetes)
│  ├─ paperless                 quota=10Gi,encrypted  Paperless (TrueNAS Apps) -- ancienne instance, voir managed/com.paperless-ngx
│  ├─ silverbullet              quota=5Gi,encrypted   Silverbullet (TrueNAS Apps)
│  └─ truenas                   encrypted             Services internes à TrueNAS lui-même
│     ├─ com.nginxproxymanager  encrypted             Reverse-proxy interne (NPM)
│     └─ fr.deuxfleurs.garage   encrypted             Backend S3 Garage
├─ backups                      quota=100Gi           Cibles de sauvegarde locales
│  └─ hass.chezmoi.sh                                 Sauvegardes Home Assistant
├─ documents                    encrypted             Ancien espace documents -- remplacé par userspace
└─ userspace                    encrypted             Espaces utilisateurs (remplace documents)
   └─ shared                    encrypted             Espace partagé entre utilisateurs
```


## Applications (Garage & Nginx Proxy Manager)

The stack ([`stack/truenas/apps.ts`](../src/infrastructure/pulumi/stack/truenas/apps.ts))
manages the TrueNAS App catalog itself plus two _Apps_:

- **[Garage](https://garagehq.deuxfleurs.fr/)** — the homelab's S3-compatible
  object store (`s3.chezmoi.sh`), backed by the
  `zp1hs01/applications/truenas/fr.deuxfleurs.garage` dataset. Beyond database
  dumps, it holds the **Pulumi state of every stack in this repository**
  (`s3://pulumi-states` — see
  [`INF-20260705-00.pulumi-state-and-import.md`](../../../docs/procedures/infrastructure/INF-20260705-00.pulumi-state-and-import.md)):
  while Garage is down, no `pulumi` command can run anywhere. Its dataset is
  covered by the daily off-site sync in [Backups](#backups), Layer 3.
- **Nginx Proxy Manager** — the NAS-internal reverse proxy, backed by
  `zp1hs01/applications/truenas/com.nginxproxymanager`.

App chart _versions_ are deliberately left unpinned — TrueNAS SCALE updates
them on its own schedule via the UI — but their configuration (chart values,
credentials, mounts) is owned by the stack. Any other app installed on the NAS
is not managed here.

## Shares

SMB is the only share protocol in use right now -- covering Windows/macOS
clients, application storage, and Time Machine.

### SMB

> [!NOTE]
> Each share applies one of TrueNAS's presets:
>
> - **`DEFAULT_SHARE`** — the general-purpose preset.
> - **`LEGACY_SHARE`** — skips presets entirely (options are set manually, not a sign the share is deprecated).
> - **`PRIVATE_DATASETS_SHARE`** — meant for one dataset per user.
> - **`TIMEMACHINE_SHARE`** — enables the SMB extensions macOS Time Machine needs.

- `smb-share-animes` (Accès aux animés de la médiathèque) — **LEGACY_SHARE**
- `smb-share-application-immich` (Stockage applicatif Immich (Kubernetes)) — **LEGACY_SHARE**
- `smb-share-application-paperless` (Stockage applicatif Paperless-ngx (Kubernetes)) — **LEGACY_SHARE**
- `smb-share-films` (Accès aux films de la médiathèque) — **LEGACY_SHARE**
- `smb-share-hass-chezmoi-sh` (Sauvegardes Home Assistant) — **DEFAULT_SHARE**
- `smb-share-livres` (Accès aux livres de la médiathèque) — **DEFAULT_SHARE**
- `smb-share-mes-documents` (Documents personnels) — **PRIVATE_DATASETS_SHARE**
- `smb-share-musique` (Accès aux musiques de la médiathèque) — **DEFAULT_SHARE**
- `smb-share-series-tv` (Accès aux séries TV/streaming de la médiathèque) — **LEGACY_SHARE**
- `smb-share-shared-documents` (Documents partagés) — **LEGACY_SHARE**


## Permissions

> [!WARNING]
> This stack cannot apply filesystem ACLs to a dataset -- `truenas.FilesystemAcl`
> only works for POSIX1E through this provider; NFS4 entries built from its
> schema are rejected outright by the NAS's own API. It manages the NFS4 ACL
> *templates* below instead (named presets, visible in the TrueNAS UI's ACL
> editor) and documents which one to apply, by hand, to which dataset. Datasets
> not listed in the assignment table keep whatever ACL is already set on the
> NAS -- Pulumi doesn't manage them.

### Identities

<div align="center">

| Username | UID | GID | SMB |
| --- | --- | --- | --- |
| `firesticktv` | 3000 | 140 | yes |
| `home-assistant` | 30001 | 137 | yes |
| `immich` | 30002 | 136 | yes |
| `jellyfin` | 30004 | 141 | yes |
| `paperless` | 30003 | 138 | yes |

</div>

### NFS4 ACL templates

<div align="center">

| Name | ACL type | Grants |
| --- | --- | --- |
| `NFSV4_MANAGED_APPLICATION` | NFS4 | Owner gets read+write, nobody else has any access. For service accounts this stack manages itself (Home Assistant, Immich, Paperless-ngx), as opposed to TrueNAS's own Apps feature. |
| `NFSV4_SMB_ALL` | NFS4 | Every local SMB account (TrueNAS's built-in `builtin_users` group) gets read+write. For datasets with no single dedicated owner. |
| `NFSV4_SMB_MEDIA` | NFS4 | Like NFSV4_SMB_ALL (every local SMB account gets read+write), except FireStickTV and Jellyfin are pinned to read-only -- both only ever consume the media library, never write to it. |
| `NFSV4_SMB_VIEWER` | NFS4 | Owner gets read+write; every other local SMB account (`builtin_users`) gets read-only. |
| `NFSV4_TRUENAS_APPLICATION` | NFS4 | Only TrueNAS's own `apps` service account gets read+write. For datasets backing TrueNAS's native Apps feature, not applications this stack manages itself. |

</div>

### Dataset → template assignment

Apply the matching template to each dataset below via the TrueNAS UI's ACL
editor: `Storage` → `Datasets` → select the dataset → `Edit Permissions` →
set `ACL Type` to `NFSv4` → `Use ACL Preset`.

<div align="center">

| Dataset | Template to apply |
| --- | --- |
| `zp1cs01/media` | `NFSV4_SMB_MEDIA` |
| `zp1hs01/userspace/shared` | `NFSV4_SMB_ALL` |
| `zp1hs01/backups/hass.chezmoi.sh` | `NFSV4_MANAGED_APPLICATION` |
| `zp1hs01/applications/managed/app.immich` | `NFSV4_MANAGED_APPLICATION` |
| `zp1hs01/applications/managed/com.paperless-ngx` | `NFSV4_MANAGED_APPLICATION` |

</div>

## Backups

`nas.chezmoi.sh` protects its data through three independent layers, each
covering a different failure mode: bitrot (Layer 1), accidental deletion
(Layer 2), and total site loss (Layer 3).

### Layer 1: Bitrot detection (scrubbing)

A scrub reads every block stored in a pool and verifies its checksum against
ZFS's own metadata, repairing corruption automatically when the pool has
redundancy (mirror or RAID-Z). It's the first, local line of defense against
silent disk decay.

- **Each Sunday at 00:00**:
  scrub `zp1cs01` (35-day alert threshold)
- **Each Sunday at 00:00**:
  scrub `zp1hs01` (35-day alert threshold)

### Layer 2: Accidental-deletion protection (snapshots)

A snapshot is an instant, read-only, point-in-time copy of a dataset,
consuming disk space only for data that changes after it's taken. It
protects against an accidentally deleted or overwritten file -- not against
losing the NAS itself.

- **Each Sunday at 03:00**:
  recursive snapshot of `zp1hs01` (whole pool),
  4-week retention
- **Each day at 00:00**:
  snapshot of `zp1hs01/applications/managed/app.immich`,
  8-day retention
- **Each day at 00:00**:
  snapshot of `zp1hs01/applications/managed/com.paperless-ngx`,
  8-day retention

### Layer 3: Site-loss protection (remote sync)

Selected datasets are pushed off-site to Backblaze B2, split
across private buckets (older versions are pruned after each bucket's
lifecycle window):

#### Where are the backups stored
- `nas-backup-4e6b1351` -- file lock **deliberately neutralized** (enabled with no
  default retention -- a retention hold would block the SYNC jobs below from
  pruning superseded versions; see `stack/truenas/cloudsync.ts`),
  60-day lifecycle prune.
- `nas-backup-50a30f2b` -- file lock **deliberately neutralized** (enabled with no
  default retention -- a retention hold would block the SYNC jobs below from
  pruning superseded versions; see `stack/truenas/cloudsync.ts`),
  60-day lifecycle prune.


#### What is backed up and when
- **Each Sunday at 02:00**:
  B2 — Weekly sync of immich.app application on `/mnt/zp1hs01/applications/managed/app.immich` (PUSH & SYNC)
- **Each Sunday at 02:00**:
  B2 — Weekly sync of paperless-ngx.com application on `/mnt/zp1hs01/applications/managed/com.paperless-ngx` (PUSH & SYNC)
- **Each day at 01:00**:
  B2 — Daily sync of TrueNAS applications on `/mnt/zp1hs01/applications/truenas` (PUSH & SYNC)
- **Each day at 01:00**:
  B2 — Daily sync of users' spaces (shared excluded) on `/mnt/zp1hs01/userspace` (PUSH & SYNC)
- **Each Sunday at 02:00**:
  legacy whole-pool sync of `/mnt/zp1hs01`
  (PUSH & SYNC) --
  predates the per-dataset jobs above and overlaps them; **still
  active** (and still paying for the duplicated B2 storage) until it is
  retired

zp1cs01 isn't included in this off-site sync — a
deliberate trade-off, not an oversight: the contents are considered
re-acquirable, so mirror redundancy and the scrubs above are their only
protection. Anything that must survive site loss belongs on a synced dataset.


## Security notes

A few things worth knowing about what this configuration does and doesn't
protect against:

- **Share IP restrictions live entirely on the NAS, not in Pulumi.** Neither
  NFS's `hosts` allowlist (no Kerberos, so this is the only access control
  those shares have) nor SMB's `hostsallow`/`auxsmbconf` are managed here --
  the SMB ones aren't in this provider's schema at all, and NFS's are
  deliberately left alone to match. Whatever's configured directly on the NAS
  is the only source of truth; Pulumi can't detect or revert changes to it.
- **NFS has no per-person access control.** Every NFS share maps all
  connecting clients to one fixed identity (`mapallUser`/`mapallGroup`), so
  RO/RW differentiation only ever happens per-share, never per-person. Where
  per-person access actually matters, the Permissions section above uses SMB
  instead, backed by a real account.
- **Filesystem ACLs are never applied automatically.** The NFS4 ACL
  templates and dataset assignments in the Permissions section above are a
  guide for a human, not something this stack enforces -- `truenas.FilesystemAcl`
  cannot express NFS4 entries through this provider (confirmed against the
  live API), and the templates it *can* manage have no way to be applied to
  a path except by hand, in the TrueNAS UI. Nothing detects or reverts a
  dataset whose actual ACL has drifted from its documented assignment.

## Procedures

### Add a dataset or a share

Declare the dataset in [`stack/truenas/zpools/`](../src/infrastructure/pulumi/stack/truenas/zpools/)
(quota, encryption, comment — the comment is what fills the dataset trees
above) and, if it must be reachable over the network, the share in
[`stack/truenas/shares.ts`](../src/infrastructure/pulumi/stack/truenas/shares.ts),
then `mise run pulumi:apply`. If the dataset needs specific permissions, add
its row to the assignment table (see
[`stack/truenas/acls.ts`](../src/infrastructure/pulumi/stack/truenas/acls.ts))
and apply the template **by hand** in the TrueNAS UI — Pulumi cannot do that
part; see [Permissions](#permissions).

### Recover a file from a snapshot

Snapshots cover `zp1hs01` (see [Backups](#backups), Layer 2). Two
non-destructive ways to get a file back:

- Browse the hidden snapshot directory over SSH and copy the file out:
  `/mnt/<pool>/<dataset>/.zfs/snapshot/<snapshot-name>/…`
- Or from the TrueNAS UI: **Datasets → select the dataset → Snapshots**, then
  clone the snapshot and copy the file from the clone.

Rolling back the whole dataset to a snapshot also exists but **destroys
everything written after it** — reserve it for a dataset-wide incident, not a
single lost file.

### Rebuild the NAS

The NAS VM's system disk is backed up to PBS, but the ZFS pools live on
**passthrough physical disks** — they are not part of the VM backup and
survive independently of the VM.

1. **VM lost, disks intact** — restore the VM from its PBS backup
   ([`PROXMOX-VE.md`, "Restore a guest from backup"](./PROXMOX-VE.md#restore-a-guest-from-backup)),
   re-create the PCI passthrough mappings if the host changed, and the pools
   re-import with all data — Garage (and the Pulumi state) come back with
   `zp1hs01`.
2. **Disks lost too** — reinstall or restore the VM, create fresh pools, then
   pull data back from Backblaze B2 ([Backups](#backups), Layer 3). Only the
   synced datasets come back; anything outside the off-site sync (see the note
   under Layer 3) is gone with the disks.
3. Once Garage is reachable again, `mise run pulumi:apply` reconciles
   datasets, shares, users and apps — then re-apply the ACL templates by hand
   ([Permissions](#permissions)).

## Appendix

### Key terms

TrueNAS SCALE is a NAS operating system built on ZFS, a filesystem that treats data integrity, snapshots, and
storage pooling as first-class features rather than something bolted on with LVM/RAID.

- **Pool** — a group of physical disks combined into one storage unit (mirror, RAID-Z, or a plain stripe), the
  container everything below lives inside. Redundancy and total capacity are pool-level properties.
- **Dataset** — a filesystem within a pool, with its own compression, quota, record size, and permissions, nested
  hierarchically (a dataset's children can override any of those settings). Roughly ZFS's equivalent of a directory
  that's also independently configurable, snapshottable, and shareable.
- **Snapshot** — an instant, read-only, point-in-time copy of a dataset, consuming disk space only for data that
  changes *after* it's taken. Protects against an accidentally deleted or overwritten file, not against losing the
  pool itself.
- **Scrub** — reads every block in a pool and verifies its checksum against ZFS's own metadata, repairing corruption
  automatically when the pool has redundancy. The first, local line of defense against silent disk decay (bitrot).
- **Compression / record size** — per-dataset tunables trading CPU for disk space (compression) and matching the
  filesystem's block size to the workload's typical I/O pattern (record size) — large for sequential media files,
  small for databases or many small files.
- **ACL (NFS4)** — TrueNAS SCALE's native permission model for datasets, richer than classic Unix owner/group/other
  bits — see "Permissions" above for the templates this stack applies.

### References

- [`stack/truenas/README.md`](../src/infrastructure/pulumi/stack/truenas/README.md) — the stack managing this NAS
- [`INF-20260705-00.pulumi-state-and-import.md`](../../../docs/procedures/infrastructure/INF-20260705-00.pulumi-state-and-import.md)
  — the Pulumi state hosted on Garage
- [`PROXMOX-VE.md`](./PROXMOX-VE.md) — the hypervisor this VM runs on
- [`PROXMOX_BACKUP_SERVER.md`](./PROXMOX_BACKUP_SERVER.md) — where the VM's system disk is backed up
