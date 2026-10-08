---
status: "proposed"
date: 2026-10-08
decision-makers: ["Alexandre"]
assisted-by: ["claude-sonnet-5.5"]
informed: []
template-version: "1.1.0"
---

# Keep per-project Pulumi passphrases and forbid secret sharing through StackReference

## Table of Contents

- [Context and Problem Statement](#context-and-problem-statement)
- [Non-Goals](#non-goals)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
  - [Option 1: Do nothing now, add a guard, revisit at Operator adoption](#option-1-do-nothing-now-add-a-guard-revisit-at-operator-adoption)
  - [Option 2: One passphrase for every stack](#option-2-one-passphrase-for-every-stack)
  - [Option 3: Passphrase stored in OpenBao](#option-3-passphrase-stored-in-openbao)
  - [Option 4: Pulumi ESC](#option-4-pulumi-esc)
  - [Option 5: KMS or Vault-transit secrets provider](#option-5-kms-or-vault-transit-secrets-provider)
- [Decision Outcome](#decision-outcome)
- [Consequences](#consequences)
- [Implementation Details / Status](#implementation-details--status)
- [References and Related Decisions](#references-and-related-decisions)
- [Changelog](#changelog)

## Context and Problem Statement

Every Pulumi project under `projects/*/src/infrastructure/pulumi/` (today `chezmoi.sh`, `hass`, `kazimierz.akn`,
`lungmen.akn`, `rhodes.akn`, `rimbilliton.akn`) stores its state in the same Garage S3 bucket (`pulumi-states`, see
[`INF-20260705-00`](../procedures/infrastructure/INF-20260705-00.pulumi-state-and-import.md)) and uses the default
passphrase secrets provider. Each project has its own `PULUMI_CONFIG_PASSPHRASE`, kept in a SOPS/age-encrypted
`.mise/env.yaml` that `mise` decrypts when entering the project directory. That passphrase protects the project's config
secrets and every secret value in its state.

Issue [#1171](https://github.com/chezmoidotsh/arcane/issues/1171) raises two worries. First, a stack reading another
stack's output through `pulumi.StackReference` cannot decrypt a secret output encrypted under a different passphrase, and
Pulumi elides it ("eliding undecryptable secrets") instead of failing. Second, a future Pulumi Kubernetes Operator would
need one passphrase `Secret` per `Stack` CR.

What the repository actually shows (checked statically, no live access):

- `StackReference` is instantiated in six places: `hass`, `kazimierz.akn`, `lungmen.akn`, `rhodes.akn` each read group ids from
  `chezmoi.sh` (`getOutput`: `adminGroupId`, `maisonGroupId`, `familleGroupId`, all Pocket-Id UUIDs); `rimbilliton.akn`
  reads the `chezmoiSh` OCI compartment from `kazimierz.akn`; `rhodes.akn` reads `garageBackupBucketId` from
  `amiya.akn`; a seventh, commented-out copy sits in `rimbilliton.akn`. **None of the consumed outputs is a secret**, so nothing is elided today.
- The `amiya.akn` reference in `projects/rhodes.akn/.../stack/cloudnative-pg.ts` points to a stack with no project left
  in the tree, and no `garageBackupBucketId` export exists anywhere in the repo. It is a pre-migration leftover (see
  `docs/migrations/amiya.akn->rhodes.akn.md`) and is a separate cleanup, not part of this decision.
- The one place where a secret really had to cross projects (the `rhodes-akn-bootstrap@pve` and `lungmen-akn-bootstrap@pve`
  Proxmox tokens) was already solved by writing a Kubernetes `Secret` straight into the target cluster. The comments in
  `chezmoi.sh/.../proxmox/access/{rhodes,lungmen}-akn-bootstrap.ts` state that separate passphrases are deliberate: a
  leaked passphrase must not expose another project's secrets.
- ADR-015 makes the Pulumi Kubernetes Operator the eventual Phase 2 target, "deferred, not rejected", and Phase 1 (local
  execution) is current. No issue or document plans Operator adoption on a date.

The problem is therefore a latent footgun, not a live failure. The strategic question is: how should secrets cross Pulumi
stack boundaries, and how should stack passphrases be provisioned, given a single-operator homelab with local execution
today and an in-cluster Operator later?

## Non-Goals

- Migrating to the Pulumi Kubernetes Operator. ADR-015 defers it; this ADR only checks that the choice does not block it.
- Changing the state backend (Garage S3) or moving to Pulumi Cloud.
- Rotating any existing passphrase. No option below requires it in the recommended path.
- Cleaning up the dangling `amiya.akn` StackReference (separate follow-up).

## Decision Drivers

- **Steel Age principles** (`AGENTS.md`): simple, maintainable, personal use, pragmatic over perfect.
- **Blast radius**: a leaked passphrase should expose one project, not every stack (the existing stated rationale).
- **Disaster recovery**: Pulumi state lives on the NAS behind `pve-01`, and rhodes.akn hosts OpenBao. Recovery must not
  require a service that Pulumi itself has to rebuild first.
- **No new paid or hosted dependency**: state is deliberately self-hosted, with no Pulumi Cloud.
- **Fail loudly**: a secret that cannot be read must not silently become empty.
- **Operator readiness**: a path must exist, even if not taken now.

## Considered Options

### Option 1: Do nothing now, add a guard, revisit at Operator adoption

> **Status: PROPOSED**

Keep one passphrase per project and make the existing convention explicit: a secret never crosses a project boundary via
`StackReference`; it is delivered by writing into the target system (Kubernetes `Secret`, OpenBao path) as already done for
the Proxmox bootstrap tokens. `StackReference` stays valid for non-secret identifiers (ids, names). A small static guard
(for example a CI grep rejecting `getOutput`/`requireOutput` on a `StackReference` unless the call site carries an explicit
`// non-secret` marker, or an `isSecret` check) turns the silent elision into a review-time failure. At Operator adoption,
each `Stack` CR gets its passphrase through an `ExternalSecret` pulling from OpenBao; with six stacks that is six small
manifests, not a design problem.

- `+` Zero migration, zero change to encrypted state of live stacks.
- `+` Preserves per-project blast radius.
- `+` No new dependency, nothing in the DR chain.
- `-` Six passphrases to provision for the Operator rather than one (mitigated by generating the `ExternalSecret`s from the
  same ApplicationSet that creates the `Stack` CRs).
- `-` A guard is convention enforcement, not a technical barrier; a reviewer or lint must catch violations.

### Option 2: One passphrase for every stack

> **Status: REJECTED**

All projects share one `PULUMI_CONFIG_PASSPHRASE`. `StackReference` secret reads would then decrypt, and the Operator needs
one `Secret`. Existing stacks must be re-encrypted (`pulumi stack change-secrets-provider` with the new passphrase) one by
one against live state.

- `+` Cross-stack secret reads work transparently; one Operator `Secret`.
- `-` One leaked passphrase unlocks every stack, including `chezmoi.sh` (Proxmox root password, Tailscale and Cloudflare
  credentials). This undoes the isolation the repo comments rely on.
- `-` Requires touching the encrypted state of every live stack for a benefit nobody consumes today.

### Option 3: Passphrase stored in OpenBao

> **Status: REJECTED**

Passphrases move from `.mise/env.yaml` to OpenBao and are read at `mise` env-loading time and by the Operator.

- `+` Single audited store, easy rotation; fits the Operator via External Secrets.
- `-` Circular dependency: OpenBao runs on rhodes.akn, whose own mounts and auth backends are provisioned by the rhodes
  Pulumi stack (`cluster-vault`). Rebuilding rhodes would need the passphrase held in the thing being rebuilt. The
  disaster-recovery documentation of rhodes.akn deliberately avoids such loops (see `cloudnative-pg.ts` comments).
- `-` Every local `pulumi` command now needs a Vault login and a reachable cluster, a regression from `mise` decrypting a
  local SOPS file offline.

### Option 4: Pulumi ESC

> **Status: REJECTED**

Pulumi ESC (Environments, Secrets and Configuration) centralises configuration and secrets, and can be imported across
stacks.

- `+` Purpose-built for sharing secrets and config between stacks, with first-class Operator support.
- `-` It is a Pulumi Cloud service (a self-hosted edition exists only in the enterprise offering). The repo deliberately has
  no Pulumi Cloud involvement; adopting ESC reverses that to solve a problem that does not currently occur.
- `-` Adds an external SaaS to the DR chain and a Pulumi account credential to protect. (Pricing and feature tiers were not
  verified for this ADR.)

### Option 5: KMS or Vault-transit secrets provider

> **Status: REJECTED**

Switch each stack to a `hashivault://` (transit) or cloud KMS secrets provider, so decryption is authorised by a key policy
rather than a shared passphrase, and cross-stack reads work for any identity allowed on the key.

- `+` Per-stack keys with policies: sharing is an explicit grant, rotation is a key operation, no passphrase files.
- `-` Transit on OpenBao has the same rhodes circularity as Option 3 and makes OpenBao a hard prerequisite for every
  `pulumi` command. A cloud KMS is an external dependency and
  needs credentials for every operator session and for the Operator pod.
- `-` Whether Pulumi's `hashivault` provider works against OpenBao was not verified here; it should be tested before this
  option is considered again.
- `-` Same live-state re-encryption risk as Option 2, for every stack.

## Decision Outcome

**Chosen option: "Do nothing now, add a guard, revisit at Operator adoption" (Option 1).**

The only observed need to move a secret across projects was met without sharing a passphrase, and the comments at the call
sites show the isolation is intended. Options 2 to 5 all pay a real price now (re-encrypting live state, or putting OpenBao
or a SaaS in the Pulumi recovery chain) to remove a failure that has never occurred, which contradicts "pragmatic over
perfect". Options 3 and 5 additionally introduce a bootstrap loop through rhodes.akn, which is the cluster the Pulumi
state is most likely needed to rebuild. The cost accepted is six Operator passphrase `Secret`s instead of one, which is a
templating task once the Operator is adopted, and a convention that a guard rather than the platform enforces.

What would change the decision: a second real case of a secret that must be read by a different project's stack and cannot
be delivered by direct write (then evaluate Option 5 with a cloud KMS, after verifying behaviour), or an Operator rollout
where six `ExternalSecret`s prove burdensome.

## Consequences

### Positive

- (+) No change to live encrypted state.
- (+) Isolation between projects stays intact, including under the Operator.

### Negative

- (-) The rule is conventional until the guard exists. Until then a contributor could still export a secret and consume
  it through `StackReference`, and it would be elided silently.
- (-) Per-stack passphrase provisioning remains a per-project step in the Operator phase.

### Neutral

- (~) Issue #1171's implementation criteria ("chosen approach implemented across all stacks") reduce to: add the guard and
  remove the dangling `amiya.akn` reference.

## Implementation Details / Status

Nothing is implemented by this ADR. Remaining work, to be tracked on #1171:

- Add the guard (CI grep or lint) on `StackReference` reads.
- Remove the `amiya.akn` StackReference once `rhodes.akn` no longer needs read access to its bucket.
- At Operator adoption, generate one `ExternalSecret` per `Stack` CR from OpenBao.

> [!IMPORTANT] **Not verified.** No live access was available. It was not checked that the passphrases really differ per
> project (the `env.yaml` files are SOPS-encrypted), that no live stack exports a secret output consumed elsewhere, that the
> `amiya.akn` stack still exists in the Garage bucket, or that Pulumi's `hashivault` provider accepts OpenBao.

Should a human later decide to adopt a different provider (Options 2 to 5), the safe sequence per stack, run from the
project directory, is: (1) back up the state (`pulumi stack export --show-secrets` is forbidden in shared terminals; copy
the stack's object under `.pulumi/stacks/` in the bucket instead) and the SOPS `env.yaml`; (2) `pulumi preview` to confirm
a clean baseline; (3) `pulumi stack change-secrets-provider <new-provider>` (for the passphrase provider, the old
passphrase is in `PULUMI_CONFIG_PASSPHRASE` and the new one is prompted for), then update `.mise/env.yaml` through
`sops`; (4) `pulumi preview` again, which must show no changes and no decryption error; (5) to roll back, restore the
backed-up state object and the previous `env.yaml`. Do one stack at a time, `chezmoi.sh` last.

## References and Related Decisions

- [ADR-015](015-migrate-crossplane-to-pulumi.md): Pulumi adoption and deferred Operator phase.
- [ADR-001](001-centralized-secret-management.md) and [ADR-002](002-openbao-secrets-topology.md): OpenBao as secret source.
- [`INF-20260705-00`](../procedures/infrastructure/INF-20260705-00.pulumi-state-and-import.md): state backend and secrets
  provider layout.
- [Pulumi secrets providers](https://www.pulumi.com/docs/iac/concepts/secrets/) and
  [`pulumi stack change-secrets-provider`](https://www.pulumi.com/docs/iac/cli/commands/pulumi_stack_change-secrets-provider/).
- [Pulumi ESC](https://www.pulumi.com/docs/esc/).
- Issue [#1171](https://github.com/chezmoidotsh/arcane/issues/1171).

## Changelog

- **2026-10-08**: **FEATURE**: Initial proposal.
