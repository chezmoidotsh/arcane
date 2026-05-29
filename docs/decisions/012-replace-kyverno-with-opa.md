---
status: "accepted"
date: 2026-05-29
decision-makers: ["Alexandre"]
assisted-by: ["claude-sonnet-4-6"]
informed: []
---

# Replace Kyverno with OPA/Rego CI-time policy enforcement

## Table of Contents

* [Context and Problem Statement](#context-and-problem-statement)
* [Decision Drivers](#decision-drivers)
* [Considered Options](#considered-options)
  * [Option A: Kyverno with namespace exclusions (restore)](#option-a-kyverno-with-namespace-exclusions-restore)
  * [Option B: OPA/Rego policies enforced in CI via conftest](#option-b-oparego-policies-enforced-in-ci-via-conftest)
  * [Option C: OPA Gatekeeper for runtime admission control](#option-c-opa-gatekeeper-for-runtime-admission-control)
* [Decision Outcome](#decision-outcome)
* [Consequences](#consequences)
  * [Positive](#positive)
  * [Negative](#negative)
  * [Neutral](#neutral)
* [Implementation Details / Status](#implementation-details--status)
* [References and Related Decisions](#references-and-related-decisions)
* [Changelog](#changelog)

## Context and Problem Statement

All clusters in this homelab use a local Zot OCI mirror (`oci.chezmoi.sh`) for container
images, providing supply-chain hardening and reducing external registry dependency. The
Kyverno `enforce-local-registry` MutatingPolicy was responsible for rewriting every
container image reference to the local mirror at runtime. On 2026-05-26, this policy caused
a cluster-wide outage on `amiya.akn` (the core platform cluster) because it applied to
`longhorn-system` — creating a circular dependency where Longhorn needed Zot to pull images,
but Zot's storage PVC was backed by Longhorn. When pod restarts occurred, the chain broke
and cascaded into `ImagePullBackOff` across the entire cluster.

Kyverno was removed entirely in commit `8780c40f` as an emergency measure. The incident is
documented in `docs/incidents/2026-05-26-amiya-kyverno-zot-circular-imagepullbackoff.md`.

The strategic question this ADR answers is: **How do we enforce that all container images
use the local OCI mirror, without re-introducing a runtime admission controller that can
create circular dependencies during cluster bootstrap?**

## Decision Drivers

* **Functional Requirements**:
  * Every container image in non-infrastructure namespaces must be pulled through
    `oci.chezmoi.sh`.
  * Infrastructure namespaces (`kube-system`, `longhorn-system`, etc.) must be exempt
    to avoid circular dependencies.
  * Policy violations must be caught before merge, not at deployment time.

* **Non-Functional Requirements**:
  * Zero runtime dependency on the policy enforcement mechanism — no admission webhook,
    no mutating controller that itself needs images.
  * Policy must be version-controlled alongside the manifests it validates.
  * Developers *(aka. me)* get immediate feedback in PRs via CI.

* **Constraints**:
  * The repository uses ArgoCD for GitOps; introducing new cluster-side controllers
    must be justified against the Steel Age principle of simplicity.
  * The 2026-05-26 incident proved that runtime mutation of image references is
    fundamentally dangerous in a homelab where the registry depends on the storage
    layer.

## Considered Options

### Option A: Kyverno with namespace exclusions (restore)

> **Status: REJECTED**

Re-install Kyverno with an expanded exclusion list that includes `longhorn-system`. The
existing MutatingPolicy would be restored with the fix applied. This is the minimal-change
option — it addresses the specific failure mode without architectural change.

However, the fundamental problem remains: Kyverno is itself a cluster workload that runs
as Deployments consuming images. If Zot (the local registry) becomes unavailable for any
reason — disk full, network partition, misconfiguration — Kyverno cannot reliably enforce
policy, and the cluster enters a state where the policy engine depends on the infrastructure
it is policing. The 2026-05-26 incident was triggered by a missing namespace exclusion, but
the root cause is the architectural pattern of runtime image mutation.

* `+` Restore existing behavior with minimal effort.
* `+` Runtime enforcement catches drift that CI might miss (e.g., manual kubectl apply).
* `-` Does not eliminate the circular dependency class of failures — only patches one instance.
* `-` Kyverno's resource footprint (memory/cpu requirements) is significant for a
  homelab with a single operator.

### Option B: OPA/Rego policies enforced in CI via conftest

> **Status: ACCEPTED**

Port the `enforce-local-registry` policy from Kyverno's YAML DSL to Rego. Run
[conftest](https://www.conftest.dev/) in a GitHub Actions workflow on every PR and merge
group that touches `projects/` YAML files. The policy lives in `catalog/opa/policies/`
alongside the manifests it validates.

This approach eliminates the runtime dependency entirely. Policy violations are caught at
PR time — before the manifest reaches the cluster. There is no admission webhook, no
mutating controller, and no cluster-side component that can fail. The CI workflow is the
enforcement boundary.

* `+` Zero runtime dependency — no admission webhook, no circular dependency risk.
* `+` Policy-as-code: versioned, reviewed, and tested alongside manifests.
* `+` Immediate developer feedback in PRs via GitHub Actions.
* `+` Lightweight: conftest is a single static binary, no cluster resources.
* `-` No runtime enforcement — a direct `kubectl apply` bypasses the check.
* `-` Requires developers to run conftest locally or rely on CI for feedback.

### Option C: OPA Gatekeeper for runtime admission control

> **Status: DEFERRED** (Phase 3 of issue #1005)

Install OPA Gatekeeper as an admission webhook with the same Rego policies from Option B.
This provides both CI-time and runtime enforcement: conftest catches violations in PRs,
Gatekeeper catches anything that reaches the cluster through other paths.

Gatekeeper is lighter than Kyverno (no CRD explosion, simpler architecture) and supports
the same Rego policies. However, it reintroduces a runtime admission controller — the same
class of component that caused the original incident. It can be deployed safely if the
Gatekeeper namespace itself is excluded from policy enforcement, but the operational
complexity is not justified for a homelab with a single operator.

* `+` Full runtime enforcement complementary to CI.
* `+` Uses the same Rego policies as Option B — no duplication.
* `+` Lighter than Kyverno (constraint templates vs. per-policy CRDs).
* `-` Reintroduces an admission webhook — same failure class as Kyverno.
* `-` Additional cluster-side component to maintain and upgrade.
* `-` Not justified for a single-operator homelab at this time.

## Decision Outcome

**Chosen option: "OPA/Rego policies enforced in CI via conftest"**, because it completely
eliminates the circular dependency class of failures that caused the 2026-05-26 incident.
The root cause was not a missing namespace exclusion — it was the architectural pattern of
runtime image mutation in a cluster where the registry depends on the storage layer. CI-only
enforcement sidesteps this entirely by making the Git repository the enforcement boundary,
which aligns with the GitOps model where Git is the single source of truth.

The lack of runtime enforcement (the main drawback) is acceptable because all changes flow
through GitOps (ArgoCD). Direct `kubectl apply` is not part of the standard workflow and
would be caught by operational review. If runtime enforcement becomes necessary in the
future, Gatekeeper (Option C) can be added on top of the same Rego policies without
replacing the CI layer.

***

## Consequences

### Positive

* Eliminates the admission webhook circular dependency class entirely.
* Rego is a standard, well-documented policy language — no vendor lock-in.
* Same Rego policies can be reused with Gatekeeper if runtime enforcement is needed later.
* CI workflow provides PR-level visibility into policy violations.
* No cluster-side resource consumption from a policy engine.

### Negative

* `kubectl apply` bypasses the check — requires operational discipline.
* Initial policy migration requires auditing all existing manifests for compliance.
* conftest adds a CI dependency (external binary download).

### Neutral

* The policy is initially non-blocking (`continue-on-error: true`) to allow incremental
  compliance. Once all manifests are updated to use `oci.chezmoi.sh` prefixes, the
  workflow will be made blocking.

***

## Implementation Details / Status

* **Completed Components**:
  Rego policies (`catalog/opa/policies/SEC001:kubernetes.rego`,
  `catalog/opa/policies/SEC001:cloudnative-pg.rego`),
  unit tests (29/29 pass),
  trunk integration (`.trunk/trunk.yaml` — conftest linter on `dist/`),
  CI workflow (`.github/workflows/pull_request.conftest.yaml`),
  rule documentation (`catalog/opa/rules/SEC001-enforce-local-registry.md`),
  directory README (`catalog/opa/README.md`).

* **Pending Components**: Audit all manifests for `oci.chezmoi.sh` prefix compliance.
  Make CI workflow blocking once all violations are resolved.

* **Architecture**:

```text
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Developer   │────▶│  GitHub PR       │────▶│   ArgoCD    │
│  pushes YAML │     │  conftest CI job │     │   applies   │
└──────────────┘     │  (enforcement)   │     └─────────────┘
                     └──────────────────┘
                               │
                        ┌──────▼──────┐
                        │ Rego policy │
                        │ (catalog/   │
                        │  opa/)      │
                        └─────────────┘
```

* **Standards Specification**:
  * All Rego policies live in `catalog/opa/policies/`.
  * Policies use `deny[msg]` rules compatible with both conftest and Gatekeeper.
  * Excluded namespaces are defined in the Rego policy as a set constant.

***

## References and Related Decisions

* **Related ADRs**:
  * [ADR-011: Pre-rendered Manifests Pattern](./011-rendered-manifests-pattern.md) —
    complementary supply-chain hardening.

* **Incident Documentation**:
  * `docs/incidents/2026-05-26-amiya-kyverno-zot-circular-imagepullbackoff.md` —
    the incident that triggered this decision.

* **Tool References**:
  * [conftest](https://www.conftest.dev/) — policy enforcement for Kubernetes manifests.
  * [OPA Rego](https://www.openpolicyagent.org/docs/latest/policy-language/) — policy language.
  * [OPA Gatekeeper](https://open-policy-agent.github.io/gatekeeper/) — deferred runtime option.

* **Issue Tracking**:
  * GitHub Issue #1005 — Replace Kyverno with OPA.

***

## Changelog

* **2026-05-29**: **FEATURE**: Initial creation of ADR documenting the decision to replace
  Kyverno with OPA/Rego CI-time enforcement via conftest.
