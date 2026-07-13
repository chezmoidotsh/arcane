# chezmoi.sh Shared Infrastructure (`chezmoi-sh-infra`)

The Pulumi TypeScript stack managing shared cloud infrastructure for chezmoi.sh: Cloudflare and Tailscale API tokens,
Backblaze B2 buckets, and the TrueNAS SCALE server [nas.chezmoi.sh](https://nas.chezmoi.sh) as code. State lives in the
Garage S3 backend (`s3://pulumi-states`, see `Pulumi.yaml`); the generated TrueNAS reference is published at
[`../../../docs/TRUENAS.md`](../../../docs/TRUENAS.md).

## Directory layout

`stack/` holds Pulumi resources (run by `pulumi up`); `toolbox/` holds standalone tooling that shells out to the
`pulumi` CLI and is never part of a Pulumi run.

| File/Folder              | Responsibility                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`               | Entry point — side-effect imports of every resource module below (no logic)                                                                             |
| `config.ts`              | Pulumi secret config (Cloudflare account/zone IDs, Garage admin credentials)                                                                            |
| `stack/backblaze.ts`     | Backblaze B2 buckets backing the TrueNAS CloudSync backup jobs                                                                                          |
| `stack/observability.ts` | Observability LXC appliance tokens (Cloudflare DNS-01 + Tailscale OAuth)                                                                                |
| `stack/omni.ts`          | Omni LXC appliance token (Cloudflare DNS-01)                                                                                                            |
| `stack/zot-registry.ts`  | Zot-registry LXC appliance token (Cloudflare DNS-01)                                                                                                    |
| `stack/truenas/`         | TrueNAS SCALE as code (datasets, shares, users, ACL templates); see [`stack/truenas/README.md`](stack/truenas/README.md)                                |
| `toolbox/truenas-docs/`  | Standalone doc generator — rebuilds `docs/TRUENAS.md` from deployed stack state; see [`toolbox/truenas-docs/README.md`](toolbox/truenas-docs/README.md) |

## Tasks

Defined in `.mise.toml`, run from this directory:

| Task                    | What it does                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `pulumi:diff`           | `pulumi preview --diff --refresh` against the live stack                                            |
| `pulumi:apply`          | `pulumi up --refresh`, then regenerates `docs/TRUENAS.md` via the `truenas:docs:generate` post-task |
| `truenas:docs:generate` | Rebuild `docs/TRUENAS.md` from the last-applied stack state (standalone; no Pulumi run)             |

## Further reading

- [`stack/truenas/README.md`](stack/truenas/README.md) — TrueNAS datasets, shares, users, and ACL conventions
- [`toolbox/truenas-docs/README.md`](toolbox/truenas-docs/README.md) — how the TrueNAS doc generator works
