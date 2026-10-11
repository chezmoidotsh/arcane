# Home

Arcane is a personal homelab managed as code: two Talos Linux Kubernetes clusters and a few standalone hosts, deployed
through GitOps (ArgoCD), with Pulumi for the infrastructure and OpenBao for the secrets. This directory is the
documentation of that repository. It is the source of truth, readable in Git and mirrored to the GitHub Wiki on every
merge to `main`.

> [!NOTE]
> The documentation is being migrated to a common standard (issue
> [#1257](https://github.com/chezmoidotsh/arcane/issues/1257)). Pages listed in [`.wiki-legacy`](.wiki-legacy) are
> not migrated yet: they are linked below from their current location.

## Operate the clusters

| Page                                                                   | What it is for                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [Procedures](procedures/README.md)                                     | Step-by-step runbooks: upgrades, backups and restores, Omni, Proxmox |
| [Bootstrap Lungmen](../projects/lungmen.akn/docs/HOW_TO_BOOTSTRAP.md)  | Bring up the home applications cluster                               |
| [Bootstrap Kazimierz](../projects/kazimierz.akn/docs/BOOTSTRAP.md)     | Install the public-access VPS                                        |
| [Bootstrap Rimbilliton](../projects/rimbilliton.akn/docs/BOOTSTRAP.md) | Install the Minecraft host                                           |

## Recover from a failure

| Page                                                                      | What it is for                                 |
| ------------------------------------------------------------------------- | ---------------------------------------------- |
| [Recover Rhodes](../projects/rhodes.akn/docs/disaster-recovery/README.md) | Disaster recovery of the core platform cluster |
| [Incidents](incidents/README.md)                                          | Post-mortems of past production incidents      |

## Reference

| Page                                                                     | What it is for                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------ |
| [Network](network/README.md)                                             | Topology, address plan, gateways and DNS         |
| [Renovate](RENOVATE.md)                                                  | How dependency updates are configured            |
| [Architecture decisions](decisions/001-centralized-secret-management.md) | Why the repository is built the way it is (ADRs) |

## Where to go next

- [Repository README](../README.md): the project at a glance and its history.
- [Writing documentation](../.agents/skills/documentation-writer/SKILL.md): how a page is written, and the style guide it follows.
