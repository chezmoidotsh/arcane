# Proxmox Backup Server (pbs.pve.chezmoi.sh)

> [!NOTE]
> This document is **auto-generated** from the `chezmoi-sh-infra` Pulumi stack's
> own live state — do not edit it by hand. Regenerate it with
> `mise run proxmox-backup-server:docs:generate` (already chained onto `mise run pulumi:apply`).

`pbs.pve.chezmoi.sh` is the household's Proxmox Backup Server, protecting Proxmox VE-hosted VMs and LXC containers
with deduplicated, incremental, checksum-verified backups.

It runs as a dedicated Proxmox VE virtual machine installed from the official ISO — not a Nix/LXC appliance, since
Proxmox Backup Server is not officially supported inside an LXC container — reachable at `https://pbs.pve.chezmoi.sh:8007`, with
1 datastore detailed below.

## Quick reference

| I need to… | Go to |
| --- | --- |
| Deploy a change to this server | [How it's managed](#how-its-managed) |
| Check what retention actually applies | [Retention & verification](#retention--verification) |
| Restore a VM or LXC from backup | [Restore a backup](#restore-a-backup) |
| Register the datastore in Proxmox VE | [Configuring Proxmox VE to use this datastore](#configuring-proxmox-ve-to-use-this-datastore) |
| Rotate the Proxmox VE storage token | [Rotate the Proxmox VE storage token](#rotate-the-proxmox-ve-storage-token) |
| Recover after losing the PBS VM | [Rebuild the server](#rebuild-the-server) |

## How it's managed

`pbs.pve.chezmoi.sh` (Proxmox Backup Server) is managed as code via the
[`chezmoi-sh-infra`](../src/infrastructure/pulumi/) Pulumi stack, specifically
[`stack/proxmox-backup-server/`](../src/infrastructure/pulumi/stack/proxmox-backup-server/README.md).

```sh
mise run pulumi:diff           # preview pending changes
mise run pulumi:apply          # apply changes (regenerates this doc automatically)
mise run proxmox-backup-server:docs:generate     # regenerate this document only
```

Backups are **encrypted client-side** by Proxmox VE before they ever reach this server: without the encryption key,
nothing in the datastore is restorable. The keyfile and its paperkey are stored in OpenBao (`vault.chezmoi.sh`) — see
[`stack/proxmox-backup-server/README.md`](../src/infrastructure/pulumi/stack/proxmox-backup-server/README.md),
"Bootstrapping", step 6.

The VM/OS install itself, the encryption keyfile, and the actual per-VM/LXC backup job definitions (Proxmox VE
resources) are not covered here — see
[`stack/proxmox-backup-server/README.md`](../src/infrastructure/pulumi/stack/proxmox-backup-server/README.md),
"Intentionally not managed via Pulumi".

## Datastore

### `Backblaze-B2`

Primary S3-backed datastore (Backblaze B2)

- **Backend**: S3 (Backblaze B2), bucket `pbs-vm-backup-fcc7acb9`, endpoint config `Backblaze-B2`
- **Local cache path**: `/mnt/datastore/cache` — chunk cache only, not the full backup set (see `stack/proxmox-backup-server/README.md`, "Datastore architecture")
- **Garbage collection**: `Sun 04:00`
- **Notification delivery**: `notification-system` — the datastore's notification _mode_, not a target; where events
  actually go is decided by the notification targets and matchers below

## Retention & verification

### Prune jobs

- `backups-retention` on `Backblaze-B2`, schedule `Mon..Sun 03:00`: keep-daily=4, keep-weekly=2, keep-monthly=3 — Nightly retention prune

### Verify jobs

- `backups-weekly-verify` on `Backblaze-B2`, schedule `Sun 03:30`, skips backups already verified — Weekly checksum verification of new backups

## Notifications

### Targets

- `slack-notifications` (Webhook) — Slack #notifications

Target endpoints (URLs, server addresses, …) are deliberately not shown here even though the underlying provider does
not always mark them as secret outputs — see `toolbox/proxmox-backup-server-docs/extract.ts`, `extractNotificationTargets`.

### Routing

- `slack-all-datastore-events`: all of [info, notice, warning and error] → slack-notifications — Routes all datastore prune/verify/GC notifications to Slack

## Access

### Users

- `pve-backup@pbs` — Proxmox VE storage integration -- pushes LXC/VM backups

### API tokens

- `pve-backup@pbs!pve-storage` — Used by Proxmox VE's `pbs`-type storage entry

Token secrets are one-time values Proxmox Backup Server never returns again after creation — never shown here, and
not recoverable from stack state either; see `stack/proxmox-backup-server/README.md`, "Bootstrapping".

### ACLs

| Path | Grantee | Role | Propagates |
| ---- | ------- | ---- | ---------- |
| `/datastore/Backblaze-B2` | `pve-backup@pbs` | `DatastoreReader` | yes |
| `/datastore/Backblaze-B2` | `pve-backup@pbs` | `DatastoreBackup` | yes |
| `/datastore/Backblaze-B2` | `pve-backup@pbs!pve-storage` | `DatastoreBackup` | yes |
| `/datastore/Backblaze-B2` | `pve-backup@pbs!pve-storage` | `DatastoreReader` | yes |

## Configuring Proxmox VE to use this datastore

Once `pve-backup@pbs`'s token exists (`stack/proxmox-backup-server/access.ts`, created during "Bootstrapping"), add each datastore
above as a `pbs`-type storage in Proxmox VE so VMs/LXCs can actually be backed up to it.

### Add `Backblaze-B2` to Proxmox VE

**Via the UI**: Datacenter → Storage → Add → Proxmox Backup Server, then:

| Field | Value |
| --- | --- |
| ID | a local name for this storage entry in Proxmox VE, e.g. `pbs-Backblaze-B2` |
| Server | `pbs.pve.chezmoi.sh` |
| Port | `8007` — PVE's "Add: Proxmox Backup Server" dialog defaults this field, but it isn't always applied; leaving it blank on some PVE versions causes `create storage failed: ...: error fetching datastores - 401 Unauthorized` even with correct credentials, so set it explicitly |
| Datastore | `Backblaze-B2` |
| User | `pve-backup@pbs` |
| API Token | the `pveBackupTokenId`/`pveBackupTokenSecret` stack outputs (see `stack/proxmox-backup-server/README.md`, "Bootstrapping") |
| Fingerprint | leave blank — the server has a valid ACME certificate (`stack/proxmox-backup-server/acme.ts`), no manual pinning needed |

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
schedule — *which* guest gets backed up, and how often, stays a manual Proxmox VE step; see `stack/proxmox-backup-server/README.md`,
"Intentionally not managed via Pulumi", for why.

**Do not set a "Prune Backups" / keep-retention policy on this storage entry or on the backup job.** `pve-backup@pbs`
deliberately has no `Datastore.Prune` permission (see `stack/proxmox-backup-server/access.ts`) — retention is already handled centrally
by this datastore's own `Prune jobs`, above, which run server-side under PBS's own scheduling and don't depend on the
Proxmox VE token at all. A per-job retention setting here would need `Datastore.Prune` on the token to work, which
would let a compromised Proxmox VE host delete existing offsite backups — the credential automated `vzdump` runs use
is a poor place to hold that permission.

## Procedures

### Restore a backup

Restores are driven from Proxmox VE, not from this server — the `pbs`-type storage entry there lists every snapshot
this datastore holds. Follow
[`PROXMOX-VE.md`, "Restore a guest from backup"](./PROXMOX-VE.md#restore-a-guest-from-backup). Restores need the
client-side encryption key configured on the Proxmox VE host; if it is missing (fresh host), restore it from OpenBao
first — see [How it's managed](#how-its-managed).

### Rotate the Proxmox VE storage token

The `pve-backup@pbs!pve-storage` token is a stack-owned resource, so rotation is a stack operation. Taint it, apply,
and retrieve the new one-time secret:

```sh
cd projects/chezmoi.sh/src/infrastructure/pulumi
urn=$(pulumi stack export | jq -re '
  .deployment.resources[]
  | select(.urn | endswith("::pbs-token-pve-backup"))
  | .urn
')
pulumi state taint "$urn" --yes
pulumi up --refresh
pulumi stack output pveBackupTokenSecret --show-secrets   # the new one-time secret
```

Then update Proxmox VE's storage entry with the new secret — the same API-token field used in
[Configuring Proxmox VE to use this datastore](#configuring-proxmox-ve-to-use-this-datastore). Until that is done,
every scheduled backup from Proxmox VE fails authentication.

### Rebuild the server

Losing the PBS VM loses **no backups**: the datastore is S3-backed, so the VM only holds OS state and PBS
configuration, both reproducible. Reinstall from the official ISO, then follow
[`stack/proxmox-backup-server/README.md`](../src/infrastructure/pulumi/stack/proxmox-backup-server/README.md),
"Bootstrapping", end to end — it is written as the disaster-recovery reference: dedicated cache disk, scoped Pulumi
credential, `pulumi up`, encryption key, and re-registration of the storage entry in Proxmox VE.

## Appendix

### Key terms

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

### References

- [`stack/proxmox-backup-server/README.md`](../src/infrastructure/pulumi/stack/proxmox-backup-server/README.md) — the
  stack managing this server, its datastore architecture, and the bootstrapping / DR procedure
- [`PROXMOX-VE.md`](./PROXMOX-VE.md) — the hypervisor pushing backups here (and where restores are driven from)
- [`INF-20260705-00.pulumi-state-and-import.md`](../../../docs/procedures/infrastructure/INF-20260705-00.pulumi-state-and-import.md)
  — where the Pulumi state itself lives
