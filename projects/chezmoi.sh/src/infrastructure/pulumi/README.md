# chezmoi.sh Shared Infrastructure (`chezmoi-sh-infra`)

The Pulumi TypeScript stack managing shared cloud infrastructure for chezmoi.sh: Cloudflare and Tailscale API tokens,
the parent OCI compartment, the Pocket-Id groups, and a narrow, deliberately scoped slice of the Proxmox VE host
`pve-01.pve.chezmoi.sh` itself (ACLs, SDN, backup-storage registration, resource pools, ACME) as code. State lives in
the Garage S3 backend (`s3://pulumi-states`, see `Pulumi.yaml`). The TrueNAS SCALE server `nas.chezmoi.sh` and the
Proxmox Backup Server `pbs.pve.chezmoi.sh` moved to their own projects, `nas-core`
([`fleet/hosts/core.nas/`](../../../../../fleet/hosts/core.nas/README.md)) and `pbs-core`
([`fleet/hosts/core.pbs/`](../../../../../fleet/hosts/core.pbs/README.md)).

## Directory layout

`stack/` holds Pulumi resources (run by `pulumi up`); `toolbox/` holds standalone tooling that shells out to the
`pulumi` CLI and is never part of a Pulumi run.

| File/Folder              | Responsibility                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`               | Entry point — side-effect imports of every resource module below (no logic)                                                                                       |
| `config.ts`              | Pulumi secret config (Cloudflare account/zone IDs, Garage admin credentials)                                                                                      |
| `stack/observability.ts` | Observability LXC appliance tokens (Cloudflare DNS-01 + Tailscale OAuth)                                                                                          |
| `stack/oci.ts`           | Parent OCI compartment `chezmoi.sh`; its id (`chezmoiShCompartmentId`) is read by the `horn.akn` and `exusiai.akn` stacks                                         |
| `stack/proxmox/`         | Proxmox VE as code (ACL, SDN, backup-storage registration, pools, ACME — VM/LXC lifecycle stays manual); see [`stack/proxmox/README.md`](stack/proxmox/README.md) |
| `toolbox/proxmox-docs/`  | Standalone doc generator — rebuilds `docs/PROXMOX-VE.md` from deployed stack state; see [`toolbox/proxmox-docs/README.md`](toolbox/proxmox-docs/README.md)        |

## Tasks

Defined in `.mise.toml`, run from this directory:

| Task                    | What it does                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `pulumi:diff`           | `pulumi preview --diff --refresh` against the live stack                                               |
| `pulumi:apply`          | `pulumi up --refresh`, then regenerates `docs/PROXMOX-VE.md` via its `proxmox:docs:generate` post-task |
| `proxmox:docs:generate` | Rebuild `docs/PROXMOX-VE.md` from the last-applied stack state (standalone; no Pulumi run)             |

## Further reading

- [`fleet/hosts/core.nas/README.md`](../../../../../fleet/hosts/core.nas/README.md) — TrueNAS (now the `nas-core`
  project): datasets, shares, users, and ACL conventions
- [`fleet/hosts/core.pbs/README.md`](../../../../../fleet/hosts/core.pbs/README.md) — Proxmox Backup Server (now the
  `pbs-core` project): datastore, retention, and access conventions
- [`stack/proxmox/README.md`](stack/proxmox/README.md) — Proxmox VE ACL, SDN, storage, pool, and ACME conventions
- [`toolbox/proxmox-docs/README.md`](toolbox/proxmox-docs/README.md) — how the Proxmox VE doc generator works
