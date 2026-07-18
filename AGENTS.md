# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, Aider, …) working in this repository. This file is the single
source of truth — `CLAUDE.md` and other CLI-specific files defer to it.

## Repository overview

Arcane is a personal homelab managed as code. Multiple Kubernetes clusters (Talos Linux) deployed via GitOps (ArgoCD),
with Pulumi for cloud infrastructure, OpenBao for secrets, and Cilium (CNI + Gateway API) for networking.

The project has been rewritten four times (see `CHANGELOG.md`). It is currently in its **Steel Age (A3)**, which trades
universal reproducibility for maintainability:

- **Declarative + versioned** (GitOps rules #1 and #2) — non-negotiable.
- **Selective testing** — only critical infrastructure components are tested.
- **Personal use over reusability** — design choices favor the maintainer, not external users.
- **Pragmatic over perfect** — accept trade-offs that keep the system understandable.

When in doubt, prefer the simple, maintainable option over the clever one.

## Project structure

```text
catalog/        Reusable components (charts, compositions, OCI images, …)
├── ansible/        Ansible roles and collections
├── pulumi/          Pulumi components and stacks
├── docker/         Containerfile sources
├── flakes/         Nix flakes producing OCI images
├── fluxcd/         Legacy FluxCD components (being phased out)
├── helm/           Helm chart sources
├── kairos-bundles/ Kairos OS bundles
├── kustomize/      Kustomize bases
├── opa/            OPA/Rego policies for CI-time manifest validation (policies/, rules/)
└── talos/          Talos Linux machine config patches

defaults/       Baseline Helm values / Talos configs used across projects
docs/           ADRs (decisions/), experiments/, procedures/, reports/

projects/       One subdirectory per cluster or standalone app
├── amiya.akn/      Core platform — Talos + ArgoCD, OpenBao, Pocket-Id, Zot (production)
├── chezmoi.sh/     Shared Pulumi stacks (AWS, Cloudflare, Vault, Tailscale)
├── hass/           Home Assistant app project (not a cluster)
├── kazimierz.akn/  VPS public-access gateway (Pangolin + Gerbil + Traefik + CrowdSec)
├── lungmen.akn/    Home applications cluster — Talos + ArgoCD (active dev)
└── shodan.akn/     Future AI stack cluster (planning)

scripts/        Operational scripts (added to PATH by mise)
.agents/skills/ Reusable skill definitions (git-commit, create-pr, cnpg-backup, adr-authoring)
.github/        Issue and PR templates, workflows
```

## Technology stack

| Layer              | Tool                                                                             |
| ------------------ | -------------------------------------------------------------------------------- |
| Kubernetes         | Talos Linux (primary), K3s (legacy `maison`, being retired)                      |
| GitOps             | ArgoCD (standardizing across all clusters)                                       |
| Infrastructure     | Pulumi, Helm, Kustomize, Ansible (bare-metal / VPS provisioning)                 |
| Cluster bootstrap  | Kairos bundles + Talos machine config patches (`catalog/talos/`)                 |
| CNI / Policies     | Cilium                                                                           |
| Ingress / Gateway  | Cilium Gateway API (HTTPRoute, TCPRoute) — Envoy Gateway is being phased out     |
| DNS                | external-dns + Cloudflare operator (managed records & public gateway)            |
| TLS                | cert-manager with DNS-01 validation                                              |
| Storage            | Longhorn (distributed block), SMB CSI driver, NAS-backed PVCs                    |
| Databases          | CloudNative-PG (PostgreSQL), Percona Operator (MongoDB)                          |
| Container registry | Zot (`projects/amiya.akn/src/apps/zot-registry/`)                                |
| Secrets            | OpenBao (Vault fork) + External Secrets Operator; SOPS + age for in-Git secrets  |
| Identity / OIDC    | Pocket-Id (current). Authelia is legacy and being phased out; yaLDAP is retired. |
| Connectivity       | Tailscale (mandatory for clusters outside the homelab) and Pangolin/Newt tunnels |
| Dev environment    | mise (tool versions), Nix flakes (reproducible OCI images), DevContainer support |

## Development environment

All tooling is provisioned through `mise` — never assume system-wide installs.

```sh
mise install        # Install kubectl, helm, argocd, talosctl, openbao, …
mise trust          # Trust .mise.toml (first run only)
```

`mise` sets `KUBECONFIG`, `VAULT_ADDR`, `TALOSCONFIG`, `SOPS_AGE_KEY_FILE`, and adds `scripts/` to PATH.
Project-specific tasks live in `projects/*/.mise.toml`.

### Common commands

Operational scripts in `scripts/` (already on PATH after `mise install`):

| Script                                                            | Purpose                                                                                  |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `argocd:app:sync <path>`                                          | Sync an ArgoCD application from its project path                                         |
| `app:icon:generator`                                              | Generate app icons from source assets                                                    |
| `bao:kv:copy`                                                     | Copy KV secrets between OpenBao paths/mounts                                             |
| `cnpg:db:migrate`                                                 | Migrate data between CloudNative-PG clusters                                             |
| `dist:render [--all\|--staged-only\|--changed\|--branch\|<path>]` | Regenerate `dist/` files from `src/` — always use instead of editing dist files manually |
| `folderinfo`                                                      | Generate the repository structure overview                                               |
| `nix:build:image`                                                 | Build a Nix-based OCI image                                                              |
| `nix:hash:update`                                                 | Refresh Nix package hashes                                                               |
| `nonix`                                                           | Run a command outside the Nix sandbox                                                    |
| `talosctl`                                                        | Wrapper around `talosctl` with context management                                        |

Frequently used `mise` tasks:

```sh
mise run bao:login          # OIDC login to OpenBao (user role)
mise run bao:login:admin    # OIDC login to OpenBao (admin role)
mise run talos:select       # Interactive Talos context picker
mise run talos:use -- <cluster>
mise run talos:nodes -- <cluster>
mise run ansible:install    # Sync Python venv for Ansible roles
```

## GitOps architecture

### ArgoCD (target state — all clusters)

- **App-of-Apps via ApplicationSets**, bootstrapped by `seed.application.yaml`.
- **Apps**: `projects/<cluster>/src/apps/*<name>/` (leading `*` = ArgoCD-managed).
- **Infrastructure (in-cluster)**: `projects/<cluster>/src/infrastructure/kubernetes/<name>/`. The ArgoCD ApplicationSet
  automatically appends `-system` to the directory name to form the target namespace (e.g. `in-gateway/` → namespace
  `in-gateway-system`).
- **Infrastructure (cloud)**: `projects/<cluster>/src/infrastructure/pulumi/<name>/`.
- **Helm overlays**: per-app `helmvalues/` directory (`default.yaml`, `hardened.yaml`, …) with cluster-specific
  `override.helmvalues.yaml` patched via Kustomize.
- **OIDC** via Pocket-Id (hosted on `amiya.akn`) for the ArgoCD UI and other admin interfaces. Envoy Gateway
  `SecurityPolicy` resources protect HTTPRoutes that need authentication (see
  `docs/decisions/005-envoy-gateway-oidc-authentication.md`).

`amiya.akn` is the **core platform cluster** — it hosts the services every other cluster depends on (OpenBao, Authelia,
monitoring). Treat it as production: any change there must preserve availability for downstream clusters.

`lungmen.akn` is under active development (replacing the legacy `maison` FluxCD cluster). See
`projects/lungmen.akn/src/apps/` for the current app inventory; do not enumerate it here.

### FluxCD (legacy)

Components in `catalog/fluxcd/` exist for the legacy `maison` cluster, which is being phased out in favor of
`lungmen.akn`. Don't add new dependencies on FluxCD.

### Pulumi

- Shared components live in `catalog/pulumi/`.
- Per-project stacks live in `projects/<cluster>/src/infrastructure/pulumi/`.
- Secrets are published as Pulumi stack outputs (not pushed to Vault for upstream stacks like LXC).
- The `cluster-vault` component (`catalog/pulumi/components/cluster-vault/`) provisions OpenBao mounts, policies, and
  auth backends per cluster.

### Secrets

- Source of truth: **OpenBao** at `https://vault.chezmoi.sh`.
- KV mounts follow `projects-<cluster>/` and `shared/`.
- **External Secrets Operator** syncs OpenBao → Kubernetes `Secret` objects.
- **SOPS + age** encrypts secrets that must live in Git; key path is `SOPS_AGE_KEY_FILE`.
- Never commit plaintext secrets. Network policies are mandatory for any app touching secrets.

### Network and security

- **Cilium NetworkPolicies** for microsegmentation — required for every app.
- **Cilium Gateway API** for ingress (HTTPRoute, TCPRoute). Public-facing routes are wrapped in a `SecurityPolicy`
  enforcing OIDC via Pocket-Id when authentication is required. Envoy Gateway remains deployed during migration and will
  be removed once all routes are validated on the Cilium GatewayClass (`cilium`). The Gateway lives in the
  `in-gateway-system` namespace (`projects/*/src/infrastructure/kubernetes/in-gateway/`).
- **cert-manager** with DNS-01 validation; **external-dns** publishes records to Cloudflare via the
  `cloudflare-operator`.
- **Public access** to home services goes through Pangolin (`kazimierz.akn` VPS) with a Newt tunnel client running in
  `lungmen.akn`. **Tailscale** remains mandatory for cluster-to-cluster connectivity outside the homelab.

### Storage and databases

- **Longhorn** is the default block storage backend; **SMB CSI driver** mounts shares from the NAS for bulk media
  (Immich, Jellyfin, Paperless).
- **CloudNative-PG** for PostgreSQL clusters with automated S3 backups
  (`projects/*/src/apps/<app>/<app>.postgresql-backup.yaml`).
- **Percona Operator for MongoDB** for the few apps that require it.
- Database migrations between CNPG clusters use `scripts/cnpg:db:migrate` (see `.agents/skills/cnpg-backup/SKILL.md` for
  the backup procedure).

### Important paths

- Bootstrap docs: `projects/*/docs/BOOTSTRAP_*.md` and `projects/*/docs/bootstrap/`
- Architecture diagrams: `projects/*/architecture.d2` → `projects/*/docs/assets/architecture.svg`
- Shared D2 styles: `docs/assets/d2/architecture-styles.d2`
- ADRs: `docs/decisions/`
- Experiments: `docs/experiments/`

## Commits and pull requests

This repository uses a **symbol-based commit type convention** with mandatory square-bracket scopes, validated by
`commitlint` (`.commitlintrc.js` is the authoritative source for allowed types and scopes).

Format: `type[scope]: Subject` — e.g. `+[project:lungmen.akn]: Add Forgejo`, `^[deps]: cert-manager to v1.16.0`,
`![project:amiya.akn]: Fix OIDC redirect loop`. Breaking changes use `+!`, `~!`, or `-!` as the type.

Detailed conventions, formats, and validation tooling live in skill definitions:

- `.agents/skills/git-commit/SKILL.md` — commit format, scopes, body rules, validation
- `.agents/skills/create-pr/SKILL.md` — branch naming, PR templates, pre-flight checks
- `.agents/skills/adr-authoring/SKILL.md` — Architecture Decision Records
- `.agents/skills/cnpg-backup/SKILL.md` — CloudNative-PG backup procedure
- `.github/PULL_REQUEST_TEMPLATE/` — feature / bugfix / refactoring templates
- `.github/ISSUE_TEMPLATE/AGENT_TEMPLATES/` — AI-friendly issue templates

Read the relevant skill **before** running `git commit` or opening a PR — they enforce project conventions and surface
required pre-flight checks (signature, validator, etc.).

In short:

- One logical change per commit; multiple scopes allowed when atomic (`scope1,scope2`).
- Commit subject starts with an uppercase letter after the scope.
- Body explains **why**, not **what**, wrapped at 80 chars.
- Commits must be GPG-signed (`-S`); `Signed-off-by` (`-s`) is the human committer's responsibility — agents must not
  add it on the user's behalf.
- Use `Assisted-by: <provider>:<model>` to attribute AI involvement.

## Operating constraints for AI agents

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

Update the document when context shifts significantly, re-read it every \~15 exchanges, and ask the user before deleting
it once the work is merged.

Skip session docs for one-off questions, single-file edits, or trivial changes.

### Scope management

- Surface deviations from the stated objective explicitly.
- For unrelated bugs or improvements discovered along the way, propose a separate GitHub issue rather than expanding the
  current change.
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
