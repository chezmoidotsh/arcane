---
status: "accepted"
date: 2026-07-19
decision-makers: ["Alexandre"]
assisted-by: ["claude-opus-4.8", "claude-sonnet-5"]
informed: []
template-version: "1.1.0"
---

# Migrate cloud infrastructure management from Crossplane to Pulumi

## Table of Contents

- [Context and Problem Statement](#context-and-problem-statement)
- [Non-Goals](#non-goals)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
  - [Option 1: Keep Crossplane](#option-1-keep-crossplane)
  - [Option 2: Terraform / OpenTofu](#option-2-terraform--opentofu)
  - [Option 3: Pulumi](#option-3-pulumi)
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

`amiya.akn` runs Crossplane as the sole controller for cloud and cloud-adjacent infrastructure. Crossplane's model
installs **one provider package per cloud API family** — each a Deployment plus its own CRD set — and expresses fan-out
logic (a claim producing many managed resources) through custom XRDs and Compositions. Today that means 12 provider
packages, two custom XRDs (`ClusterVault`, `DomainIdentity`), \~8 Cloudflare tokens, \~19 Vault/OpenBao resources, \~9
AWS SES/Cloudflare resources, and 6 Terraform Workspaces run via `provider-terraform`.

This per-provider model does not scale on homelab hardware. The OCI registry migration (#1010, #1076) was the tipping
point: onboarding a handful of OCI resources required **7 additional provider packages and \~500 additional Kubernetes
resources**. That structural overhead — provider Deployments, CRDs, and managed-resource objects multiplying per API
family — is the concrete problem, counted directly in the POC (#1089, §1). The CPU/RAM cost that rides on top of it is
expected to be substantial but was not quantified (the POC's footprint criteria V-005/V-006 are `Pending`); the decision
rests on the observed structural explosion, not on an unmeasured resource delta.

The Pulumi-vs-Crossplane POC (#1089, `docs/experiments/20260702-pulumi-crossplane-evaluation/`) validated that a Pulumi
`ComponentResource` reaches functional parity with the `ClusterVault` and `DomainIdentity` Compositions, and that Garage
(S3-compatible, #1097) works as a Pulumi state backend. Pulumi's model is fundamentally lighter: one npm package per
provider (no permanently installed CRDs), stacks written as TypeScript programs, and state in S3 rather than in etcd as
custom resources.

A second constraint compounds the first. The `rhodes` reconstruction (#370) requires that cloud/infrastructure state be
reconstructable and manageable **with no Kubernetes cluster guaranteed to exist** — something Crossplane, being an
in-cluster controller, cannot do by construction.

The strategic question this ADR answers is: **what tool should manage the homelab's cloud and cloud-adjacent
infrastructure as code, replacing Crossplane's per-provider CRD/controller model, while remaining operable during the
`rhodes` reconstruction when no cluster is guaranteed?**

## Non-Goals

- **Fixing the permanent execution model.** This ADR decides the _tool_ (Pulumi replaces Crossplane). Execution is
  rolled out in phases: **local / out-of-cluster first**, during the migration; running Pulumi **in-cluster** via the
  Pulumi Kubernetes Operator remains the eventual target and is **deferred, not rejected** (see
  [Implementation](#implementation-details--status) for the sequencing and its reasons).
- **Proxmox VM/LXC lifecycle, and Unifi IaC management.** Both stay outside Pulumi/GitOps and remain manual. They are
  foundational to the homelab (Proxmox hosts every cluster; Unifi is the network substrate), so credentials able to
  create, modify, or delete compute must never sit inside — or downstream of — anything a cluster runs, to avoid a
  `Proxmox → hosts K8s → K8s manages Proxmox` trust cycle. Tracked as a deliberate case by the manual-infrastructure
  inventory (#1094); reasoning carried forward from the POC (§9).

  > [!NOTE] **Narrow carve-out (#1118, see Decision Evolution).** Proxmox VE's ACLs (user/role/token creation), SDN
  > (zones/vnets), backup-storage registration, resource pools, and ACME are managed via Pulumi — these are
  > administrative config objects, not compute lifecycle, so they don't carry the trust-cycle risk this non-goal exists
  > to block. The carve-out only holds as long as `stack/proxmox/` (like every `chezmoi-sh-infra` stack today) executes
  > **locally** (this ADR's Phase 1, see Implementation). If Pulumi execution ever moves in-cluster (Phase 2),
  > `stack/proxmox/` must stay excluded from that migration, or the exact `Proxmox → hosts K8s → K8s manages Proxmox`
  > cycle re-opens through it.

- **Re-opening the state backend choice.** Garage as the S3 state backend is settled by \#1097 and is a premise here.

## Decision Drivers

- **Escape the per-provider model**: replace Crossplane's one-CRD-set-per-API-family overhead, whose structural
  explosion (quantified in Context) is the primary motivation. Footprint reduction is expected but unquantified.
- **Composition as code**: express fan-out logic (the `ClusterVault`/`DomainIdentity` patterns) in a real programming
  language rather than a templating/HCL-module layer, for maintainability and easier reasoning.
- **Cluster-independent execution**: the tool must run without a Kubernetes cluster, to satisfy the `rhodes`
  reconstruction (#370).
- **Strong in-cluster story for later**: because in-cluster execution is the eventual target, the tool's Kubernetes
  operator must be first-class — this phase is deferred, not abandoned.
- **Native provider authoring**: upcoming native providers for Garage, Talos Omni, and Pocket-Id (#1092/#1093/#1095)
  must be cheap to build against each product's own API.
- **Migration-time safety**: adoption must import existing resources with zero recreation (`pulumi import`, clean
  `pulumi preview`) and introduce no window where two controllers reconcile the same resource.

## Considered Options

### Option 1: Keep Crossplane

> **Status: REJECTED**

Stay on Crossplane: one provider package per cloud API family, Compositions fanning claims into managed resources, all
reconciled continuously in-cluster. No migration cost, and a genuine strength — a live control loop that self-heals
drift and surfaces state through `kubectl get composite,claim` and ArgoCD.

It is rejected on the two structural problems it cannot shed. The per-provider model is the overhead this decision
exists to remove (the OCI migration's provider explosion is intrinsic, not a misconfiguration). And being an in-cluster
controller, it cannot manage cloud state when no cluster exists — a hard blocker for the `rhodes` reconstruction (#370).

- `+` Zero migration effort; continuous drift reconciliation; ArgoCD-native visibility.
- `-` Per-provider CRD/controller model is exactly the overhead to escape.
- `-` Requires a live cluster to manage cloud state — incompatible with `rhodes`.
- `-` Custom XRDs/Compositions are a bespoke abstraction to hand-maintain indefinitely.

### Option 2: Terraform / OpenTofu

> **Status: REJECTED**

The mainstream IaC alternative, and already partly present in the repo — the 6 Terraform Workspaces run today via
Crossplane's `provider-terraform`. Standardizing on Terraform/ OpenTofu would consolidate onto a widely-supported tool
with a large provider ecosystem, and would also run out-of-cluster, satisfying the `rhodes` constraint.

It is rejected in favor of Pulumi on four grounds (the last three are the maintainer's assessment):

- **Composition as code, not HCL modules.** The `ClusterVault`/`DomainIdentity` fan-out maps naturally onto a Pulumi
  `ComponentResource` (real TypeScript) — more maintainable than the equivalent expressed as Terraform modules.

- **Better Kubernetes operator.** The Pulumi Kubernetes Operator is considered markedly better designed than Terraform's
  operator options — decisive because in-cluster execution is the _eventual_ target (see Non-Goals / Implementation), so
  the deferred phase must land on a solid operator.

- **AI-assisted ergonomics.** A mainstream TypeScript codebase is easier for AI assistants to work in than HCL, which
  matters for a single-operator homelab that leans on AI.

- **Cheaper native providers.** Building a native provider from a product's own API (Garage, Omni, Pocket-Id —
  #1092/#1093/#1095) is judged simpler with Pulumi's provider model than with Terraform's.

- `+` Large ecosystem; out-of-cluster capable; already partly in use.

- `-` HCL modules are a weaker fit than code for the existing composition/fan-out logic.

- `-` Operator story weaker than Pulumi's, which matters for the deferred in-cluster phase.

- `-` Higher friction for AI-assisted work and for authoring native providers.

### Option 3: Pulumi

> **Status: ACCEPTED**

Replace Crossplane with Pulumi: TypeScript stacks (`catalog/pulumi/` for shared components such as a
`ClusterVault`-equivalent `ComponentResource`, `projects/<scope>/src/ infrastructure/pulumi/` for per-project stacks),
one npm package per provider, state in Garage (#1097). Pulumi runs the same program locally or in-cluster, which is what
lets the execution model be staged: local-first now, in-cluster later, on one toolchain. The POC validated parity and
the S3 backend; existing Terraform Workspaces fold into native Pulumi providers (`@pulumi/hcloud`, `@pulumi/tailscale`),
collapsing two IaC systems into one.

- `+` No permanently installed CRDs/controllers — sheds the per-provider overhead.
- `+` Fan-out logic as TypeScript `ComponentResource`; strong Kubernetes operator for the deferred in-cluster phase;
  AI-friendly; cheap native-provider authoring.
- `+` Same program runs locally or in-cluster, enabling a staged rollout on one toolchain.
- `+` Consolidates the `provider-terraform` Workspaces into native Pulumi providers.
- `-` Loses Crossplane's always-on reconciliation and ArgoCD visibility _while executed locally_ (recovered when the
  in-cluster phase lands — see Consequences).
- `-` Migration requires importing every resource with zero recreation.

## Decision Outcome

**Chosen option: "Pulumi" (Option 3).**

Pulumi is the only option that removes the per-provider CRD/controller overhead _and_ runs without a cluster. Keeping
Crossplane (Option 1) fails on both counts by construction — the overhead is intrinsic to its model and it cannot manage
cloud state when no cluster exists, which the `rhodes` reconstruction (#370) requires. Terraform/OpenTofu (Option 2)
clears both bars but loses to Pulumi on the qualities that matter most for this specific homelab: expressing the
existing composition/fan-out logic as code rather than HCL modules, a stronger Kubernetes operator for the eventual
in-cluster phase, easier AI-assisted work, and cheaper native-provider authoring for the Garage/Omni/Pocket-Id providers
already planned (#1092/#1093/#1095).

That Pulumi runs the _same_ program locally or in-cluster is what makes the staged execution model possible without
re-choosing tools later: the migration proceeds **local-first** (details and rationale in
[Implementation](#implementation-details--status)), and the in-cluster Operator — Pulumi's, rated the best of the
candidates — is adopted afterward as a deliberate second phase, not forced now while Crossplane is still live.

The footprint magnitude is deliberately not load-bearing: the POC counted the structural explosion (providers, CRDs,
resources) but never measured CPU/RAM. The observed structural overhead is enough to justify leaving Crossplane; the
unmeasured resource delta is a bonus, not the argument.

---

## Consequences

### Positive

- ✅ Sheds Crossplane's per-provider CRD/controller model and its structural resource explosion.
- ✅ Cloud state becomes manageable with no cluster running — unblocking the `rhodes` reconstruction (#370).
- ✅ One toolchain runs locally now and in-cluster later, so the execution model can evolve without re-choosing tools.
- ✅ Terraform Workspaces consolidate into native Pulumi providers, removing a second IaC system.

### Negative

- ⚠️ **While executed locally (current phase)**: no continuous drift reconciliation (drift surfaces only when a human
  runs `pulumi preview`) and no ArgoCD-UI visibility into cloud state. These are precisely the properties the deferred
  **in-cluster phase** restores — so they are phase limitations, not permanent regressions.
- ⚠️ Migration must `pulumi import` every Crossplane-managed resource with zero recreation.
- ⚠️ Pulumi's supply-chain surface (npm dependencies executing with cloud credentials) must be managed — lightly now
  (`npm ci` strict-lockfile installs locally), and with the POC's pod-hardening controls when the in-cluster phase lands
  (see Implementation).

### Neutral

- ⚖️ Unifi remains fully manual (#1094) — unchanged by this decision. Proxmox VM/LXC lifecycle remains manual too; its
  ACL/SDN/backup-storage/pools/ACME layer is carved out as of #1118 (see Non-Goals, Decision Evolution).
- ⚖️ Garage as the state backend (#1097) is a premise, not an effect, of this ADR.

---

## Implementation Details / Status

### Staged execution model

Pulumi runs the same TypeScript program regardless of _where_ it is executed, so the execution model is rolled out in
two phases rather than decided once:

- **Phase 1 — local / out-of-cluster (current).** `pulumi up`/`preview` run on the operator's own machine against
  Garage-backed state; no Pulumi Operator, no CI job (not even a read-only `preview`). Chosen for _now_ because the
  migration is in flight: adding the in-cluster Operator while Crossplane is still reconciling would create a
  dual-reconciler window on the same live resources, and local execution is what the `rhodes` reconstruction needs
  regardless. Only mitigation required at this stage: `npm ci` strict-lockfile installs.
- **Phase 2 — in-cluster (deferred, the eventual target).** Once the migration settles and Crossplane is decommissioned,
  Pulumi execution moves in-cluster via the Pulumi Kubernetes Operator (`Stack` CRs, potentially
  ArgoCD-`ApplicationSet`-generated), restoring continuous reconciliation and ArgoCD visibility. This is deferred, not
  rejected — it is only unsafe _now_, mid-migration. When it lands, the POC's workspace-pod hardening becomes relevant
  again: pinned image tag (`IfNotPresent` pulls), an ephemeral pod-owned npm cache, and a per-Stack egress
  `CiliumNetworkPolicy`.

```text
Phase 1 (now): local, no cluster              Phase 2 (deferred): in-cluster
┌──────────────────────────────┐             ┌──────────────────────────────┐
│ operator's machine           │             │ Pulumi Kubernetes Operator   │
│ npm ci → pulumi up / preview  │             │ Stack CRs → workspace pod    │
└──────────────────────────────┘             │ (pinned image, ephemeral      │
             │                                │  npm cache, egress NetworkPol)│
             ▼                                └──────────────────────────────┘
   Garage state (S3, #1097) ◀───── same state, same TypeScript program ─────▶
             │
             ▼
   Cloud APIs (AWS, Cloudflare, Vault/OpenBao, Hetzner, Tailscale)
```

### Status

- **Completed**: POC (#1089) validated Pulumi/Crossplane functional parity for `ClusterVault`/`DomainIdentity` and
  Garage as the state backend. Footprint (V-005/V-006) not measured.
- **Completed**: `catalog/pulumi/` scaffolded (`ClusterVaultComponent` with Local/Remote/ Tailscaled variants) and all
  five per-project stacks (`chezmoi.sh`, `amiya.akn`, `lungmen.akn`, `kazimierz.akn`, `hass`) written to declare every
  currently Crossplane-managed resource 1:1, including the Terraform Workspaces migrated to native
  `@pulumi/hcloud`/`@pulumi/tailscale` providers.
- **Dropped from scope**: the `DomainIdentity` XRD/`DomainIdentityComponent` (AWS SES domain verification for
  chezmoi.sh) — removed from both Crossplane and the Pulumi scaffolding rather than migrated, since outbound email now
  goes through Mailjet and the AWS SES setup is unused.
- **Completed**: Crossplane decommissioned on `amiya.akn` — controller, providers, per-project infrastructure stacks,
  network policies, and the OpenBao provisioning policy removed. Repository references (`AGENTS.md`, READMEs, bootstrap
  docs, the disaster recovery plan, architecture diagrams) updated to reflect Pulumi as the IaC layer.
- **Pending**: Garage in production (#1097, blocking real `pulumi login`); running the actual `pulumi import` against
  live resources (procedure written, not yet executed — needs live cloud/Vault credentials and a resolved Garage
  endpoint); validating `pulumi preview` is clean post-import; removing `catalog/crossplane/`'s now-unreferenced shared
  XRDs/Compositions and their SEC001 OPA policy (deferred to a follow-up PR to avoid conflicting with other in-flight
  work on that directory); removing the `crossplane` ArgoCD `AppProject` on `amiya.akn`, kept for one more sync cycle so
  ArgoCD can prune the now-source-less Crossplane Applications before the project they reference is deleted; and — later
  — the Phase 2 in-cluster cutover. All tracked on #1091.
- **Standards**: shared components in `catalog/pulumi/`; per-project stacks in
  `projects/<scope>/src/infrastructure/pulumi/`, mirroring the `catalog/crossplane/` +
  `projects/<cluster>/src/infrastructure/crossplane/` split this replaces.

---

## Decision Evolution

- **2026-07-02 (POC, #1089)**: Evaluated Pulumi against Crossplane via the in-cluster Pulumi Kubernetes Operator.
  Confirmed functional parity and Garage as a state backend; did not measure resource footprint (V-005/V-006 pending).
- **2026-07-05 (this ADR)**: Decided to migrate from Crossplane to Pulumi, driven by the per-provider structural
  overhead and the `rhodes` no-cluster requirement, with Terraform/ OpenTofu considered and set aside. Execution staged:
  local-first during the migration, in-cluster (Pulumi Operator) deferred as the eventual target.
- **2026-07-19 (#1118)**: Amended the Proxmox non-goal with a narrow carve-out: Proxmox VE **ACLs, SDN, backup-storage
  registration, resource pools, and ACME** become Pulumi-managed via a new `catalog/pulumi/sdks/proxmox/` bridged
  provider (`@pulumi/proxmox`, from `bpg/terraform-provider-proxmox`) and `stack/proxmox/`, mirroring the
  `proxmox-backup-server`/`b2`/`truenas` bridged-SDK pattern already in use. Driven by three manual `pveum`/`pvesh`
  recipes repeated by hand for every Proxmox-based cluster recreation (CCM/CSI tokens, Omni's SDN access, PBS storage
  registration) — full inventory in #1118. Explicitly does **not** reopen VM/LXC lifecycle (the compute-creation
  capability the original trust-cycle reasoning protects), realms (only the built-in `pam`/`pve` exist; not worth
  codifying), local/`nvme-lvm` storage (stays manual, same as the VM/OS layer), PCI/USB resource mapping (host-specific
  IOMMU addresses that need rediscovery on rebuild regardless — codifying the mapping object saves no real work), or
  notifications (the bridged provider has no PVE notification resource type — PVE stays on its built-in
  `sendmail`→`root@pam` matcher, documented as manual in `stack/proxmox/README.md`).

---

## References and Related Decisions

- **Related ADRs**:
  - [ADR-003: OpenBao Path Naming Conventions](./003-openbao-path-naming-conventions.md) and
    [ADR-004: OpenBao Policy Naming Conventions](./004-openbao-policy-naming-conventions.md) — conventions the migrated
    Vault/OpenBao resources must keep following.
  - [ADR-008: `kazimierz`.AKN — Ansible + Docker Compose over Kubernetes](./008-kazimierz-ansible-over-kubernetes.md) —
    an earlier case of choosing a lighter execution model over forcing an in-cluster pattern.
- **Issue Tracking**:
  - [#1091](https://github.com/chezmoidotsh/arcane/issues/1091) — the migration this ADR decides;
    import/per-family/decommissioning work is tracked there.
  - [#1089](https://github.com/chezmoidotsh/arcane/issues/1089) — Pulumi-vs-Crossplane POC; parity and state-backend
    findings, footprint left unmeasured.
  - [#1097](https://github.com/chezmoidotsh/arcane/issues/1097) — Garage in production as the S3 state backend
    (premise).
  - [#370](https://github.com/chezmoidotsh/arcane/issues/370) — `rhodes` reconstruction; the no-cluster requirement.
  - [#1092](https://github.com/chezmoidotsh/arcane/issues/1092) /
    [#1093](https://github.com/chezmoidotsh/arcane/issues/1093) /
    [#1095](https://github.com/chezmoidotsh/arcane/issues/1095) — native Pulumi providers (Garage, Omni, Pocket-Id).
  - [#1094](https://github.com/chezmoidotsh/arcane/issues/1094) — manual-infrastructure inventory (Proxmox/Unifi
    non-goal).
  - Parent epic: [#1072](https://github.com/chezmoidotsh/arcane/issues/1072).
- **Implementation References**:
  - [Pulumi DIY (S3-compatible) backends](https://www.pulumi.com/docs/iac/operations/stack-management/using-a-diy-backend/)
  - [Pulumi Kubernetes Operator](https://github.com/pulumi/pulumi-kubernetes-operator) — the Phase 2 execution target.
  - [Garage](https://garagehq.deuxfleurs.fr/) — S3-compatible state backend.

---

## Changelog

- **2026-07-05**: **FEATURE**: Initial creation of ADR documenting the migration from Crossplane to Pulumi for cloud
  infrastructure management, with a staged execution model (local-first, in-cluster deferred) — resolving the direction
  of #1091.
- **2026-07-05**: **FEATURE**: Updated Implementation Status — `catalog/pulumi/` and all five per-project stacks
  scaffolded with 1:1 resource parity (#1091, execution still pending).
- **2026-07-05**: **REMOVAL**: Dropped the `DomainIdentity` XRD and `DomainIdentityComponent` from both Crossplane and
  the Pulumi scaffolding — chezmoi.sh's outbound email now goes through Mailjet, making the AWS SES domain identity
  setup unused.
- **2026-07-07**: **REMOVAL**: Decommissioned Crossplane on `amiya.akn` — controller, provider definitions, per-project
  infrastructure stacks, network policies, and the OpenBao provisioning policy removed in favor of the
  already-scaffolded Pulumi replacement (#1091). `catalog/crossplane/`'s shared XRDs/Compositions are kept for now
  (unreferenced, no runtime impact) to avoid conflicting with other in-flight work; their removal is deferred to a
  follow-up PR. The `crossplane` ArgoCD `AppProject` is likewise kept for one more sync cycle, so ArgoCD can prune the
  Crossplane Applications before the project is deleted.
- **2026-07-19**: **FEATURE**: Amended the Proxmox Non-Goal with a narrow ACL/SDN/backup-storage/pools/ACME carve-out
  (#1118), scoped to stay compatible with the original trust-cycle reasoning as long as Pulumi execution remains local
  (Phase 1).
