---
status: "accepted"
date: 2026-05-24
decision-makers: ["Alexandre"]
assisted-by: ["claude-sonnet-4-6"]
informed: []
---

# Adopt pre-rendered manifests pattern to harden supply-chain security and enable GitOps diffability

## Table of Contents

* [Context and Problem Statement](#context-and-problem-statement)
* [Decision Drivers](#decision-drivers)
* [Considered Options](#considered-options)
  * [Option 1: Pre-rendered manifests committed to Git (dist/ pattern)](#option-1-pre-rendered-manifests-committed-to-git-dist-pattern)
  * [Option 2: Self-hosted Helm chart mirror only](#option-2-self-hosted-helm-chart-mirror-only)
  * [Option 3: Replace all Helm charts with hand-written manifests](#option-3-replace-all-helm-charts-with-hand-written-manifests)
  * [Option 4: Flux OCI artifacts](#option-4-flux-oci-artifacts)
* [Decision Outcome](#decision-outcome)
* [Consequences](#consequences)
  * [Positive](#positive)
  * [Negative](#negative)
  * [Neutral](#neutral)
* [Implementation Details / Status](#implementation-details--status)
* [References and Related Decisions](#references-and-related-decisions)
* [Changelog](#changelog)

## Context and Problem Statement

ArgoCD is the sole GitOps engine across all clusters in this homelab. It synchronises
cluster state by reading source directories from this repository and, for components that
use Kustomize's `helmCharts:` stanza, it fetches Helm chart tarballs from upstream
registries at every sync cycle. This is the default "rendered at sync time" operating mode
recommended by the Argo project and is widely adopted in the industry.

In practice this creates three compounding problems.

**Supply-chain attack surface at sync time.** Every ArgoCD sync that includes a `helmCharts:`
source makes a live network request to an external registry — `https://helm.cilium.io/`,
`https://charts.longhorn.io/`, `https://argoproj.github.io/argo-helm/`, and roughly a dozen
others. A DNS hijack, BGP route leak, registry compromise, or mutable OCI tag rewrite
between two syncs could inject malicious rendered output into the cluster without any trace
in Git. The Git repository's integrity guarantees stop at the `kustomization.yaml` version
pin; they do not extend to the tarball that version pin resolves to at runtime. This concern
is no longer theoretical: several high-profile supply-chain incidents in the cloud-native
ecosystem over 2023–2025 have demonstrated that Helm registries are a real attack surface
(see CISA AA23-131A).

**Invisible resource diffs on chart upgrades.** When Renovate opens a PR to bump a chart
version (e.g., `longhorn 1.6.2 → 1.7.0`), the only visible change in the diff is a
one-line version string inside `kustomization.yaml`. The actual Kubernetes resource delta —
new CRDs, changed RBAC rules, added container arguments, removed ServiceAccounts — is
invisible to reviewers. This makes it impossible to perform a meaningful security review of
chart upgrades, which is especially problematic for cluster-infrastructure components like
Cilium, Longhorn, or ArgoCD itself.

**Implicit external trust boundary.** The GitOps model's value proposition is that the Git
repository is the single source of truth and the trust anchor. Runtime Helm fetches extend
the trust boundary beyond Git to external registries, violating this principle. Two syncs
of the same commit can theoretically produce different cluster states if the upstream
registry mutates a tag — undermining reproducibility and auditability.

The strategic question this ADR answers is: **How can we eliminate runtime Helm registry
fetches entirely, ensuring that ArgoCD applies only content that is fully auditable in Git,
while preserving upgrade automation and maintaining the GitOps workflow?**

## Decision Drivers

* **Functional Requirements**:
  * ArgoCD must reach `Synced / Healthy` from Git content alone — no chart fetches at sync
    time for non-SOPS applications.
  * A chart version bump must produce a readable `git diff` of the actual Kubernetes
    resource changes that will be applied to the cluster.
  * A pre-commit mechanism must prevent committing stale rendered output when sources
    change.
  * SOPS-encrypted secrets must never appear in plaintext in any committed file.
  * Existing ArgoCD ApplicationSet discovery patterns must continue to work; no manual
    Application object management.

* **Non-Functional Requirements**:
  * The trust boundary must end at the Git repository boundary — no runtime network calls
    to external registries for resources that are already known at commit time.
  * Idempotent rendering: running the render step twice on the same sources must produce
    bit-for-bit identical output.
  * Git history on `dist/` directories serves as an auditable record of every Kubernetes
    resource state that has ever been applied to the cluster.
  * ArgoCD sync performance must improve or remain unchanged (no chart tarball download
    round-trip).

* **Constraints**:
  * The repository standardises on ArgoCD; Flux or other GitOps controllers are not in
    scope (see Steel Age principles in `AGENTS.md`).
  * Some components (`argocd`, `pocket-id`, `vault`, `tailscale`, `cloudflare-public-gateway`)
    embed SOPS-encrypted secrets decrypted by the KSOPS plugin at ArgoCD sync time.
    Rendering them would require the private age key at commit time — which is intentionally
    absent from CI — or would expose plaintext secrets in Git.
  * Kustomize and Helm are available via `mise`; no new cluster-side tooling may be
    introduced.

## Considered Options

### Option 1: Pre-rendered manifests committed to Git (dist/ pattern)

> **Status: ACCEPTED**

Each non-SOPS application directory gains a parallel `dist/` counterpart. At commit time,
`kustomize build --enable-helm <src-path>` is executed locally; its output is split into
one file per Kubernetes resource, named `<group>.<version>.<Kind>.<name>.yaml`, and
committed under `dist/`. ArgoCD ApplicationSets are updated to discover and source from
`dist/` instead of `src/`. The `src/` tree retains the Kustomize and Helm value sources as
the authoring interface, but ArgoCD never renders them at sync time.

For components that embed SOPS-encrypted secrets, the kustomization is split: the KSOPS
`generators:` block is extracted into a minimal `src/<app>/sops/kustomization.yaml` overlay
that references the encrypted files in the parent directory. The main `src/<app>/kustomization.yaml`
becomes SOPS-free and is pre-rendered to `dist/<app>/`. The ArgoCD Application for that
component uses two sources: `dist/<app>/` for the rendered manifests and
`src/<app>/sops/` for the KSOPS-generated secrets, with the second source declared in the
app's `dist/<app>/.application.patch`.

Enforcement is layered:

* A trunk pre-commit action re-renders only the projects touched in the current commit and
  stages the `dist/` output automatically.

* A trunk pre-push action runs a full staleness check across all `dist/` directories.

* A CI job on every push and pull request re-renders everything and fails if the committed
  `dist/` diverges from the freshly rendered output.

* `+` Eliminates all runtime Helm registry fetches for non-SOPS applications.

* `+` Every chart upgrade produces a full, readable `git diff` of the actual Kubernetes
  resources; security review of Renovate PRs becomes practical.

* `+` Git history on `dist/` is an auditable log of every resource state ever applied.

* `+` ArgoCD sync becomes a pure `kubectl apply` with no external network dependency,
  improving both speed and reliability.

* `+` Rollback via `git revert` undoes the exact resource state that was previously applied.

* `+` SOPS exception is minimised: only secret-generating overlays remain in `src/`;
  all other app resources are pre-rendered.

* `-` `dist/` directories add committed generated content that must be kept in sync.
  Enforcement hooks and CI mitigate drift risk.

* `-` Initial migration requires rendering and committing all existing components, which
  is a one-time high-effort step.

* `-` SOPS app refactoring (extracting `sops/` overlays) adds complexity for the handful
  of affected components.

### Option 2: Self-hosted Helm chart mirror only

> **Status: REJECTED**

All upstream Helm charts are mirrored into a self-hosted OCI registry (e.g., Forgejo's
OCI registry at `forgejo.local`) and ArgoCD's `helmCharts:` sources are updated to pull
from there. Charts are fetched from upstream registries only when explicitly mirrored via
Renovate or a CI job, not at every ArgoCD sync.

This reduces the runtime attack surface — a compromised `helm.cilium.io` can no longer
inject content at sync time — but does not eliminate it. ArgoCD still renders manifests at
sync time from the mirrored chart: the rendered output remains ephemeral, invisible in
`git diff`, and non-reproducible across syncs if a mirrored tag is overwritten. The diff
blindness problem on Renovate PRs is entirely unaddressed.

* `+` Reduces dependency on upstream registry availability.
* `+` Preserves existing ArgoCD rendering workflow with minimal changes.
* `-` Rendered output is still ephemeral; `git diff` on chart bumps remains blind.
* `-` Self-hosted OCI registry becomes a new single point of failure for all syncs.
* `-` Mirroring infrastructure adds operational overhead without solving the core problem.

### Option 3: Replace all Helm charts with hand-written manifests

> **Status: REJECTED**

Every Helm-managed component (Cilium, Longhorn, ArgoCD, cert-manager, external-dns, …) is
replaced with manually authored Kubernetes YAML. The repo owns the full resource definition
for every component with no upstream chart dependency.

While this provides maximum control and eliminates all external rendering dependencies,
the maintenance burden is prohibitive. Helm charts for infrastructure components like
Cilium encode hundreds of conditional resource variants, version-specific migration logic,
and CRD lifecycle management. Maintaining equivalent functionality in hand-written YAML
across chart versions would consume more time than all other homelab maintenance combined.
The pre-rendering approach achieves the same supply-chain hardening goals at a fraction of
the cost by preserving the Helm authoring interface while eliminating runtime rendering.

* `+` Complete control over every resource definition.
* `+` Zero external rendering dependency.
* `-` Extremely high initial and ongoing maintenance burden.
* `-` Loses well-tested Helm upgrade paths for complex infrastructure components.
* `-` Incompatible with Renovate automation for dependency tracking.

### Option 4: Flux OCI artifacts

> **Status: REJECTED**

A CI pipeline renders manifests and pushes them as OCI layers to a self-hosted registry;
Flux pulls and applies the OCI artifact rather than rendering from source. This is the
"rendered manifests" pattern as implemented in the Flux ecosystem.

This approach achieves the same supply-chain hardening goals and provides rendered diffs
(via the OCI layer diff). However, it conflicts directly with the Steel Age architectural
decision to standardise on ArgoCD as the sole GitOps controller. Introducing a Flux
dependency for OCI artifact application would reintroduce the operational complexity and
dual-controller split that the ArgoCD standardisation was specifically designed to eliminate.

* `+` Clean separation of rendering (CI) from application (Flux).
* `+` Supply-chain hardening equivalent to Option 1.
* `-` Requires introducing Flux into the stack — directly conflicts with ArgoCD
  standardisation.
* `-` OCI registry becomes a new critical dependency in the sync path.

## Decision Outcome

**Chosen option: "Pre-rendered manifests committed to Git (dist/ pattern)"**, because it
is the only option that simultaneously closes the supply-chain attack surface at sync time
*and* makes rendered resource changes visible in `git diff`. The mirroring option (Option 2)
reduces risk but leaves the diff blindness problem entirely unsolved. The hand-written
manifests option (Option 3) achieves both goals but at a maintenance cost that is
incompatible with a sustainable homelab. The Flux OCI option (Option 4) achieves equivalent
goals but requires abandoning the ArgoCD standardisation decision made in the Steel Age.

The SOPS `sops/` subdirectory split is the key design choice that makes this practical.
Rather than treating any component with secrets as an unreachable exception, the encrypted
secret generation is isolated to a minimal `sops/kustomization.yaml` overlay. The rest of
the application — all Deployments, Services, ConfigMaps, NetworkPolicies, CRDs — is
pre-rendered. The SOPS exception is thus bounded to the minimum possible set of resources.

The layered enforcement (pre-commit re-render, pre-push full check, CI staleness gate) means
that `dist/` drift is caught at the earliest possible point without blocking normal
development workflows.

***

## Consequences

### Positive

* All ArgoCD syncs for non-SOPS applications become pure `kubectl apply` operations against
  committed static YAML — no outbound network calls at sync time.
* Renovate chart-bump PRs expose the full Kubernetes resource delta, enabling meaningful
  security review before merging.
* `git revert` on a `dist/` commit precisely undoes the applied resource state, simplifying
  emergency rollbacks.
* The Git repository becomes the strict trust boundary for all cluster state.
* Offline Trivy / kubesec scans of `dist/` are trivial, supporting future security
  automation (related to issue #456).

### Negative

* `dist/` directories add generated content that must be kept synchronised with `src/`.
  Pre-commit automation and CI enforcement mitigate but do not eliminate the risk of drift.
* The initial migration (render + commit for all non-SOPS components) is a non-trivial
  one-time effort, with `amiya.akn` infrastructure components carrying the highest risk
  if a rendered output is incorrect.
* SOPS app refactoring (extracting `sops/` overlays) adds one extra directory per
  SOPS-dependent component, slightly increasing structural complexity.

### Neutral

* `dist/` files are marked as `linguist-generated` in `.gitattributes` so GitHub collapses
  them in PR reviews by default.
* The `kustomize build --enable-helm` step requires `helm` to be available in the local
  environment. The existing `mise` toolchain already provides this.
* Source references in ArgoCD's `argocd-extension-application-map` annotations are updated
  to point back to `src/` for developer traceability, even though the live source is
  `dist/`.

***

## Implementation Details / Status

* **Completed Components**: ADR drafted; render script and CI workflow defined.

* **Pending Components**: `scripts/dist:render`, trunk actions, CI workflow, lungmen.akn
  migration, amiya.akn migration and SOPS splits, ApplicationSet updates.

* **Architecture — directory convention**:

```
projects/<cluster>/
├── src/                             # Authoring interface — kustomization files, Helm values, SOPS secrets
│   ├── apps/<app>/
│   │   ├── kustomization.yaml       # Kustomize source (may reference helmCharts:)
│   │   ├── .application.patch       # ArgoCD application metadata / sync-policy overrides
│   │   ├── *.helmvalues/            # Helm values files
│   │   └── sops/                    # [SOPS apps only] KSOPS generator overlay
│   │       └── kustomization.yaml   # Contains generators: [ksops], references ../secret.yaml
│   └── infrastructure/kubernetes/<name>/
│       └── (same structure)
│
└── dist/                            # Pre-rendered output — committed, never hand-edited
    ├── apps/<app>/
    │   ├── .application.patch       # Copied verbatim from src/ by render script
    │   │                            # [SOPS apps] also contains spec.sources override for src/sops/
    │   └── <group>.<version>.<Kind>.<name>.yaml   # One file per Kubernetes resource
    └── infrastructure/kubernetes/<name>/
        └── (same structure)
```

* **File naming convention**: `<group>.<version>.<Kind>.<name>.yaml` where the group
  component for core API resources (empty group in `apiVersion`) is normalised to `core`.
  Examples: `apps.v1.Deployment.forgejo.yaml`, `core.v1.Service.forgejo.yaml`,
  `networking.k8s.io.v1.NetworkPolicy.forgejo.yaml`.

* **SOPS exception list** — components retaining a `src/<app>/sops/` overlay:

  | Component                   | Project     | Encrypted secrets                                                                                   |
  | --------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
  | `pocket-id`                 | `amiya.akn` | SSO identity, PostgreSQL credentials, S3 backup key                                                 |
  | `vault` (OpenBao)           | `amiya.akn` | SoftHSM tokens, database credentials, S3 backup key                                                 |
  | `tailscale`                 | `amiya.akn` | Connector auth key                                                                                  |
  | `cloudflare-public-gateway` | `amiya.akn` | Cloudflare Tunnel credentials                                                                       |
  | `argocd`                    | `amiya.akn` | Bootstrap secrets, GitHub credentials — entire app stays in `src/` (bootstrap exception, see below) |

  **Bootstrap exception**: `argocd` itself cannot participate in the `dist/` pattern because
  ArgoCD must be running to apply ArgoCD resources. The argocd application is bootstrapped
  manually and stays entirely in `src/argocd/` outside the ApplicationSet discovery flow.

* **Standards Specification**:
  * `dist/` files are never edited by hand; all changes flow through `scripts/dist:render`.
  * `src/*/sops/kustomization.yaml` must contain *only* KSOPS generators; no regular
    `resources:` entries are permitted in a `sops/` overlay.
  * Any new application that requires SOPS-encrypted secrets must follow the `sops/`
    split pattern from the outset.

***

## References and Related Decisions

* **Related ADRs**:
  * [ADR-007: Project Structure and Naming Conventions](./007-project-structure-and-naming-conventions.md)
  * [ADR-001: Centralized Secret Management](./001-centralized-secret-management.md)
  * [ADR-002: OpenBao Secrets Topology](./002-openbao-secrets-topology.md)

* **Security References**:
  * CISA Advisory AA23-131A — 3CX Supply Chain Attack; illustrates how upstream registry
    compromise translates to cluster-level impact.
  * NIST SP 800-218 — Secure Software Development Framework (SSDF): practices SI.2 and
    SI.3 on verifying integrity of third-party software.
  * SLSA Supply Chain Security Framework — `dist/` pattern achieves SLSA Build L1 by
    making build provenance traceable via Git.

* **Implementation References**:
  * [Argo CD — Directory Source](https://argo-cd.readthedocs.io/en/stable/user-guide/directory/) —
    `directory.recurse: true` for applying all YAML in a directory.
  * [Kustomize — Helm chart inflator](https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/helmcharts/) —
    `kustomize build --enable-helm` reference.
  * [KSOPS — Kustomize Secret OPerationS](https://github.com/viaduct-ai/kustomize-sops) —
    KSOPS generator used for SOPS-encrypted secrets.
  * GitHub Issue #990 — Original tracking issue and full technical context.
  * GitHub Issue #453 — Standardise deployment patterns for lungmen.akn (aligned goal).
  * GitHub Issue #456 — Security center automation (offline Trivy scan becomes trivial
    with pre-rendered `dist/`).

***

## Changelog

* **2026-05-24**: **FEATURE**: Initial creation of ADR documenting the decision to adopt
  the pre-rendered manifests (dist/) pattern for supply-chain hardening and GitOps
  diffability.
