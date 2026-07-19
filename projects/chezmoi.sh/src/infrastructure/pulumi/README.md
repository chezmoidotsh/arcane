# chezmoi.sh Shared Infrastructure (`chezmoi-sh-infra`)

The Pulumi TypeScript stack managing shared cloud infrastructure for chezmoi.sh: Cloudflare and Tailscale API tokens,
Backblaze B2 buckets, the TrueNAS SCALE server `nas.chezmoi.sh`, the Proxmox Backup Server `pbs.pve.chezmoi.sh`, and a
narrow, deliberately scoped slice of the Proxmox VE host `pve-01.pve.chezmoi.sh` itself (ACLs, SDN, backup-storage
registration, resource pools, ACME) as code. State lives in the Garage S3 backend (`s3://pulumi-states`, see
`Pulumi.yaml`); the generated TrueNAS reference is published at [`../../../docs/TRUENAS.md`](../../../docs/TRUENAS.md).

## Directory layout

`stack/` holds Pulumi resources (run by `pulumi up`); `toolbox/` holds standalone tooling that shells out to the
`pulumi` CLI and is never part of a Pulumi run.

| File/Folder                    | Responsibility                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                     | Entry point — side-effect imports of every resource module below (no logic)                                                                                       |
| `config.ts`                    | Pulumi secret config (Cloudflare account/zone IDs, Garage admin credentials)                                                                                      |
| `stack/observability.ts`       | Observability LXC appliance tokens (Cloudflare DNS-01 + Tailscale OAuth)                                                                                          |
| `stack/omni.ts`                | Omni LXC appliance token (Cloudflare DNS-01)                                                                                                                      |
| `stack/zot-registry.ts`        | Zot-registry LXC appliance token (Cloudflare DNS-01)                                                                                                              |
| `stack/truenas/`               | TrueNAS SCALE as code (datasets, shares, users, ACL templates); see [`stack/truenas/README.md`](stack/truenas/README.md)                                          |
| `stack/proxmox-backup-server/` | Proxmox Backup Server as code (datastore, jobs, notifications, access); see [`stack/proxmox-backup-server/README.md`](stack/proxmox-backup-server/README.md)      |
| `stack/proxmox/`               | Proxmox VE as code (ACL, SDN, backup-storage registration, pools, ACME — VM/LXC lifecycle stays manual); see [`stack/proxmox/README.md`](stack/proxmox/README.md) |
| `toolbox/truenas-docs/`        | Standalone doc generator — rebuilds `docs/TRUENAS.md` from deployed stack state; see [`toolbox/truenas-docs/README.md`](toolbox/truenas-docs/README.md)           |
| `toolbox/pbs-docs/`            | Standalone doc generator — rebuilds `docs/PROXMOX_BACKUP_SERVER.md` from deployed stack state; see [`toolbox/pbs-docs/README.md`](toolbox/pbs-docs/README.md)     |

## Tasks

Defined in `.mise.toml`, run from this directory:

| Task                    | What it does                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pulumi:diff`           | `pulumi preview --diff --refresh` against the live stack                                                                             |
| `pulumi:apply`          | `pulumi up --refresh`, then regenerates `docs/TRUENAS.md` and `docs/PROXMOX_BACKUP_SERVER.md` via their `*:docs:generate` post-tasks |
| `truenas:docs:generate` | Rebuild `docs/TRUENAS.md` from the last-applied stack state (standalone; no Pulumi run)                                              |
| `pbs:docs:generate`     | Rebuild `docs/PROXMOX_BACKUP_SERVER.md` from the last-applied stack state (standalone; no Pulumi run)                                |

## Further reading

- [`stack/truenas/README.md`](stack/truenas/README.md) — TrueNAS datasets, shares, users, and ACL conventions
- [`stack/proxmox-backup-server/README.md`](stack/proxmox-backup-server/README.md) — Proxmox Backup Server datastore,
  retention, and access conventions
- [`stack/proxmox/README.md`](stack/proxmox/README.md) — Proxmox VE ACL, SDN, storage, pool, and ACME conventions
- [`toolbox/truenas-docs/README.md`](toolbox/truenas-docs/README.md) — how the TrueNAS doc generator works
- [`toolbox/pbs-docs/README.md`](toolbox/pbs-docs/README.md) — how the PBS doc generator works
