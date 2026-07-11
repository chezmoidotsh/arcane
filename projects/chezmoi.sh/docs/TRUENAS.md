# TrueNAS (`nas.chezmoi.sh`)

> Generated from the Pulumi as-code configuration in
> `projects/chezmoi.sh/src/infrastructure/pulumi/src/truenas/` (+ `../backups.ts`
> for B2 off-site backups). Do not edit by hand -- regenerate with a real
> `pulumi up` against the live `chezmoi-sh-infra` stack.

`nas.chezmoi.sh` is the home NAS: bulk media storage for players on the LAN,
self-hosted application data (Immich, Paperless, Silverbullet, Garage, and the
reverse proxy in front of them), personal and shared documents, and backup
targets for Home Assistant and Time Machine. It runs two ZFS pools -- `zp1cs01`
on spinning disks for media, and `zp1hs01` on SSDs for everything that
benefits from lower latency (applications, documents, backups) -- with an
off-site copy of the SSD pool pushed to Backblaze B2.

## How it's managed

`nas.chezmoi.sh` (TrueNAS SCALE) is managed as code via the `chezmoi-sh-infra`
Pulumi stack (state in a self-hosted Garage S3 backend). Provider credentials
come from stack config (`truenas:url` / `truenas:apiKey`), set via
`pulumi config set --secret` -- never hardcoded in source.

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
└─ media                    Dataset TrueNAS réservé pour tout les media (films, animés, musiques, ...)
   ├─ animes                Dataset TrueNAS réservé pour les series animées
   ├─ books                 Dataset TrueNAS réservé pour les livres
   ├─ inbox    quota=500Gi  Dataset TrueNAS réservé pour les média à trier
   ├─ movies                Dataset TrueNAS réservé pour les films
   ├─ musics                Dataset TrueNAS réservé pour les musiques
   └─ tvshows               Dataset TrueNAS réservé pour les series TV
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
├─ applications                                       Dataset TrueNAS réservé pour les applications hébergées
│  ├─ immich                    quota=50Gi            Dataset TrueNAS réservé pour Immich
│  ├─ paperless                 quota=10Gi,encrypted  Dataset TrueNAS réservé pour Paperless
│  ├─ silverbullet              quota=5Gi,encrypted   Dataset TrueNAS réservé pour Silverbullet
│  └─ truenas                   encrypted             Dataset TrueNAS réservé pour les applications hébergées dans TrueNAS
│     ├─ com.nginxproxymanager  encrypted             Dataset TrueNAS réservé pour NPM (proxy)
│     └─ fr.deuxfleurs.garage   encrypted             Dataset TrueNAS réservé pour Garage (S3)
├─ backups                      quota=100Gi           Dataset TrueNAS réservé pour les backups
│  ├─ hass.chezmoi.sh                                 Dataset TrueNAS réservé pour les backups de Home Assistant
│  └─ timemachine.apple.com
└─ documents                    encrypted             Dataset TrueNAS réservé pour les documents (partagés ou personnels)
```

## Shares

NFS is used where a client needs Unix-style permission mapping (media consumers,
Paperless); SMB covers everything else (Windows/macOS clients, application
storage, Time Machine).

### NFS

* `nfs-share-animes` (Dossier partagé des animés) --
  read/write, mapped to `nobody`
* `nfs-share-movies` (Dossier partagé des films) --
  read/write, mapped to `nobody`
* `nfs-share-musics` (Dossier partagé des musiques) --
  read/write, mapped to `nobody`
* `nfs-share-tvshows` (Dossier partagé des séries TVs) --
  read/write, mapped to `nobody`
* `nfs-share-documents-shared` (Dossier partagé de nos documents (Paperless)) --
  read-only, mapped to `paperless-ngx`
* `nfs-share-documents-alexandre-admin` (Documents personnels d'alexandre (Paperless)) --
  read/write, mapped to `paperless-ngx`

### SMB

Each share below applies one of TrueNAS's presets: `DEFAULT_SHARE` is the
general-purpose preset, `LEGACY_SHARE` skips presets entirely (options are
set manually, not a sign the share is deprecated), `PRIVATE_DATASETS_SHARE`
is meant for one dataset per user, and `TIMEMACHINE_SHARE` enables the SMB
extensions macOS Time Machine needs.

* `smb-share-films` (Dossier partagé des films) -- LEGACY\_SHARE
* `smb-share-animes` (Dossier partagé des séries animés) -- LEGACY\_SHARE
* `smb-share-series-tv` (Dossier partagé des séries TV) -- LEGACY\_SHARE
* `smb-share-mes-documents` (Documents personnels) -- PRIVATE\_DATASETS\_SHARE
* `smb-share-public` (Documents partagés) -- DEFAULT\_SHARE
* `smb-share-livres` (Dossier partagé des livres) -- DEFAULT\_SHARE
* `smb-share-hass-chezmoi-sh` (Dossier de backup pour Home Assistant) -- DEFAULT\_SHARE
* `smb-share-cold-media` (RO access to all media (cold backup only)) -- LEGACY\_SHARE, read-only, disabled
* `smb-share-cold-documents` (RO access to all documents (cold backup only)) -- LEGACY\_SHARE, read-only, disabled
* `smb-share-application-immich` (Immich application storage) -- LEGACY\_SHARE
* `smb-share-application-paperless` (Paperless application storage) -- LEGACY\_SHARE
* `smb-share-application-silverbullet` (Silverbullet application storage) -- LEGACY\_SHARE
* `smb-share-timemachine` (Apple Time Machine Backups) -- TIMEMACHINE\_SHARE

## Backups

Off-site copies go to Backblaze B2, in private, File Lock-protected
buckets (immutable for the retention window below, with older versions pruned
after the lifecycle window).

`/mnt/zp1hs01` is pushed there weekly, Sundays at 00:00
via TrueNAS CloudSync (PUSH/SYNC), with a
7-day File Lock retention and a 60-day
lifecycle prune.
The second bucket, `garage-backup-51891f906ced`, holds the same 7-day File Lock /
60-day lifecycle protection, but is replicated by Garage
itself rather than through a Pulumi-managed CloudSync task.
zp1cs01 isn't included in this off-site sync.

## Security notes

A few things worth knowing about what this configuration does and doesn't
protect against:

* **Share IP restrictions live entirely on the NAS, not in Pulumi.** Neither
  NFS's `hosts` allowlist (no Kerberos, so this is the only access control
  those shares have) nor SMB's `hostsallow`/`auxsmbconf` are managed here --
  the SMB ones aren't in this provider's schema at all, and NFS's are
  deliberately left alone to match. Whatever's configured directly on the NAS
  is the only source of truth; Pulumi can't detect or revert changes to it.
