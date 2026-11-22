# chezmoi.sh Shared Infrastructure (`chezmoi-sh-infra`)

The Pulumi TypeScript stack managing shared cloud infrastructure for chezmoi.sh: Cloudflare and Tailscale API tokens,
the parent OCI compartment and the Pocket-Id groups. State lives in the Garage S3 backend (`s3://pulumi-states`, see
`Pulumi.yaml`). The Proxmox VE host `pve-01.pve.chezmoi.sh`, the TrueNAS SCALE server `nas.chezmoi.sh` and the Proxmox
Backup Server `pbs.pve.chezmoi.sh` moved to their own projects, `pve-01-core`
([`fleet/hosts/core.pve-01/`](../../../../../fleet/hosts/core.pve-01/README.md)), `nas-core`
([`fleet/hosts/core.nas/`](../../../../../fleet/hosts/core.nas/README.md)) and `pbs-core`
([`fleet/hosts/core.pbs/`](../../../../../fleet/hosts/core.pbs/README.md)).

## Directory layout

`stack/` holds Pulumi resources (run by `pulumi up`).

| File/Folder              | Responsibility                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`               | Entry point — re-exports the outputs read from outside (no logic)                                                         |
| `stack/observability.ts` | Observability LXC appliance tokens (Cloudflare DNS-01 + Tailscale OAuth)                                                  |
| `stack/oci.ts`           | Parent OCI compartment `chezmoi.sh`; its id (`chezmoiShCompartmentId`) is read by the `horn.akn` and `exusiai.akn` stacks |
| `stack/pocket-id.ts`     | The Pocket-Id groups; their ids are read by the clusters' and hosts' `pocket-id` stacks                                   |

## Tasks

Defined in `.mise.toml`, run from this directory:

| Task           | What it does                                             |
| -------------- | -------------------------------------------------------- |
| `pulumi:diff`  | `pulumi preview --diff --refresh` against the live stack |
| `pulumi:apply` | `pulumi up --refresh` against the live stack             |

## Further reading

- [`fleet/hosts/core.pve-01/README.md`](../../../../../fleet/hosts/core.pve-01/README.md) — Proxmox VE (now the
  `pve-01-core` project): ACL, SDN, storage, pool, and ACME conventions
- [`fleet/hosts/core.nas/README.md`](../../../../../fleet/hosts/core.nas/README.md) — TrueNAS (now the `nas-core`
  project): datasets, shares, users, and ACL conventions
- [`fleet/hosts/core.pbs/README.md`](../../../../../fleet/hosts/core.pbs/README.md) — Proxmox Backup Server (now the
  `pbs-core` project): datastore, retention, and access conventions
