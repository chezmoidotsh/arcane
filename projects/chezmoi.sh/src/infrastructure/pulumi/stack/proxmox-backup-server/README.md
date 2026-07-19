# Proxmox Backup Server (pbs.pve.chezmoi.sh) as Code

This folder contains the Pulumi TypeScript stack that manages `pbs.pve.chezmoi.sh`, a Proxmox Backup Server instance, as
declarative code. It follows the same config-as-code pattern already established for TrueNAS SCALE
([`../truenas/`](../truenas/), `@pulumi/truenas`): the appliance's **operating system is installed manually** (see
"Deployment target" below), and **everything above the OS layer is managed here** through
[`@pulumi/proxmox-backup-server`](../../../../../../catalog/pulumi/sdks/proxmox-backup-server/), a Pulumi provider
dynamically bridged from the [`yavasura/pbs`](https://registry.terraform.io/providers/yavasura/pbs) Terraform provider.

The generated human-facing documentation (including step-by-step Proxmox VE integration instructions) is published at
[`../../../docs/PROXMOX_BACKUP_SERVER.md`](../../../docs/PROXMOX_BACKUP_SERVER.md) (see `toolbox/pbs-docs`'s own
README).

## Deployment target

Proxmox Backup Server ships its own official Debian-based ISO installer and works well as-is — unlike the Nix/LXC
appliance pattern used elsewhere in `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/` (`pve-exporter`,
`observability`, `oci-registry`, `omni`), there is no reason to fight PBS into that mold, and PBS is not officially
supported inside an LXC container (its storage stack expects a full VM or bare metal). The VM itself — disk layout,
network, initial `root@pam` setup — is a manual, one-time install, the same way any vendor-image install is handled in
this repo (see `docs/decisions/015-migrate-crossplane-to-pulumi.md`, "Non-Goals": Proxmox itself stays outside
Pulumi/GitOps). Everything from that point on — datastore, notifications, users/ACLs, prune/verify jobs — is this
stack's job.

## What's managed here

| File/Folder        | Responsibility                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `acme.ts`          | Cloudflare DNS-01 ACME token for `pbs.pve.chezmoi.sh`'s own TLS certificate (PBS's built-in ACME client consumes it directly, no Caddy involved) |
| `datastore.ts`     | Backblaze B2 bucket + application key, the S3 endpoint, and the S3-backed datastore itself                                                       |
| `jobs.ts`          | Prune job (retention policy) and verify job (weekly checksum verification) on the datastore                                                      |
| `notifications.ts` | Webhook notification target routing datastore events to the shared Slack `#notifications` channel                                                |
| `access.ts`        | The `pve-backup@pbs` service account, its API token, and the least-privilege ACL binding Proxmox VE's storage integration uses to push backups   |

### Intentionally not managed via Pulumi

- **The PBS VM/OS itself** (installation, `root@pam` bootstrap, network configuration at the OS level) — see "Deployment
  target" above.
- **The local cache directory's dedicated disk** (attaching, partitioning, formatting, mounting): a Proxmox VE
  virtual-disk/OS operation, out of this provider's reach entirely — see "Bootstrapping" below.
- **Datastore client-side encryption key and paperkey** (`proxmox-backup-client key create`): the `yavasura/pbs`
  provider exposes no resource for this — it is a CLI operation run against the PBS VM itself, with no Pulumi-managed
  input (earlier revisions of this stack generated a passphrase via `random.RandomPassword` to seed it; that added a
  Pulumi-managed secret for no real benefit, since the key material still has to be generated, backed up, and uploaded
  to Proxmox VE by hand regardless — dropped). Same category as TrueNAS's ACME certificates (`../truenas/README.md`,
  "Intentionally not managed via Pulumi").
- **Backup jobs themselves** (which VMs/LXCs get backed up, on what schedule): these are Proxmox VE resources (a
  `vzdump`/PBS storage job configured in Proxmox VE, not in Proxmox Backup Server), and Proxmox VE configuration stays
  manual for the same reason the VM/OS layer does. This stack only prepares the _destination_ PBS is ready to receive
  backups at — `access.ts`'s `pve-backup@pbs` token is what Proxmox VE's `pbs`-type storage entry authenticates with;
  see `../../../docs/PROXMOX_BACKUP_SERVER.md`, "Configuring Proxmox VE to use this datastore", for the exact setup
  steps.
- **The Slack webhook URL itself**: it already exists (shared with observability's Alertmanager) but lives in a
  SOPS-encrypted file outside this stack's reach (this stack runs upstream of any Kubernetes cluster — same constraint
  documented in `../observability.ts`). Copied in by hand as a Pulumi secret; see "Bootstrapping".

## Datastore architecture

A single **S3-backed datastore** (on the pre-provisioned Backblaze B2 bucket) is the _primary_ datastore, rather than a
local bulk datastore synced to B2 by a separate sync job — Proxmox Backup Server ≥3.x supports S3 natively as a
datastore backend, not just as a sync target.

This removes the "does PBS itself need its own backup" question entirely: there is no large local chunk store to
protect. The PBS VM only holds OS state + PBS configuration, both trivially reproducible from the documented ISO install
steps plus a `pulumi up`. The trade-off: restore speed depends on B2 throughput/latency instead of local disk —
acceptable for a homelab RPO/RTO; revisit if a restore drill proves too slow.

`path` is still set on the `Datastore` resource even though the backend is S3 — PBS uses it as the _local chunk cache_
directory on the VM's own disk before upload. It must live on its own dedicated disk, not the OS disk (see
"Bootstrapping" below), and must already exist and be mounted before the first `pulumi up`: the provider doesn't create
it, and `Datastore` creation fails if the path is missing.

The S3 endpoint uses `pathStyle: true` (address the bucket as `endpoint/bucket`, not `bucket.endpoint`) so it doesn't
depend on wildcard DNS/TLS for a bucket subdomain, plus `providerQuirks: ["skip-if-none-match-header"]` to work around a
Backblaze B2 incompatibility with the standard S3 `If-None-Match` header PBS sends on chunk upload — without it, every
chunk write fails.

## Retention policy

`keepDaily=4, keepWeekly=2, keepMonthly=3` (last 4 days, last 2 Sundays, last 3 months), applied by the `pbs.PruneJob`
in `jobs.ts`. This assumes daily backups feeding PBS's chunk-level incremental dedup, which is what makes the monthly
tier affordable — an opaque/compressed backup archive (e.g. a NAS backup blob) may not dedup as well, worth checking
PBS's GC stats after the first few weeks of real backups before committing further.

Verification runs weekly (`pbs.VerifyJob`), deep enough to catch bitrot before the oldest kept daily snapshot is pruned
away. Garbage collection runs off the `Datastore` resource itself (`gcSchedule`, in `datastore.ts`) — there is no
separate GC job resource in this provider.

**Scheduling note:** the three jobs are staggered (prune nightly at 03:00, verify Sundays at 03:30, GC Sundays at 04:00)
to avoid overlapping runs on the same datastore. These times are a reasonable off-peak default, not a measurement of the
actual ad-hoc weekly Proxmox LXC job this stack replaces — confirm that job's current schedule in the Proxmox VE UI and
adjust here if it would otherwise contend with Longhorn/CSI I/O windows on other clusters.

## Access model

`pve-backup@pbs` (`access.ts`) is the only identity Proxmox VE's own `pbs`-type storage integration authenticates as,
via its `pve-storage` API token. It receives two roles on the datastore root, nothing broader — `DatastoreBackup`
(push/restore its own backups) and `DatastoreReader` (list/audit the datastore, needed by `pvesm add pbs`'s own
connectivity check when it fetches the datastore list before creating the storage entry) — mirroring the CCM/CSI
dual-token least-privilege pattern used elsewhere in this repo. No credential in steady-state operation uses `root@pam`.

Each role is granted **twice** — once to the user (`pveBackupUser.userid`), once to the token (`pveBackupTokenId`), four
ACL resources total. Confirmed live: granting a role to only the user, or only the token, both left
`proxmox-backup-client` failing with `missing permissions '...'` even though the "missing" role was correctly scoped to
whichever one it was granted to. Granting the same role to both is what actually works.

**No `Datastore.Prune` on this token, on purpose.** `DatastorePowerUser` would cover both the listing requirement above
and let Proxmox VE's own per-job "keep" retention prune old backups directly — but that permission would live on the
credential `vzdump` uses on every automated backup run. Retention is already handled without it, centrally, by this
datastore's own scheduled `PruneJob` (see "Retention policy" above), which runs server-side and never touches
`pve-backup@pbs`. Granting Prune here would only matter for a Proxmox VE-side retention setting that isn't configured
(see `docs/PROXMOX_BACKUP_SERVER.md`, "Configuring Proxmox VE to use this datastore" — don't set one), and would mean a
compromised Proxmox VE host could delete existing offsite backups, defeating their purpose.

The bootstrap credential this stack's own Pulumi provider authenticates as (`pbs:apiToken`, see "Bootstrapping" below)
is a **separate**, pre-existing credential, created once by hand during the manual VM setup — the same chicken-and-egg
reasoning as `truenas:apiKey` in `../truenas/README.md`: Pulumi cannot create the credential it needs in order to run.

## Bootstrapping

Already done for the current `pbs.pve.chezmoi.sh` instance — kept here as the reference procedure for a fresh install or
disaster recovery. One-time setup, after the PBS VM is installed and reachable:

1. **Attach and mount a dedicated disk for the local chunk cache.** Add a second virtual disk to the PBS VM in Proxmox
   VE (separate from the OS disk — the cache is written to constantly during backups, and isolating that I/O keeps it
   from wearing out or contending with the OS disk), then on the VM:

   ```sh
   mkfs.ext4 /dev/sdb                       # or whichever device the new disk shows up as
   mkdir -p /mnt/datastore/cache
   echo '/dev/sdb  /mnt/datastore/cache  ext4  defaults  0  2' >> /etc/fstab
   mount -a
   ```

   This must exist and be mounted **before** step 4 — `pulumi up` fails to create the `Datastore` resource if
   `/mnt/datastore/cache` (the `path` in `datastore.ts`) doesn't exist yet.

2. **Create a scoped Pulumi-management credential** on the PBS VM (not `root@pam` — e.g. an `admin@pbs` user with an API
   token scoped to what this stack needs to manage: datastores, jobs, notifications, users, ACLs). Set it as Pulumi
   secret config:

   ```sh
   pulumi config set pbs:endpoint https://pbs.pve.chezmoi.sh:8007
   pulumi config set --secret pbs:apiToken 'admin@pbs!pulumi=<token-value>'
   ```

   The provider also accepts a `username`/`password` pair as an alternative to `pbs:apiToken`. Nothing this stack
   currently manages requires it — unlike `../proxmox/`, where Proxmox VE's `/cluster/acme/account` endpoint
   hard-rejects API token auth and username/password is mandatory (see `../proxmox/README.md`, "Bootstrapping", for why
   and for a macOS Keychain-based tutorial on retrieving the password securely). Kept documented here too, deliberately,
   so a future PBS-side resource with the same kind of root-only restriction doesn't require rediscovering that the
   option exists.

   > [!IMPORTANT] If ever needed, supply it as an **environment variable scoped to the single command that needs it —
   > never via `pulumi config set`, not even `--secret`.** That still writes an encrypted blob into the git-tracked
   > `Pulumi.chezmoi_sh.live.yaml`; encrypted-at-rest is not the same as safe to commit. See `../proxmox/README.md`,
   > "Bootstrapping" step 1, for the env-var-only pattern this stack would follow if it ever needs password auth
   > (`PBS_USERNAME`/`PBS_PASSWORD` or whatever the provider's actual env var names turn out to be — verify against the
   > provider before relying on them, they haven't been exercised for this stack yet).

3. **Copy the shared Slack webhook URL** from observability's Alertmanager config
   (`projects/chezmoi.sh/src/infrastructure/proxmox/lxc/observability/secrets/observability.sops.env`) into this stack's
   own secret config:

   ```sh
   pulumi config set --secret pbs:notificationsSlackWebhookUrl <url>
   ```

4. **Run `pulumi up`** (see "Running Pulumi commands" below) to create the datastore, jobs, notification target, and the
   `pve-backup@pbs` access token.

5. **Retrieve the one-time token secret** this run produces and store it in OpenBao (this stack cannot push to Vault
   itself — see `acme.ts`: it runs upstream of any cluster):

   ```sh
   pulumi stack output pveBackupTokenSecret --show-secrets
   ```

6. **Generate the datastore's client-side encryption key** on the PBS VM itself, and record the offline paperkey:

   ```sh
   proxmox-backup-client key create /root/.config/proxmox-backup/backups.key
   proxmox-backup-client key paperkey /root/.config/proxmox-backup/backups.key
   ```

   Choose a strong passphrase when prompted (or `--kdf none` plus tight filesystem permissions if the key file itself is
   already protected at rest — e.g. only readable by root on a disk that's itself encrypted). Store both the keyfile and
   the paperkey printout in OpenBao — losing them makes every backup in the datastore unrecoverable. This key gets
   uploaded once when configuring Proxmox VE's storage entry in the next step; every backup pushed through that entry is
   then encrypted with it automatically.

7. **Configure Proxmox VE's `pbs`-type storage** using the `pveBackupTokenId`/`pveBackupTokenSecret` outputs from step 5
   and the encryption key from step 6 — see
   [`../../../docs/PROXMOX_BACKUP_SERVER.md`](../../../docs/PROXMOX_BACKUP_SERVER.md), "Configuring Proxmox VE to use
   this datastore", for the exact UI/CLI steps, generated per-datastore from this stack's own state.

## Adding or editing a prune/verify job

Both live in `jobs.ts` as standalone `new pbs.PruneJob(...)`/`new pbs.VerifyJob(...)` declarations, each keyed by an
explicit `pruneJobId`/`verifyJobId` and scoped to a `store` (currently the whole datastore). PBS namespaces (path
prefixes within a datastore) aren't used in this stack today — see the PBS provider's own resource docs
(`../../../../../../catalog/pulumi/sdks/proxmox-backup-server/pruneJob.ts` / `verifyJob.ts`, `namespace.ts`) if a future
workload needs scoped retention or per-namespace access control.

## Adding a new notification target or route

`notifications.ts` follows the `WebhookNotification` + `NotificationMatcher` pattern: the target defines _where_ (the
webhook URL, HTTP method, body template), the matcher defines _what gets routed there_ (severities, match mode). PBS's
`notifications.cfg` is a line-oriented config file, so any multi-line `body` value must be base64-encoded before being
handed to the resource — see `notifications.ts`'s own comment on `slackWebhookBody` for why a raw multi-line string gets
rejected with "detected unexpected control character".

To add a second target (e.g. Gotify, SMTP), declare it with the corresponding `pbs.*Notification` resource
(`gotifyNotification.ts`, `smtpNotification.ts`, `sendmailNotification.ts` in the SDK), then either extend the existing
matcher's `targets` array or add a new matcher scoped to different `matchSeverities`/`matchFields`.

## Running Pulumi commands

```bash
cd projects/chezmoi.sh/src/infrastructure/pulumi
mise run pulumi:diff     # Preview pending changes
mise run pulumi:apply    # Apply changes (requires confirmation)
pulumi stack             # Show current stack state
```

See `.agents/skills/` and `AGENTS.md` for commit and PR workflows.
