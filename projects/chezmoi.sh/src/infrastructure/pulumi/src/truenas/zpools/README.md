# TrueNAS ZFS Pools

This directory manages ZFS pool and dataset configuration for nas.chezmoi.sh through Pulumi. It implements a three-layer
backup defense strategy combining local pool maintenance, point-in-time recovery, and off-site replication.

## ZFS Concepts Glossary

**zpool (storage pool)** The top-level container that aggregates physical storage devices (disk drives, SSDs, or virtual
devices) into a single unit. A zpool is the foundation of ZFS storage; all datasets exist within a pool. Think of it as
the logical equivalent of a file system's volume or partition.

**vdev (virtual device)** A logical component of a zpool—typically a physical disk, a RAID group, or a software
arrangement like a mirror or striped set. ZFS organizes vdevs into the zpool, and the pool's data protection and
performance characteristics are determined by how vdevs are configured (mirror, RAID-Z1/Z2/Z3, etc.).

**dataset** A hierarchical container within a zpool that behaves like a file system. Datasets can contain files,
subdirectories, and other datasets (children), inheriting properties from their parent unless explicitly overridden. In
this repository, datasets are created as Pulumi resources and form a tree under each zpool.

**atime (access time)** A metadata property controlling whether ZFS updates the "last access time" of a file whenever it
is read. Disabling atime (atime=off) improves performance by eliminating unnecessary disk writes for every read access;
it is the default on both pools in this repository because the performance benefit outweighs the rarely-needed
access-time tracking.

**compression** A ZFS property that compresses stored data using a specified algorithm (lz4, gzip, zstd, etc.). Both
pools in this repository default to compression=lz4, which offers a good balance between compression ratio and CPU
overhead. Compression is applied at write time and decompression at read time, and it is transparent to applications.

**recordsize** The maximum block size that ZFS writes to disk for a dataset (default 128 KiB). Datasets with larger
files (e.g., video or database files) can benefit from a larger recordsize (e.g., 1 MiB) to reduce fragmentation and
improve I/O efficiency. This repository overrides recordsize to 1M only for the Immich photo dataset because it handles
large media files.

**quota** A limit on the maximum amount of disk space a dataset (including its children) can consume. Quotas are a
safeguard against runaway storage use; they are set on several datasets in this repository to prevent accidental
overallocation.

**scrub** A maintenance operation that reads all data in a pool and verifies checksums against the stored metadata. A
scrub detects and reports bitrot (data decay on disk) but does not repair it in a single-copy pool; it requires
redundancy (mirror or RAID-Z) to repair detected errors. Scrubs are computationally expensive but essential for
long-term data integrity.

**snapshot** A read-only point-in-time copy of a dataset state, taken instantly without copying data. Snapshots can be
used to recover accidentally deleted or modified files, to monitor space usage trends, or as the basis for incremental
backups. Snapshots consume disk space only for changes made after they are taken.

## Backup Strategy: Three-Layer Defense

This repository implements a three-layer backup architecture to protect against data loss:

### Layer 1: Bitrot Detection (ScrubTask)

Both pools run weekly scrub tasks (Sundays at 00:00):

- **zp1cs01** (media pool): scrub threshold 35 days
- **zp1hs01** (apps/backups/documents pool): scrub threshold 35 days

A scrub reads all stored data and verifies checksums against the metadata. If the pool includes redundancy (mirrors or
RAID-Z), ZFS can detect and automatically repair bitrot. The scrub task ensures data integrity is actively monitored and
errors are caught early. This is the _local_ first layer of defense.

### Layer 2: Accidental-Deletion Protection (SnapshotTask)

Only zp1hs01 has an automated snapshot task (daily at 00:00):

- **Recursive**: snapshots the entire zp1hs01 tree and all children
- **Lifetime**: 2 weeks (snapshots are automatically deleted after 14 days)
- **Schedule**: daily
- **Naming scheme**: auto-%Y-%m-%d\_%H-%M (e.g., auto-2026-07-11_00-00)

Snapshots provide point-in-time recovery for accidental deletions, filesystem corruption, or ransomware-like attacks.
They are instant, lightweight copies that consume minimal disk space while they exist. The 2-week retention window
balances recovery options against storage cost. This is the _local_ second layer of defense.

### Layer 3: Site-Loss Protection (CloudSync to Backblaze B2)

The zp1hs01 pool is continuously replicated off-site to Backblaze B2 via CloudSync:

- **Source**: /mnt/zp1hs01 (entire pool)
- **Destination**: nas-backup-50a30f2b bucket on Backblaze B2
- **Schedule**: weekly, Sundays at 00:00
- **Sync mode**: SYNC (one-way, any local deletions are replicated)
- **Protection**: File Lock (Object Lock) in governance mode
  - Uploads become immutable for 7 days against deletion/overwrite
  - The sync credentials have no bypassGovernance capability (even if leaked, cannot immediately delete backups)
  - Lifecycle rules auto-delete superseded file versions after 60 days
  - Account root key retains bypassGovernance for genuine recovery (key escrow)

This off-site copy protects against site loss (fire, theft, complete NAS failure). The File Lock immutability window and
low-privilege credentials provide defense against ransomware or a leaked sync key. This is the _remote_ third layer of
defense.

**Why three layers?**

- Scrubs catch hardware faults early but require pool redundancy to repair
- Snapshots recover from accidental deletion but are lost if the entire NAS fails
- Off-site B2 replication survives site loss but is the slowest to restore from

Together, they address bitrot, user/application errors, and catastrophic hardware/site loss.

## Best Practices & Operational Guidance

### Scrub Scheduling

General ZFS guidance recommends:

- **Consumer HDDs**: weekly or monthly scrubs (higher failure rate, shorter lifespan)
- **Enterprise HDDs**: monthly or quarterly scrubs (more robust)
- **SSDs**: less frequent (wear concern is not the same as HDDs; less bit-rot decay)

This repository runs weekly scrubs on both pools (Sundays at 00:00), which is conservative but appropriate for a
personal homelab with mixed consumer/prosumer hardware. Weekly scrubs ensure early detection of any data decay while
keeping the workload manageable.

### Snapshot Retention Trade-Offs

Snapshots consume disk space only for changed data after the snapshot is taken. The zp1hs01 pool retains 2-week
snapshots:

- **Pro**: 14 days to recover from accidental deletion or corruption
- **Con**: if changes are rapid, snapshot space can accumulate; the 2-week window balances both

Increasing retention to 1 month would cost more disk space but allow recovery from older incidents. Decreasing to 1 week
would free space but narrow the recovery window. The current 2-week retention is a practical middle ground for a
personal NAS.

### Dataset-Specific Configuration Details

**zp1hs01/applications/immich (recordSize=1M)** Immich is a photo management system that handles large media files
(photos, video). The 1 MiB recordsize is set explicitly because larger records reduce fragmentation and improve
throughput for photo/video I/O, outweighing the slightly larger minimum allocation. All other datasets use the 128 KiB
default.

**zp1hs01/applications (atime=off, compression=lz4)** These properties are explicitly set on the applications subtree to
override any pool-wide defaults. While the pool root already inherits these from TrueNAS (not managed by Pulumi), the
explicit declaration ensures consistency if the configuration is ever migrated or re-applied.

**zp1hs01/applications/immich, paperless, silverbullet (quotas)** Each application dataset has a strict quota to prevent
one misbehaving or fast-growing app from consuming all available space:

- Immich: 50 GiB
- Paperless: 10 GiB
- Silverbullet: 5 GiB

Quotas are enforced at write time; once reached, further writes to that dataset fail. This is essential for multi-tenant
NAS scenarios where different apps compete for storage.

### atime/compression Inheritance

Both pools are configured (outside Pulumi) with atime=off and compression=lz4 at the pool root. All datasets inherit
these properties unless explicitly overridden. This design avoids redundant Pulumi declarations—the defaults are set
once in TrueNAS, and Pulumi only declares properties where they differ from the parent.

### Personal Datasets Intentionally Excluded

The zp1hs01/documents subtree exists as a placeholder for personal files (documents/{alexandre,estelle,shared}). These
are not yet managed through Pulumi to avoid exposing personal dataset hierarchies in the infrastructure-as-code
repository. When needed, they can be added as additional dataset entries in the zp1hs01.ts file.

### Filesystem ACLs: NFS4 Templates, Applied by Hand

This stack does not apply a filesystem ACL to any dataset. Two things ruled that out, both confirmed against the live
TrueNAS API rather than assumed from docs:

- `truenas.FilesystemAcl` (the resource that _would_ apply an ACL to a path) only works for `acltype: "POSIX1E"`. NFS4
  entries built from this SDK's `FilesystemAclDacl` type are rejected outright by the NAS's real `filesystem.setacl`
  endpoint -- it requires `type`/`flags` fields and a `perms.BASIC` enum this SDK doesn't expose at all.
- `truenas.FilesystemAclTemplate` (a named preset stored on the NAS, picked manually in the TrueNAS UI's ACL editor)
  _does_ work for NFS4 -- its `aclJson` is a raw string, not constrained by the same schema. But `filesystem.setacl` has
  no field to reference a template by id, so nothing in this provider can apply one to a path. Only a human can, through
  the UI.

Given that, `../acls.ts` manages 4 NFS4 ACL templates (`NFSV4_MANAGED_APPLICATION`, `NFSV4_TRUENAS_APPLICATION`,
`NFSV4_SMB_ALL`, `NFSV4_SMB_VIEWER` -- see that file for what each grants and why), and every managed dataset is paired
with the template it should get, via a `Nfs4AclAssignment` export living next to whatever declared the dataset:

- **No dedicated owner** (`zp1cs01/media`, `zp1hs01/userspace/shared`): the assignment lives in `../acls.ts`.
- **One dedicated service account** (`zp1hs01/backups/hass.chezmoi.sh`,
  `zp1hs01/applications/managed/{app.immich,com.paperless-ngx,...}`): the assignment lives next to that account's
  `truenas.User`, in `../users`. See `../users/README.md` for the shared conventions (UID range, field choices, password
  handling) every account there follows.

`../truenas-docs` turns every `Nfs4AclAssignment` into the Permissions section of the generated `TRUENAS.md` -- that
table is the actual operational instruction (which template to apply to which dataset), since Pulumi can't carry out the
last step itself.

Limitations:

- **Nothing here is enforced.** The dataset -> template table is a guide for a human to follow, not a live state Pulumi
  reconciles. A dataset's actual ACL can drift from its documented assignment indefinitely without this stack noticing.
- `truenas.ShareSmb` has no per-user access-control field (no `validusers`/`hostsallow` equivalent) — every SMB access
  decision is enforced at the filesystem layer (owner/group/mode), never at the share layer.
- NFS shares have no per-person access control at all: NFS here runs AUTH*SYS with `mapallUser`/`mapallGroup` collapsing
  every connecting client to one fixed identity (`../shares.ts`), so RO/RW differentiation is only ever per-\_share*
  (`readonly` flag + `hosts`/`networks` trust), never per-person. Use SMB (backed by a real `truenas.User`) wherever
  per-person access actually matters.
- `zp1hs01/backups/timemachine.apple.com` is unmanaged: TrueNAS's `TIMEMACHINE_SHARE`/`vfs_fruit` does not isolate
  different SMB users' backups from each other on a shared dataset (unlike `userspace/%U` below). Real isolation needs a
  per-user subdataset + share, mirroring the `userspace` pattern.
- `zp1hs01/userspace/%U` is unmanaged: TrueNAS's own dynamic per-connecting-user share mechanism has no fixed path to
  point an ACL at, so it can't be modeled as a static Pulumi resource or assignment.
- `zp1hs01/documents/**` (except the two Paperless NFS shares) stays unmanaged intentionally — see above.

### Scrub/Snapshot Tasks as Plain Resources

Scrub and snapshot tasks are declared as plain Pulumi `truenas.ScrubTask` and `truenas.SnapshotTask` resources alongside
each pool, not as part of the TrueNASPool component abstraction. This is intentional:

- A scrub task targets an entire pool (not a single dataset)
- A snapshot task targets one dataset path + a recursion flag
- The @chezmoi.sh/pulumi-truenas-pool component models datasets, not tasks

Declaring them separately keeps the abstraction boundaries clean and the component API focused on dataset hierarchies.

### Import Pattern

Pools are declared in zp1cs01.ts and zp1hs01.ts but NOT re-exported from an index file. This prevents the zpool
resources themselves from being included in stack outputs (which would be massive). Other files (apps.ts, shares.ts,
truenas-docs/index.ts) import pools directly:

```typescript
import { zp1hs01 } from "./zpools/zp1hs01";
import { zp1cs01 } from "./zpools/zp1cs01";
```

This pattern allows lookups of dataset resources by path while keeping the stack output focused and clean.

## Related Resources

- **Shares**: `../shares.ts` — NFS share declarations tied to specific datasets
- **Apps**: `../apps.ts` — application configurations using datasets for storage
- **Backups**: `../backups.ts` — B2 bucket and CloudSync configuration (File Lock details, lifecycle rules)
- **Documentation**: `../../truenas-docs/index.ts` — auto-generated pool/dataset reference
