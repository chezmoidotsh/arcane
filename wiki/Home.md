# Home

Arcane is a personal homelab managed as code: two Talos Linux Kubernetes clusters and a few standalone hosts, deployed
through GitOps (ArgoCD), with Pulumi for the infrastructure and OpenBao for the secrets. This wiki is the
documentation of that repository, published from the `wiki/` directory on every merge to `main`.

> [!NOTE]
> The documentation is being moved here from `docs/` and `projects/*/docs/` (issue
> [#1257](https://github.com/chezmoidotsh/arcane/issues/1257)). Until a page is migrated, the links below point to its
> current location in the repository.

## Operate the clusters

| Page | What it is for |
| ---- | -------------- |
| [Procedures](https://github.com/chezmoidotsh/arcane/tree/main/docs/procedures) | Step-by-step runbooks: upgrades, backups and restores, Omni, Proxmox |
| [Bootstrap Lungmen](https://github.com/chezmoidotsh/arcane/blob/main/projects/lungmen.akn/docs/HOW_TO_BOOTSTRAP.md) | Bring up the home applications cluster |
| [Bootstrap Kazimierz](https://github.com/chezmoidotsh/arcane/blob/main/projects/kazimierz.akn/docs/BOOTSTRAP.md) | Install the public-access VPS |
| [Bootstrap Rimbilliton](https://github.com/chezmoidotsh/arcane/blob/main/projects/rimbilliton.akn/docs/BOOTSTRAP.md) | Install the Minecraft host |

## Recover from a failure

| Page | What it is for |
| ---- | -------------- |
| [Recover Rhodes](https://github.com/chezmoidotsh/arcane/blob/main/projects/rhodes.akn/docs/disaster-recovery/README.md) | Disaster recovery of the core platform cluster |
| [Incidents](https://github.com/chezmoidotsh/arcane/tree/main/docs/incidents) | Post-mortems of past production incidents |

## Reference

| Page | What it is for |
| ---- | -------------- |
| [Network](https://github.com/chezmoidotsh/arcane/tree/main/docs/network) | Topology, address plan, gateways and DNS |
| [Renovate](https://github.com/chezmoidotsh/arcane/blob/main/docs/RENOVATE.md) | How dependency updates are configured |
| [Architecture decisions](https://github.com/chezmoidotsh/arcane/tree/main/docs/decisions) | Why the repository is built the way it is (ADRs) |

## Where to go next

- [Repository README](https://github.com/chezmoidotsh/arcane/blob/main/README.md): the project at a glance and its history.
- [Writing documentation](https://github.com/chezmoidotsh/arcane/blob/main/.agents/skills/documentation-writer/SKILL.md): how a page is written, and the style guide it follows.
