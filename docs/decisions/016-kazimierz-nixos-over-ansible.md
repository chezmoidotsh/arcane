---
status: "implemented"
date: 2026-10-10
implementation-completed: 2026-10-10
decision-makers: ["Alexandre"]
assisted-by: ["claude-sonnet-5.5"]
informed: []
template-version: "1.1.0"
---

# `kazimierz`.AKN: NixOS (nixos-anywhere + sops-nix) over Ansible + Docker Compose

## Table of Contents

- [Context and Problem Statement](#context-and-problem-statement)
- [Non-Goals](#non-goals)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
  - [Option 1: Keep Ansible + Docker Compose](#option-1-keep-ansible--docker-compose)
  - [Option 2: NixOS installed with nixos-anywhere, secrets with sops-nix](#option-2-nixos-installed-with-nixos-anywhere-secrets-with-sops-nix)
- [Decision Outcome](#decision-outcome)
- [Consequences](#consequences)
  - [Positive](#positive)
  - [Negative](#negative)
  - [Neutral](#neutral)
- [Implementation Details / Status](#implementation-details--status)
- [Decision Evolution](#decision-evolution)
- [References and Related Decisions](#references-and-related-decisions)
- [Changelog](#changelog)

## Context and Problem Statement

[ADR-008](./008-kazimierz-ansible-over-kubernetes.md) settled that `kazimierz.akn`, the public Pangolin gateway, is a
single VPS and not a Kubernetes cluster, and chose Ansible + Docker Compose to configure it. The VPS now lives on an
Oracle Cloud Always Free A1 instance provisioned by Pulumi, which boots a stock Ubuntu image. On top of it, an Ansible
playbook (`system_setup` and `pangolin` roles) installed Docker, Tailscale, UFW and unattended upgrades, and rendered
the Pangolin, Gerbil and Traefik Compose stack from Jinja2 templates, with secrets in ansible-vault `host_vars`. The
playbook was run by hand from an operator machine since the removal of `ansible-pull` (2026-10-07).

Meanwhile `rimbilliton.akn`, a second OCI A1 host, was built the other way: NixOS installed over the same stock Ubuntu
image with `nixos-anywhere`, then managed with `nixos-rebuild`, secrets handled by `sops-nix`. That left the repository
with two single-VM hosts on the same provider using two unrelated configuration stacks, and `kazimierz.akn` carried the
heavier one: a Python/Ansible toolchain with external roles and collections, a vault password to protect with another
secret, and an OS that drifts between runs (the 2026-10-07 re-bootstrap on Ubuntu 26.04 failed on the Ansible PPA
signing key, recorded in ADR-008).

The strategic question: should the configuration management of `kazimierz.akn` stay on Ansible, or move to the NixOS
pattern already used by `rimbilliton.akn`?

## Non-Goals

- **Not reopening Kubernetes versus VPS**, nor Pangolin as the gateway: ADR-008's other decisions stand.
- **Not adding automatic updates.** The hosts are not supervised yet and a rollback is hard to do cleanly; ADR-008
  already records that `system.autoUpgrade` stays off. Updates are applied by hand with `nixos-rebuild`.
- **Not migrating the Ansible toolchain away from the repository**: Ansible remains used by other projects
  (`catalog/ansible/`, the Proxmox host preparation in `projects/chezmoi.sh`).

## Decision Drivers

- **One toolchain for the OCI hosts**: the same install, deploy and secret workflow as `rimbilliton.akn`.
- **Declarative OS and services**: the OS configuration, not only the application stack, should be reproducible from Git,
  to support rebuilding a sacrificial VPS.
- **Secrets in Git without a second secret**: SOPS + age is already the repository's mechanism for secrets that must
  live in Git (ADR-001 to ADR-004); an ansible-vault password adds a parallel one.
- **Rollback**: a bad change should be revertible to the previous generation.
- **Constraint**: the tenancy's Always Free A1 quota is fully used (`kazimierz-pangolin` and `rimbilliton-minecraft`), so
  a side-by-side migration on a second instance is impossible.

## Considered Options

### Option 1: Keep Ansible + Docker Compose

> **Status: REJECTED**

Keep the playbook and its roles, run by hand over SSH. Nothing to migrate and no downtime. It remains a working,
proven setup, but it stays a second stack to maintain next to the NixOS one of `rimbilliton.akn`, and it only converges
what the roles describe: packages, kernel settings and anything changed by hand on the mutable Ubuntu host persist.

- `+` No migration, no downtime
- `+` Proven in production until the migration
- `-` Second toolchain (Ansible, Galaxy roles, ansible-vault) next to NixOS for the same kind of host
- `-` Mutable OS: configuration drift and breakage from upstream package sources (the PPA incident of 2026-10-07)
- `-` Secrets protected by a vault password that is itself a SOPS secret

### Option 2: NixOS installed with nixos-anywhere, secrets with sops-nix

> **Status: ACCEPTED**

Replace Ubuntu with NixOS, installed over the stock OCI image with `nixos-anywhere` (kexec, then disko partitioning of
the boot volume). The system, the hardening and the Pangolin stack (the same upstream container images, run through
`oci-containers`) are described in a flake with one output per platform: the production A1 (aarch64) and an x86_64 test
VM on Proxmox. Secrets live in a SOPS file whose recipients are the admin key and the host's SSH key, decrypted on the
host by `sops-nix`. Changes are deployed with `nixos-rebuild switch --target-host` over the tailnet. An earlier NixOS
attempt (see Decision Evolution) was abandoned for reasons that do not apply to this installation method.

- `+` Same pattern and tasks as `rimbilliton.akn`
- `+` OS and services declared together, with generation rollback
- `+` Secrets encrypted with the repository's SOPS + age, no extra password
- `-` Not side-by-side: `nixos-anywhere` repartitions the boot volume, so the migration costs downtime and the host
  state must be backed up and restored
- `-` Rollback of the host as a whole after a reinstall is not possible (the boot volume is wiped)
- `-` NixOS expertise needed for any change to the host

## Decision Outcome

**Chosen option: "NixOS installed with nixos-anywhere, secrets with sops-nix" (Option 2)**, because it removes the
second configuration stack from the OCI hosts and makes the whole host, not only the application layer, reproducible
from Git, while reusing a workflow already proven on `rimbilliton.akn`. The decisive trade-off is operational: Ansible
works, but keeping it means maintaining two toolchains for two hosts that are otherwise alike, against a one-off
migration cost (a few minutes to tens of minutes of downtime, mitigated by a backup and restore of Pangolin's state).
The migration was validated in production on 2026-10-10: state restored, containers running, Tailscale node registered,
`tailscale serve` working.

This supersedes **only** the configuration-management choice of ADR-008 (Ansible + Docker Compose). Pangolin and Docker
containers remain, and ADR-008's decision against Kubernetes is unchanged.

---

## Consequences

### Positive

- (+) One toolchain (`nixos-anywhere`, `nixos-rebuild`, `sops-nix`) for both OCI hosts; Ansible is no longer needed by
  this project (its code, vault password and SOPS rule were removed)
- (+) Declarative OS with generation rollback (`nixos-rebuild --rollback`)
- (+) The unused 50 GB OCI data volume was removed from the Pulumi stack

### Negative

- (-) **No automatic update, on purpose**: the hosts are not supervised, a bad unattended upgrade would go unnoticed and
  rollback is hard to do cleanly. Updates are applied by hand (`mise run nixos:oci:update`); revisit once the instances
  are monitored.
- (-) **State lives on the boot volume** (`/var/lib/pangolin/config`) and a reinstall wipes it. A backup is mandatory
  before any reinstall: `mise run nixos:backup` takes a hot one, and `nixos:oci:install` shows the latest backup and its
  age, offers to take one, and asks for confirmation. The backup holds secrets in clear text and is kept outside the
  repository.
- (-) A reinstall regenerates the host key (a new SOPS recipient) and consumes the single-use Tailscale key
- (-) `unattended-upgrades` and its Slack notification were not ported

### Neutral

- (~) The hardening (sshd, sysctl, fail2ban, DNS) was ported with the same settings; the NixOS firewall replaces UFW
- (~) Pangolin's images are still pinned by tag and digest, now in the Nix module

---

## Implementation Details / Status

Implemented and in production since 2026-10-10: flake outputs `kazimierz-akn-aarch64` (OCI A1) and
`kazimierz-akn-x86_64` (test VM), host secrets in a committed, SOPS-encrypted file, and `nixos:*` mise tasks for
install, update, backup and end-to-end rehearsal. The procedure is in `projects/kazimierz.akn/docs/BOOTSTRAP.md` and the
record of the cutover in `projects/kazimierz.akn/docs/MIGRATION_NIXOS.md`.

---

## Decision Evolution

- **2026-08-01**: A first NixOS attempt (an immutable qcow2 image built locally) was abandoned in favor of Ansible: the
  image build required local KVM, unavailable on the Apple Silicon workstation, and a `nixos-anywhere` test on a Proxmox
  VM stalled on an unresolved OVMF boot issue (see the session notes in `.agents/sessions/`).
- **2026-10-10**: Revised decision, NixOS through `nixos-anywhere` over the stock OCI image. Neither blocker applies: the
  closure is built without a local VM, and the target is a real OCI instance, a method proven on `rimbilliton.akn`.

---

## References and Related Decisions

- **Related ADRs**: [ADR-008](./008-kazimierz-ansible-over-kubernetes.md) (superseded in part: configuration
  management), [ADR-001](./001-centralized-secret-management.md) (secrets)
- **Project documentation**: [`kazimierz.akn` bootstrap](../../projects/kazimierz.akn/docs/BOOTSTRAP.md),
  [migration record](../../projects/kazimierz.akn/docs/MIGRATION_NIXOS.md),
  [`rimbilliton.akn` bootstrap](../../projects/rimbilliton.akn/docs/BOOTSTRAP.md)
- **Earlier attempt**: [session notes](../../.agents/sessions/20260801-kazimierz-nixos-vs-ansible.md)
- **Implementation References**: [nixos-anywhere](https://github.com/nix-community/nixos-anywhere),
  [sops-nix](https://github.com/Mic92/sops-nix)

---

## Changelog

- **2026-10-10**: **FEATURE**: ADR created and implemented; supersedes the configuration-management choice of ADR-008.
