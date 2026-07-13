# TrueNAS (`nas.chezmoi.sh`)

> Generated from the deployed `chezmoi-sh-infra` Pulumi stack's own state. Do
> not edit by hand -- regenerate with `mise run truenas:docs:generate`
> (already chained onto `mise run pulumi:apply`).

`nas.chezmoi.sh` is my home NAS: bulk media storage for players on the LAN,
self-hosted application data (Immich, Paperless, Silverbullet, Garage, and the
reverse proxy in front of them), personal and shared documents, and backup
targets for Home Assistant and Time Machine.

It runs as a TrueNAS SCALE virtual machine on Proxmox, with
2 ZFS pools --
`zp1cs01` and `zp1hs01` -- detailed in the section below, plus an off-site copy of
the data pushed to Backblaze B2.

## How it's managed

`nas.chezmoi.sh` (TrueNAS SCALE) is managed as code via the `chezmoi-sh-infra`
Pulumi stack (state in a self-hosted Garage S3 backend). Provider credentials
come from stack config (`truenas:url`), set via `pulumi config set --secret`
-- never hardcoded in source.

## Network & services

`nas.chezmoi.sh` sits behind gateway `10.0.0.1` and resolves
DNS through 10.0.0.1 and 9.9.9.9. Its physical interfaces:
`ens18` at `10.0.0.30/22`, `10.0.0.31/22` (MTU 1500); `ens27` at `172.31.255.253/30` (MTU 1500).

The NAS exposes only the protocols it needs: cifs, nfs and ssh
are enabled; ftp, iscsitarget, snmp and ups stay off.

## Pools, disks & datasets

Each pool below is a set of mirrored or RAIDZ disk groups (vdevs) that TrueNAS
already manages physically -- Pulumi never creates or resizes a pool, it only
manages the ZFS datasets carved out of it. The diagram under each pool name is
its live vdev/disk layout, fetched straight from the NAS rather than declared
anywhere in code; the tree under that lists every dataset Pulumi manages in
that pool, with its quota, encryption and purpose where relevant.

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

## Shares

SMB is the only share protocol in use right now -- covering Windows/macOS
clients, application storage, and Time Machine.

### SMB

Each share below applies one of TrueNAS's presets:

- `DEFAULT_SHARE` -- the general-purpose preset.
- `LEGACY_SHARE` -- skips presets entirely (options are set manually by hand, not a sign the share is deprecated).
- `PRIVATE_DATASETS_SHARE` -- meant for one dataset per user.
- `TIMEMACHINE_SHARE` -- enables the SMB extensions macOS Time Machine needs.

- `smb-share-animes` (Accès aux animés de la médiathèque) -- LEGACY_SHARE
- `smb-share-application-immich` (Stockage applicatif Immich (Kubernetes)) -- LEGACY_SHARE
- `smb-share-application-paperless` (Stockage applicatif Paperless-ngx (Kubernetes)) -- LEGACY_SHARE
- `smb-share-films` (Accès aux films de la médiathèque) -- LEGACY_SHARE
- `smb-share-hass-chezmoi-sh` (Sauvegardes Home Assistant) -- DEFAULT_SHARE
- `smb-share-livres` (Accès aux livres de la médiathèque) -- DEFAULT_SHARE
- `smb-share-mes-documents` (Documents personnels) -- PRIVATE_DATASETS_SHARE
- `smb-share-musique` (Accès aux musiques de la médiathèque) -- DEFAULT_SHARE
- `smb-share-series-tv` (Accès aux séries TV/streaming de la médiathèque) -- LEGACY_SHARE
- `smb-share-shared-documents` (Documents partagés) -- LEGACY_SHARE

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

| Username | UID | GID | SMB |
| --- | --- | --- | --- |
| `firesticktv` | 3000 | 140 | yes |
| `home-assistant` | 30001 | 137 | yes |
| `immich` | 30002 | 136 | yes |
| `jellyfin` | 30004 | 141 | yes |
| `paperless` | 30003 | 138 | yes |

### NFS4 ACL templates

| Name | ACL type | Grants |
| --- | --- | --- |
| `NFSV4_MANAGED_APPLICATION` | NFS4 | Owner gets read+write, nobody else has any access. For service accounts this stack manages itself (Home Assistant, Immich, Paperless-ngx), as opposed to TrueNAS's own Apps feature. |
| `NFSV4_SMB_ALL` | NFS4 | Every local SMB account (TrueNAS's built-in `builtin_users` group) gets read+write. For datasets with no single dedicated owner. |
| `NFSV4_SMB_MEDIA` | NFS4 | Like NFSV4_SMB_ALL (every local SMB account gets read+write), except FireStickTV and Jellyfin are pinned to read-only -- both only ever consume the media library, never write to it. |
| `NFSV4_SMB_VIEWER` | NFS4 | Owner gets read+write; every other local SMB account (`builtin_users`) gets read-only. |
| `NFSV4_TRUENAS_APPLICATION` | NFS4 | Only TrueNAS's own `apps` service account gets read+write. For datasets backing TrueNAS's native Apps feature, not applications this stack manages itself. |

### Dataset → template assignment

> [!NOTE]
> **Why not manage ACLs directly via Pulumi?**
>
> Because the used TrueNAS TF provider doesn't support handle NFS4 ACLs
> properly, this stack cannot apply ACLs to datasets. Instead, it manages the
> templates (named presets) and documents which one to apply to which dataset.

Apply the matching template to each dataset below via the TrueNAS UI's ACL
editor: `Storage` → `Datasets` → select the dataset → `Edit Permissions` →
set `ACL Type` to `NFSv4` → `Use ACL Preset`.

| Dataset | Template to apply |
| --- | --- |
| `zp1cs01/media` | `NFSV4_SMB_MEDIA` |
| `zp1hs01/userspace/shared` | `NFSV4_SMB_ALL` |
| `zp1hs01/backups/hass.chezmoi.sh` | `NFSV4_MANAGED_APPLICATION` |
| `zp1hs01/applications/managed/app.immich` | `NFSV4_MANAGED_APPLICATION` |
| `zp1hs01/applications/managed/com.paperless-ngx` | `NFSV4_MANAGED_APPLICATION` |


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
across private, file lock-protected buckets (immutable for the retention
window below, with older versions pruned after the lifecycle window):

#### Where are the backups stored:
- `nas-backup-4e6b1351` -- 7-day file lock retention, 60-day
  lifecycle prune.
- `nas-backup-50a30f2b` -- 7-day file lock retention, 60-day
  lifecycle prune.


#### What is backed up and when:
- **Each Sunday at 02:00**:
  B2 — Weekly sync of immich.app application on `/mnt/zp1hs01/applications/managed/app.immich` (PUSH & SYNC)
- **Each Sunday at 02:00**:
  B2 — Weekly sync of paperless-ngx.com application on `/mnt/zp1hs01/applications/managed/com.paperless-ngx` (PUSH & SYNC)
- **Each day at 01:00**:
  B2 — Weekly sync of TrueNAS applications on `/mnt/zp1hs01/applications/truenas` (PUSH & SYNC)
- **Each day at 01:00**:
  B2 — Daily sync of users' spaces (shared excluded) on `/mnt/zp1hs01/userspace` (PUSH & SYNC)
- **Each Sunday at 02:00**:
  legacy whole-pool sync of `/mnt/zp1hs01`
  (PUSH & SYNC) --
  kept for reference only

zp1cs01 isn't included in this off-site sync.

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
