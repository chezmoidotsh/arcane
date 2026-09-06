# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, Aider, …) working in this repository. This file is the single
source of truth — `CLAUDE.md` and other CLI-specific files defer to it. Every claim below was checked against the actual
tree, git history, or file contents, not assumed — keep it that way when you edit it.

## Repository overview

Arcane is a personal homelab managed as code: two Talos Linux Kubernetes clusters plus a handful of non-Kubernetes
projects, all deployed via GitOps (ArgoCD), with Pulumi for cloud/hypervisor infrastructure, OpenBao for secrets, and
Cilium (CNI + Gateway API) for networking.

The project has been rewritten four times (see `CHANGELOG.md` — it's a narrative, not a real changelog). It is currently
in its **Steel Age (A3)**, which trades universal reproducibility for maintainability:

- **Declarative + versioned** (GitOps rules #1 and #2) — non-negotiable.
- **Selective testing** — only critical infrastructure components are tested.
- **Personal use over reusability** — design choices favor the maintainer, not external users.
- **Pragmatic over perfect** — accept trade-offs that keep the system understandable.

When in doubt, prefer the simple, maintainable option over the clever one. Architecture Decision Records
(`docs/decisions/`) record the reasoning behind the bigger calls — check there before re-litigating something that was
already decided (and check the `status` field: `proposed` and `accepted` aren't always `implemented` yet).

## Project structure

```text
catalog/        Reusable components (charts, compositions, OCI images, …)
├── ansible/        Ansible roles and collections
├── flakes/         Nix flakes producing OCI images
├── fluxcd/         Retired FluxCD components (kept for reference; no active consumer — see GitOps architecture)
├── helm/           Helm chart sources (e.g. mutualized-cnpg-databases)
├── kubernetes/     Shared kustomize bases + reference Helm values for infra components
├── kustomize/      Kustomize bases
├── nix/            Nix modules (incl. SideroLabs Omni NixOS modules/LXCs)
├── omni/           Shared Omni cluster-template base + Talos-on-Proxmox machine-class catalog
├── opa/            OPA/Rego policies for CI-time manifest validation (policies/, rules/)
├── pulumi/         Pulumi components and stacks
└── talos/          Talos Linux bootstrap manifests + machine config patches

defaults/       Baseline Helm values / Talos configs used across projects
docs/           ADRs (decisions/), procedures/, experiments/, incidents/, migrations/, network/, archives/

projects/       One subdirectory per cluster or standalone app
├── chezmoi.sh/     Shared Pulumi stacks — Proxmox host, OpenBao, Tailscale, observability LXC, OCI registry
├── hass/           Home Assistant app project (not a cluster)
├── kazimierz.akn/  VPS public-access gateway — Ansible + Docker Compose, deliberately not Kubernetes (ADR-008)
├── lungmen.akn/    Home applications cluster — Talos + ArgoCD (active dev, apps added/bumped frequently)
├── rhodes.akn/     Core platform — Talos + ArgoCD, OpenBao, Pocket-Id (production)
└── shodan.akn/     Future AI stack cluster (planning only — README + architecture diagram, no manifests yet)

scripts/        Operational scripts (added to PATH by mise)
.agents/skills/ Reusable skill definitions — one directory per skill, each with its own SKILL.md
.github/        Issue and PR templates, workflows
```

## Technology stack

Grouped by concern rather than alphabetically, since agents usually need "what handles X" more than an inventory.

| Concern               | Current choice                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kubernetes distro     | Talos Linux, on every cluster (the legacy K3s `maison` cluster was fully decommissioned)                                                                                                                                 |
| Cluster bootstrap     | Sidero Omni (`catalog/omni/` — cluster templates + machine classes) + Talos machine config patches (`catalog/talos/`); replaced Kairos bundles                                                                           |
| GitOps engine         | ArgoCD — the sole GitOps engine on every Kubernetes cluster (ADR-011)                                                                                                                                                    |
| Manifest rendering    | Pre-rendered `dist/` manifests generated from `src/` (ADR-011) — hardens the supply chain and keeps ArgoCD diffs readable. **Never hand-edit `dist/`**; run `dist:render`                                                |
| Cloud/host IaC        | Pulumi (TypeScript). Crossplane still runs a handful of legacy resources (Proxmox, OCI) but is being migrated to Pulumi (ADR-015, accepted) — don't add new Crossplane resources                                         |
| Bare-metal/VPS config | Ansible (`catalog/ansible/`) — used where Kubernetes isn't (`kazimierz.akn`, Proxmox host prep)                                                                                                                          |
| CNI / NetworkPolicies | Cilium, default-deny by default                                                                                                                                                                                          |
| Ingress / Gateway     | Cilium Gateway API (HTTPRoute, TCPRoute). Envoy Gateway still runs a couple of routes during migration — new routes go on the `cilium` GatewayClass, not Envoy                                                           |
| Internal DNS          | external-dns with the UniFi and BIND/rfc2136 providers (LAN + internal DNS server) — no public DNS record management in this repo                                                                                        |
| TLS                   | cert-manager, DNS-01 validation. Cloudflare's role is limited to the ACME DNS-01 API token (wildcard `chezmoi.sh` certs); it does not manage DNS records or tunnels                                                      |
| Public access         | Pangolin + Gerbil + Traefik + CrowdSec on `kazimierz.akn` (a VPS), with a Newt tunnel client in `lungmen.akn`. Cloudflare Tunnel was fully retired in favor of this (see `projects/lungmen.akn/README.md` history)       |
| Cluster connectivity  | Tailscale — mandatory for any cluster-to-cluster traffic outside the homelab                                                                                                                                             |
| Block storage         | Proxmox CSI plugin + Proxmox CCM (LVM-thin volumes decoupled from VM lifecycle) — **not Longhorn**; Longhorn was deliberately dropped for new clusters (issue #1028/#1188, `docs/experiments/20260617-proxmox-csi-ccm/`) |
| Bulk/NAS storage      | SMB CSI driver, mounting NAS shares for Immich, Jellyfin, Paperless-ngx                                                                                                                                                  |
| Relational databases  | CloudNative-PG (PostgreSQL) with automated S3 backups. Consolidating per-app clusters into shared CNPG clusters is proposed but not yet implemented (ADR-009, status: proposed)                                          |
| Other databases       | None currently deployed — Percona Operator for MongoDB is not in use (no matching manifests in the tree) despite older docs mentioning it                                                                                |
| Container registry    | Zot (`projects/chezmoi.sh/src/infrastructure/pulumi/stack/zot-registry.ts`)                                                                                                                                              |
| Secrets source        | OpenBao (`https://vault.chezmoi.sh`), synced to Kubernetes `Secret`s via External Secrets Operator; SOPS + age for secrets that must live in Git (ADR-001–004)                                                           |
| Identity / SSO        | Pocket-Id is the **sole** identity provider. Authelia and yaLDAP are both fully retired — no remaining deployments (only stray comments/image-build recipes reference them)                                              |
| Observability         | VictoriaMetrics + VictoriaLogs + vmalert + Alertmanager on a single NixOS LXC (ADR-013), fed by per-cluster vmagent (metrics) and Vector (logs); Grafana for dashboards                                                  |
| Policy enforcement    | OPA/Rego, CI-time only via conftest + trunk (ADR-012 — replaced Kyverno; no in-cluster admission webhook)                                                                                                                |
| Network topology      | Dual-NIC Proxmox host + Proxmox SDN VXLAN, migrated from a single-VLAN setup (ADR-014, `docs/network/`)                                                                                                                  |
| Dev environment       | mise (tool versions), Nix flakes (reproducible OCI images), an experimental DevContainer under `docs/experiments/` (not repo-wide)                                                                                       |

## Development environment

All tooling is provisioned through `mise` — never assume system-wide installs.

```sh
mise install        # Install kubectl, helm, argocd, talosctl, openbao, omnictl, cilium-cli, …
mise trust          # Trust .mise.toml (first run only)
```

`mise` sets `KUBECONFIG`, `VAULT_ADDR`, `TALOSCONFIG`, `SOPS_AGE_KEY_FILE`, and adds `scripts/` to PATH.
Project-specific tasks live in `projects/*/.mise.toml`.

### Common commands

Operational scripts in `scripts/` (already on PATH after `mise install`):

| Script                                                            | Purpose                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `argocd:app:sync <path>`                                          | Sync an ArgoCD application from its project path                                          |
| `app:icon:generator`                                              | Generate app icons from source assets                                                     |
| `bao:kv:copy`                                                     | Copy KV secrets between OpenBao paths/mounts                                              |
| `bao:secret:audit`                                                | OpenBao hygiene audit — naming drift, dangling refs, orphaned secrets (metadata-only)     |
| `bao:smb:drift-check`                                             | Detect drift between Pulumi-managed SMB service-account passwords and OpenBao (hash-only) |
| `cnpg:db:migrate`                                                 | Migrate data between CloudNative-PG clusters                                              |
| `dist:render [--all\|--staged-only\|--changed\|--branch\|<path>]` | Regenerate `dist/` files from `src/` — always use instead of editing dist files manually  |
| `folderinfo`                                                      | Generate the repository structure overview                                                |
| `nix:build:image`                                                 | Build a Nix-based OCI image                                                               |
| `nix:build:lxc`                                                   | Build a Nix-based Proxmox LXC image                                                       |
| `nix:hash:update`                                                 | Refresh Nix package hashes                                                                |
| `nonix`                                                           | Run a command outside the Nix sandbox                                                     |
| `omni:template:lint`                                              | Check Omni cluster templates use ADR-014-compliant CIDRs                                  |
| `puuluumi`                                                        | Interactive Pulumi stack picker/wrapper                                                   |
| `talosctl`                                                        | Wrapper around `talosctl` with context management                                         |

Frequently used `mise` tasks:

```sh
mise run bao:login                      # OIDC login to OpenBao (user role)
mise run bao:login:admin                # OIDC login to OpenBao (admin role)
mise run talos:select                   # Interactive Talos context picker
mise run talos:use -- <cluster>
mise run talos:nodes -- <cluster>
mise run talos:dashboard -- <cluster>   # Live Talos dashboard for a cluster
mise run omni:machineclass:list         # List Omni machine classes (catalog/omni/machineclasses/)
mise run omni:machineclass:diff         # Diff local machine-class definitions against Omni
mise run ansible:install                # Sync Python venv for Ansible roles
```

## GitOps architecture

### ArgoCD (all Kubernetes clusters)

- **App-of-Apps via ApplicationSets**, bootstrapped by `seed.application.yaml`.
- **Apps**: `projects/<cluster>/src/apps/*<name>/` (leading `*` = ArgoCD-managed).
- **Infrastructure (in-cluster)**: `projects/<cluster>/src/infrastructure/kubernetes/<name>/`. The ArgoCD ApplicationSet
  automatically appends `-system` to the directory name to form the target namespace (e.g. `in-gateway/` → namespace
  `in-gateway-system`).
- **Infrastructure (cloud/host)**: `projects/<cluster>/src/infrastructure/pulumi/<name>/`.
- **Helm overlays**: per-chart `<chart>.helmvalues/` directory (e.g. `cert-manager.helmvalues/`, `openbao.helmvalues/`)
  holding `default.yaml`; cluster-specific overrides live in the same directory (e.g. `override.yaml`) and are wired in
  via the kustomization's `additionalValuesFiles`. Shared catalog defaults instead use
  `catalog/kubernetes/<chart>/helm/default.helmvalues.yaml` / `hardened.helmvalues.yaml`.
- **OIDC** via Pocket-Id (hosted on `rhodes.akn`) for the ArgoCD UI and other admin interfaces. Envoy Gateway
  `SecurityPolicy` resources protect HTTPRoutes that need authentication (ADR-005).

`rhodes.akn` is the **core platform cluster** — it hosts the services every other cluster depends on (OpenBao,
Pocket-Id, monitoring collection). Treat it as production: any change there must preserve availability for downstream
clusters.

`lungmen.akn` is the home applications cluster and is under active development — apps are added and bumped frequently.
See `projects/lungmen.akn/src/apps/` for the current app inventory; do not enumerate it here.

`kazimierz.akn` and `shodan.akn` are **not** part of the ArgoCD fleet: `kazimierz.akn` is a VPS run with Ansible +
Docker Compose by deliberate choice (ADR-008), and `shodan.akn` has no manifests yet (planning stage only).

### Rendered manifests pattern (ADR-011)

`dist/` holds fully-rendered Kubernetes manifests generated from `src/` — this is what ArgoCD actually syncs, instead of
letting it fetch Helm charts and evaluate Kustomize at sync time. This exists for supply-chain hardening (no surprise
upstream chart content lands in the cluster unreviewed) and GitOps diffability (a PR diff shows exactly what will change
on the cluster). Always run `dist:render` after touching anything under `src/`; never hand-edit `dist/`.

### FluxCD (retired)

`catalog/fluxcd/` held components for the legacy K3s `maison` cluster. `maison` has been fully decommissioned (its
workloads migrated to `lungmen.akn`) and nothing in `projects/` references this catalog anymore — it's kept only for
historical reference. Don't add new dependencies on FluxCD; treat this directory as dead code, not an active migration
target.

### Pulumi and Crossplane

- Shared components live in `catalog/pulumi/`.
- Per-project stacks live in `projects/<cluster>/src/infrastructure/pulumi/`.
- Secrets are published as Pulumi stack outputs (not pushed to Vault for upstream stacks like LXC).
- The `cluster-vault` component (`catalog/pulumi/components/cluster-vault/`) provisions OpenBao mounts, policies, and
  auth backends per cluster.
- Crossplane originally ran all cloud/cloud-adjacent infrastructure (`amiya.akn`, now merged into `rhodes.akn`) via ~12
  provider packages and custom XRDs/Compositions. ADR-015 (accepted) moves this to plain Pulumi stacks — don't grow the
  Crossplane footprint further; port what you touch to Pulumi instead when practical.

### Secrets

- Source of truth: **OpenBao** at `https://vault.chezmoi.sh`.
- KV mounts follow `<cluster>/` (e.g. `rhodes.akn/`), plus `shared/` and `personal/` (ADR-002/003/004).
- **External Secrets Operator** syncs OpenBao → Kubernetes `Secret` objects.
- **SOPS + age** encrypts secrets that must live in Git; key path is `SOPS_AGE_KEY_FILE`.
- Never commit plaintext secrets. Network policies are mandatory for any app touching secrets.

### Network and security

- **Cilium NetworkPolicies** for microsegmentation — required for every app.
- **Cilium Gateway API** for ingress (HTTPRoute, TCPRoute). Public-facing routes are wrapped in a `SecurityPolicy`
  enforcing OIDC via Pocket-Id when authentication is required. Envoy Gateway remains deployed for a handful of
  not-yet-migrated routes; new routes go on the `cilium` GatewayClass. The Gateway lives in the `in-gateway-system`
  namespace (`projects/*/src/infrastructure/kubernetes/in-gateway/`).
- **cert-manager** with DNS-01 validation. **external-dns** manages internal-only DNS records via the UniFi and
  BIND/rfc2136 providers — there is no public/Cloudflare-managed DNS zone in this repo.
- **Public access** to home services goes through Pangolin (`kazimierz.akn` VPS) with a Newt tunnel client running in
  `lungmen.akn`. **Tailscale** remains mandatory for cluster-to-cluster connectivity outside the homelab. Cloudflare
  Tunnel, used in an earlier iteration, has been fully retired.
- **Network topology**: dual-NIC Proxmox host + Proxmox SDN VXLAN, per ADR-014 (`docs/network/`); migrated off a single
  flat VLAN.

### Storage and databases

- **Proxmox CSI plugin + Proxmox CCM** provision block storage as LVM-thin volumes on the Proxmox hypervisor, decoupled
  from VM lifecycle — this is the current default, not Longhorn (see `docs/experiments/20260617-proxmox-csi-ccm/`).
- **SMB CSI driver** mounts NAS shares for bulk media (Immich, Jellyfin, Paperless-ngx).
- **CloudNative-PG** for PostgreSQL clusters with automated S3 backups
  (`projects/*/src/apps/<app>/<app>.postgresql-backup.yaml`). Consolidating into fewer shared clusters is proposed, not
  yet done (ADR-009).
- No MongoDB/Percona workloads currently exist in the tree — don't assume that stack is available.
- Database migrations between CNPG clusters use `scripts/cnpg:db:migrate` (see `.agents/skills/cnpg-backup/SKILL.md` for
  the backup procedure, `.agents/skills/cnpg-troubleshoot/SKILL.md` for troubleshooting).

### Observability

- **VictoriaMetrics + VictoriaLogs + vmalert + Alertmanager** run centrally on a single NixOS LXC on the Proxmox host
  (ADR-013), fronted by Caddy.
- Each cluster runs lightweight collection agents only: **vmagent** for metrics, **Vector** for logs — both push to the
  central LXC.
- **Grafana** provides dashboards and non-paging alerts, with OIDC via Pocket-Id.

### Important paths

- Bootstrap docs: `projects/*/docs/BOOTSTRAP_*.md` and `projects/*/docs/bootstrap/`
- Architecture diagrams: `projects/*/architecture.d2` → `projects/*/docs/assets/architecture.svg`
- Shared D2 styles: `docs/assets/d2/styles.architecture.d2`
- ADRs: `docs/decisions/` — check `status` (proposed/accepted/implemented) before treating one as current behavior
- Experiments: `docs/experiments/`
- Incidents: `docs/incidents/` — postmortems for production issues
- Migrations: `docs/migrations/` — cross-cluster migration records (e.g. `amiya.akn->rhodes.akn.md`)
- Network reference: `docs/network/` (topology, IPAM)

## Commits and pull requests

This repository uses a **symbol-based commit type convention** with mandatory square-bracket scopes, validated by
`commitlint` (`.commitlintrc.js` is the authoritative source for allowed types and scopes).

Format: `type[scope]: Subject` — e.g. `+[project:lungmen.akn]: Add Forgejo`, `^[deps]: cert-manager to v1.16.0`,
`![project:rhodes.akn]: Fix OIDC redirect loop`. Breaking changes use `+!`, `~!`, or `-!` as the type.

Detailed conventions, formats, and validation tooling live in skill definitions — read the relevant one **before**
running `git commit` or opening a PR, they enforce project conventions and surface required pre-flight checks
(signature, validator, etc.):

- `.agents/skills/git-commit/SKILL.md` — commit format, scopes, body rules, validation
- `.agents/skills/create-pr/SKILL.md` — branch naming, PR templates, pre-flight checks, post-creation monitoring
- `.agents/skills/adr-authoring/SKILL.md` — Architecture Decision Records
- `.agents/skills/create-issue/SKILL.md` — issue drafting conventions
- `.github/PULL_REQUEST_TEMPLATE/` — feature / bugfix / refactoring templates
- `.github/ISSUE_TEMPLATE/AGENT_TEMPLATES/` — AI-friendly issue templates

`.agents/skills/` holds 17 skills in total (operational runbooks like `cnpg-troubleshoot`, `omni-talos-troubleshoot`,
`lxc-maintenance`, `provider-upgrade`; process skills like `postmortem`, `triage-issues`, `sop-authoring`,
`auto-file-bug`; Pulumi-specific ones like `pulumi-overview`, `pulumi-best-practices`, `pulumi-component`,
`pulumi-debug-failed-operation`) — check that directory for something matching your task before improvising a procedure
from scratch.

In short:

- One logical change per commit; multiple scopes allowed when atomic (`scope1,scope2`).
- Commit subject starts with an uppercase letter after the scope.
- Body explains **why**, not **what**, wrapped at 80 chars.
- Commits must be GPG-signed (`-S`); `Signed-off-by` (`-s`) is the human committer's responsibility — agents must not
  add it on the user's behalf.
- Use `Assisted-by: <provider>:<model>` to attribute AI involvement.

## Operating constraints for AI agents

### Never dump the full environment

A Claude Code hook (`.claude/settings.json` + `.claude/hooks/redact-secrets`, added after repeated credential-leak
incidents) denies any Bash command that dumps the whole environment — `env`, `mise env`, `printenv`, `set`, `export`,
`declare -x` — even mid-chain (`build && env`). All other Bash output is piped through a gitleaks-based filter that
replaces detected secrets with `[REDACTED:<rule>]` before it reaches the model. Don't try to work around either
mechanism (e.g. by reading `/proc/self/environ`); read a single named variable instead, or use `mise exec -- <cmd>` /
`mise run <task>`. This applies to Claude Code specifically — check for equivalent guardrails if you're a different
agent.

### Asking questions — always use the interactive tool

When you need input from the user, use the platform's interactive question tool rather than embedding the question in
plain text output:

- **OpenCode** → `question` tool
- **Claude Code / other agents** → equivalent ask/prompt tool if available; fall back to plain text only when no
  interactive tool exists in the current runtime

Using the interactive tool lets the user answer without consuming a full premium response turn. Plain-text questions
buried in a response are easy to miss and expensive to answer. This applies everywhere: missing context, ambiguous
decisions, confirmation before destructive actions, clarification on scope.

### CLI: no interactive commands, no pagers

Agents cannot drive interactive tools or scroll through pagers. Always:

- Append `| cat` or use `--no-pager` for git: `git --no-pager log`, `git --no-pager diff`.
- Avoid `less`, `more`, `man`, `git rebase -i`, `git add -p`, `git add -i`.
- Prefer batch operations and explicit file arguments over interactive selection.

If the user requests an interactive flow, explain the limitation and propose the non-interactive equivalent
(`git rebase --continue`, `git add file1 file2`, `cat file`, …).

### kubectl apply: always use --server-side

Client-side `kubectl apply` writes the full manifest into the `kubectl.kubernetes.io/last-applied-configuration`
annotation. Kubernetes caps total `metadata.annotations` size at 262144 bytes per object; large CRDs (CloudNativePG's
`Cluster`/`Pooler` schemas, for example) can exceed that on their own, and once the annotation is oversized any further
write to the object — server-side apply included — is rejected until the annotation is removed. Always pass
`--server-side` for manual `kubectl apply` against this repo's clusters; it never writes that annotation.

### Destructive and shared-state operations

- Never force-push, `git reset --hard`, drop branches, or rewrite published history without explicit user confirmation
  in this turn.
- Never auto-update or close GitHub issues; propose the action and wait.
- For anything that affects shared state (pushes, PR creation/comments, deployments), confirm before acting — even if a
  similar action was authorized earlier in the session.

### Session documentation (for multi-step work)

When a task spans 3+ steps, involves architecture decisions, or requires context across multiple exchanges, maintain a
session document in `.agents/sessions/` named `YYYYMMDD-description.md`. Ask the user before creating one.

Minimum template:

```markdown
# <title>

## Objective

<what we're trying to achieve>

## Context & reflections

<decisions, alternatives considered, open questions>

## Change history

- <chronological log of significant actions>

## Attention points

<risks, blockers, pending user decisions>

## Next steps

- [ ] <prioritized actions>
```

Update the document when context shifts significantly, re-read it every ~15 exchanges, and ask the user before deleting
it once the work is merged.

Skip session docs for one-off questions, single-file edits, or trivial changes.

### Scope management

- Surface deviations from the stated objective explicitly.
- For unrelated bugs or improvements discovered along the way, propose a separate GitHub issue rather than expanding the
  current change.
- **Exception — serious bugs, filed automatically:** when what you found is evidenced (not a hunch), would cause real
  harm if it recurred (outage, data loss, security exposure, silent corruption), and doesn't require expanding the
  current task to fix, don't just propose it — file the issue yourself, without waiting for a go-ahead. Do this via a
  fresh subagent (not a context-inheriting fork) carrying a self-contained brief, so drafting the issue doesn't cost the
  current conversation's context. See `.agents/skills/auto-file-bug/SKILL.md` for the exact severity bar and workflow.
- Ask permission before spending time on investigations that aren't strictly required to complete the user's request.

## Operational quick reference

### ArgoCD sync issues

```sh
argocd app get <namespace>/<name>
./scripts/argocd:app:sync projects/<cluster>/src/apps/<name>
kubectl get externalsecrets -n <namespace>
```

### Pulumi / Infrastructure

```sh
pulumi stack                    # show current stack
pulumi preview                  # diff pending changes (mise run pulumi:diff)
pulumi up                       # apply changes (mise run pulumi:apply)
vault auth -method=oidc        # via mise run bao:login
```

### Network

```sh
cilium status
kubectl get netpol -A
kubectl get httproute,gateway -A
```

### Storage

```sh
kubectl get storageclass                       # expect proxmox-lvmthin-* as default, not longhorn
kubectl get pvc -A -o wide
```

### Observability

```sh
# Metrics/logs live on the central NixOS LXC, not in-cluster — check vmagent/Vector shipping first
kubectl get pods -n o11y-system
```
