# Fleet base (`base`)

The resources tied to no machine of the fleet (see
[Architecture du dépôt](../../docs/reference/Architecture-du-Depot-Reference.md)). The [`pulumi/`](pulumi/) folder holds
the Pulumi TypeScript project `base` (stack `base.live`), formerly `chezmoi-sh-infra` under `projects/chezmoi.sh/`.
State lives in the Garage S3 backend (`s3://pulumi-states`, see `pulumi/Pulumi.yaml` and
[`INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md`](../../docs/procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md)).

The Proxmox VE host, the TrueNAS SCALE server and the Proxmox Backup Server have their own projects:
[`core.pve-01`](../hosts/core.pve-01/README.md) (`pve-01-core`), [`core.nas`](../hosts/core.nas/README.md) (`nas-core`)
and [`core.pbs`](../hosts/core.pbs/README.md) (`pbs-core`).

## What's managed here

| File (`pulumi/`)                     | Responsibility                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                           | Entry point — imports the modules and re-exports the outputs read from outside (no logic)                                                                           |
| `stack/config.ts`                    | Every input of the program (Pulumi config and `process.env`), read once                                                                                             |
| `stack/cloud/oci.ts`                 | Parent OCI compartment `chezmoi.sh`; its id (`chezmoiShCompartmentId`) is read by the `horn.akn` and `exusiai.akn` stacks                                           |
| `stack/identity/pocket-id.ts`        | The Pocket-Id groups; their ids are read by the `pocket-id` stacks of the clusters and hosts (`StackReference` to `organization/base/base.live`, output names kept) |

The Cloudflare DNS-01 token of the observability stack moved to [`akn.ptilopsis`](../hosts/akn.ptilopsis/README.md)
(`ptilopsis-akn`); its Tailscale OAuth client is gone with the CT 103.

## Tasks

Defined in `pulumi/.mise.toml`, run from `pulumi/` (after `mise trust`):

| Task           | What it does                                             |
| -------------- | -------------------------------------------------------- |
| `pulumi:diff`  | `pulumi preview --diff --refresh` against the live stack |
| `pulumi:apply` | `pulumi up --refresh` against the live stack             |

The stack secrets come from Bitwarden Secrets Manager through fnox: [`.fnox.toml`](.fnox.toml) lists the `TF_VAR_*` OCI,
Cloudflare, Pocket-Id and Tailscale credentials; the state backend credentials and the passphrase come from
`fleet/.fnox.toml`. `PULUMI_STACK` is set in `pulumi/.mise.toml`.
