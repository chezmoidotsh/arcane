# Proxmox Backup Server (pbs.pve.chezmoi.sh)

> [!NOTE]
> This document is **auto-generated** from the `chezmoi-sh-infra` Pulumi stack's
> own live state — do not edit it by hand. Regenerate it with
> `mise run pbs:docs:generate` (already chained onto `mise run pulumi:apply`).

`pbs.pve.chezmoi.sh` is the household's Proxmox Backup Server, protecting Proxmox VE-hosted VMs and LXC containers
with deduplicated, incremental, checksum-verified backups.

It runs as a dedicated Proxmox VE virtual machine installed from the official ISO — not a Nix/LXC appliance, since
Proxmox Backup Server is not officially supported inside an LXC container — reachable at `https://pbs.pve.chezmoi.sh:8007`, with
1 datastore detailed below.

## Key terms

Proxmox Backup Server (PBS) is a dedicated backup application for Proxmox VE (and, standalone, for any host running
`proxmox-backup-client`): it stores backups as content-addressed, deduplicated chunks rather than opaque archive
files, so a nightly full backup of mostly-unchanged data costs close to nothing in extra space or transfer time.

- **Datastore** — the top-level backup repository: where chunks physically live (a local directory, or here, an S3
  bucket) plus its own retention/GC/notification settings. Everything else below lives inside one.
- **Chunk** — the unit PBS actually stores: backup data is split into content-addressed blocks, and two backups that
  share a block store it only once. This is what makes daily full backups affordable.
- **Prune** — deletes old backup snapshots according to a keep-daily/weekly/monthly/… policy, per datastore. Pruning
  only removes the snapshot *index*; the chunks it referenced are reclaimed separately by GC.
- **Garbage collection (GC)** — walks every remaining snapshot, marks the chunks still referenced, and deletes
  whatever isn't. Runs on its own schedule, after pruning, so it always sees the post-prune reference set.
- **Verify** — re-reads a snapshot's chunks and checks their checksums, catching silent corruption (bitrot, a bad
  disk, a corrupted upload) before it's discovered during an actual restore.
- **Notification target / matcher** — a target is *where* an alert can go (a webhook, SMTP, Gotify, …); a matcher is
  the routing rule deciding *which* events (by severity, job type, …) go to which target(s).

## How it's managed

`pbs.pve.chezmoi.sh` (Proxmox Backup Server) is managed as code via the
[`chezmoi-sh-infra`](../src/infrastructure/pulumi/) Pulumi stack, specifically
[`stack/pbs/`](../src/infrastructure/pulumi/stack/pbs/README.md).

```sh
mise run pulumi:diff           # preview pending changes
mise run pulumi:apply          # apply changes (regenerates this doc automatically)
mise run pbs:docs:generate     # regenerate this document only
```

The VM/OS install itself, the datastore's client-side encryption keyfile, and
the actual per-VM/LXC backup job definitions (Proxmox VE resources) are not
covered here — see
[`stack/pbs/README.md`](../src/infrastructure/pulumi/stack/pbs/README.md),
"Intentionally not managed via Pulumi".

## Datastore

### `Backblaze-B2`

Primary S3-backed datastore (Backblaze B2)

- **Backend**: S3 (Backblaze B2), bucket `pbs-vm-backup-fcc7acb9`, endpoint config `Backblaze-B2`
- **Local cache path**: `/mnt/datastore/cache` — chunk cache only, not the full backup set (see `stack/pbs/README.md`, "Datastore architecture")
- **Garbage collection**: `Sun 04:00`
- **Notification delivery**: notification-system

## Retention & verification

### Prune jobs

- `backups-retention` on `Backblaze-B2`, schedule `Mon..Sun 03:00`: keep-daily=4, keep-weekly=2, keep-monthly=3 — Nightly retention prune

### Verify jobs

- `backups-weekly-verify` on `Backblaze-B2`, schedule `Sun 03:30`, skips backups re-verified within the last 30 days — Weekly checksum verification

## Notifications

### Targets

- `slack-notifications` (Webhook) — Slack #notifications

Target endpoints (URLs, server addresses, …) are deliberately not shown here even though the underlying provider does
not always mark them as secret outputs — see `toolbox/pbs-docs/extract.ts`, `extractNotificationTargets`.

### Routing

- `slack-all-datastore-events`: all of [info, notice, warning and error] → slack-notifications — Routes all datastore prune/verify/GC notifications to Slack

## Access

### Users

- `pve-backup@pbs` — Proxmox VE storage integration -- pushes LXC/VM backups

### API tokens

- `pve-backup@pbs!pve-storage` — Used by Proxmox VE's `pbs`-type storage entry

Token secrets are one-time values Proxmox Backup Server never returns again after creation — never shown here, and
not recoverable from stack state either; see `stack/pbs/README.md`, "Bootstrapping".

### ACLs

| Path | Grantee | Role | Propagates |
| ---- | ------- | ---- | ---------- |
| `/datastore/Backblaze-B2` | `pve-backup@pbs` | `DatastoreReader` | yes |
| `/datastore/Backblaze-B2` | `pve-backup@pbs` | `DatastoreBackup` | yes |
| `/datastore/Backblaze-B2` | `pve-backup@pbs!pve-storage` | `DatastoreBackup` | yes |
| `/datastore/Backblaze-B2` | `pve-backup@pbs!pve-storage` | `DatastoreReader` | yes |

## Configuring Proxmox VE to use this datastore

Once `pve-backup@pbs`'s token exists (`stack/pbs/access.ts`, created during "Bootstrapping"), add each datastore
above as a `pbs`-type storage in Proxmox VE so VMs/LXCs can actually be backed up to it.

### `Backblaze-B2`

**Via the UI**: Datacenter → Storage → Add → Proxmox Backup Server, then:

| Field | Value |
| --- | --- |
| ID | a local name for this storage entry in Proxmox VE, e.g. `pbs-Backblaze-B2` |
| Server | `pbs.pve.chezmoi.sh` |
| Port | `8007` — PVE's "Add: Proxmox Backup Server" dialog defaults this field, but it isn't always applied; leaving it blank on some PVE versions causes `create storage failed: ...: error fetching datastores - 401 Unauthorized` even with correct credentials, so set it explicitly |
| Datastore | `Backblaze-B2` |
| User | `pve-backup@pbs` |
| API Token | the `pveBackupTokenId`/`pveBackupTokenSecret` stack outputs (see `stack/pbs/README.md`, "Bootstrapping") |
| Fingerprint | leave blank — the server has a valid ACME certificate (`stack/pbs/acme.ts`), no manual pinning needed |

**Via the CLI**, equivalent to the above:

```sh
pvesm add pbs pbs-Backblaze-B2 \
  --server pbs.pve.chezmoi.sh \
  --port 8007 \
  --datastore Backblaze-B2 \
  --username pve-backup@pbs \
  --token-id pve-backup@pbs!pve-storage \
  --token-secret <pveBackupTokenSecret>
```

Once the storage entry exists, assign VMs/LXCs to it from Datacenter → Backup → Add, picking this storage and a
schedule — *which* guest gets backed up, and how often, stays a manual Proxmox VE step; see `stack/pbs/README.md`,
"Intentionally not managed via Pulumi", for why.
