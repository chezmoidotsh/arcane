# PR Examples

Real merged PRs from this repository. Use these as style reference when drafting
PR bodies — each example matches one of the three PR templates in
`.github/PULL_REQUEST_TEMPLATE/`.

***

## PR #973 — `feature.md` template

**Title:** `:sparkles:(project:lungmen.akn): Add Forgejo Git hosting service`
**Branch:** `feature/forgejo-lungmen`

```sh
gh pr view 973
```

### Why this is a good example

* Summary states the what AND why in 2 sentences, with the motivating issue inline.
* Changes Made groups files by subsystem (New Application, Database Integration),
  each file linked with its purpose.
* Technical Impact uses **named sub-sections** that match the `feature.md`
  template: *Infrastructure Components*, *Security Implementation*, *External
  Access Points*.
* Testing Validation has service-specific checks (HTTPRoute, ExternalSecrets,
  DB connection), not generic ones.
* `Future Enhancements` lists planned follow-up work deliberately left out of scope.

### Excerpt

```markdown
## Summary

Adds Forgejo as a self-hosted Git forge to the lungmen.akn cluster. Forgejo is
a lightweight software forge providing GitHub-compatible Git hosting
capabilities for personal infrastructure development.

**Related Issue:** #973

## Changes Made

### New Application: Forgejo

- **`forgejo.deployment.yaml`** — Deploys Forgejo 10.0 from Codeberg image
- **`forgejo.httproute.yaml`** — External access via Envoy Gateway
- **`security/network-policy.default-hardened.yaml`** — Default-deny baseline

## Technical Impact

### Infrastructure Components

Forgejo 10.0 deployed from the Codeberg official image, backed by a shared
CloudNative-PG cluster. Persistent storage via SMB CSI driver.

### Security Implementation

Zero-trust namespace with default-deny Cilium policy. All credentials from
OpenBao via ExternalSecrets Operator. SSH L7 policy with protocol inspection.

### External Access Points

- HTTP/HTTPS: `forgejo.chezmoi.sh` via Envoy Gateway HTTPRoute
- SSH: dedicated LoadBalancer for Git clone/push operations

## Testing Validation

- [ ] Forgejo pods reach `Running` in `forgejo` namespace
- [ ] ExternalSecrets sync for database, admin, and OIDC credentials
- [ ] HTTPRoute reports `Accepted` status
- [ ] Cilium network policies enforce expected traffic isolation

## Future Enhancements

- Configure OIDC provider settings in Forgejo for Pocket-Id SSO
- Enable Forgejo Actions for CI/CD capabilities
```

***

## PR #939 — `refactoring.md` template (consolidation)

**Title:** `:bricks:(project:lungmen.akn): Consolidate PostgreSQL databases into shared CNPG clusters`
**Branch:** `issue-661/centralise-db`

```sh
gh pr view 939
```

### Why this is a good example — consolidation

* Summary names the before/after state explicitly and references the strategic
  issue that motivates the change.
* `## Rationale` (implicit in this PR's Summary, but the new template makes it
  a dedicated section) explains *why this refactor now*.
* Changes Made spans multiple subsystems (catalog component, shared clusters,
  app migrations, consolidated network policies) with consistent grouping.
* Technical Impact uses **named sub-sections**: *Architecture Simplification*
  (with a striking before/after table), *Security Boundary Preservation*,
  *Reusable Chart Architecture*.

### Excerpt — consolidation

```markdown
## Summary

Implements the PostgreSQL database consolidation strategy defined in issue
#661, replacing 5+ individual per-application CNPG clusters with 2 shared
clusters in lungmen.akn grouped by data sensitivity.

**Related Issue:** #661

## Rationale

Per-app CNPG clusters multiplied operational cost (5 backup schedules, 5
objectstore configs, 15+ network policies) without adding isolation that
PostgreSQL roles couldn't already enforce. Consolidation by data sensitivity
preserves the security boundary while collapsing the operational surface.

## Changes Made

### New Catalog Component: `mutualized-cnpg-databases` Helm Chart

- **`Chart.yaml`** — declares dependencies on `cloudnative-pg` CRDs
- **`templates/cluster.yaml`** — CNPG `Cluster` resource with managed roles

### Removed

- Removed: `<app>.postgresql.yaml` (×5) — replaced by shared cluster definitions
- Removed: `<app>.postgresql-objectstore.yaml` (×5) — consolidated objectstore

## Technical Impact

### Architecture Simplification

| Before                          | After                                                |
| ------------------------------- | ---------------------------------------------------- |
| 5 independent CNPG clusters     | 2 shared clusters (`postgres-apps`, `…-secured`)     |
| 5 backup schedules              | 2 consolidated backup schedules                      |
| 15+ scattered network policies  | Centralized policies in the `databases` namespace    |

### Security Boundary Preservation

Apps in `postgres-apps` cannot reach `postgres-apps-secured` databases —
PostgreSQL role isolation + namespace-to-namespace Cilium allowlisting.

### Next Steps

- Replicate the pattern in amiya.akn (`postgres-security`)
- Migrate remaining standalone clusters in maison before retirement

## Testing Validation

- [ ] CNPG clusters `postgres-apps` and `postgres-apps-secured` reach `Cluster Ready`
- [ ] All `Database` CRDs report `Applied` status
- [ ] ArgoCD diff shows only expected resource changes
```

***

## PR #667 — `refactoring.md` template (migration)

**Title:** `:recycle:(project:amiya.akn): Complete Phase 1 migration to centralized OpenBao`
**Branch:** `issue-401/deprecate-kubevault`

```sh
gh pr view 667
```

### Why this is a good example — migration

* Phased migration PR — uses `Addresses #401 (Phase 1 completion)` instead of
  `Closes #401` to signal the issue stays open for later phases.
* Changes Made tracks both what was migrated AND what was removed (legacy
  Kubevault ClusterSecretStore).
* Technical Impact explains the architectural simplification (single source
  of truth) and includes a `Next Steps` section listing the remaining phases.

### Excerpt — migration

```markdown
## Rationale

Kubevault was a transitional secret backend predating OpenBao. Keeping it
alongside OpenBao doubles the operational surface and creates ambiguity about
the source of truth. Phase 1 validates the migration in amiya.akn before
extending it to other clusters.

## Changes Made

### Secret Management Migration

- Updated `letsencrypt-issuer-credentials.externalsecret.yaml` — `kubevault`
  → `vault.chezmoi.sh`, path migrated to `shared/certificates/.../letsencrypt/account`

### Removed

- Deleted: `argocd.github-secrets.externalsecret.yaml` — replaced by SOPS-encrypted secret
- Deleted: `kubevault` ClusterSecretStore (legacy provider)

## Technical Impact

### Architecture Simplification

amiya.akn now uses OpenBao exclusively. Removing the Kubevault
ClusterSecretStore immediately exposes any missed migration via failing
ExternalSecrets.

### Next Steps

- Phase 2: migrate maison and other clusters to centralized OpenBao
- Phase 3: tear down Kubevault namespace and legacy secret repository

## Related Issues

Addresses #401 (Phase 1 completion)
```

***

## Bugfix template — synthetic example

No recent merged bugfix PR uses the new template structure yet. The shape
to follow:

````markdown
## Summary

cert-manager fails to renew Let's Encrypt certificates in amiya.akn because the
Cloudflare API token ExternalSecret silently rotates to an empty value when the
OpenBao path is misspelled in the SecretStore.

**Related Issue:** #1234

## Root Cause

The `ClusterSecretStore` `vault.chezmoi.sh` references the path
`shared/certificates/certificate-authorities/lestencrypt/...` (typo on
`lestencrypt`). ExternalSecrets Operator treats the missing key as an empty
string rather than an error, so cert-manager receives `CLOUDFLARE_API_TOKEN=""`
and DNS-01 challenges fail with 401.

Confirmation in logs:

```text

cert-manager: error presenting challenge: cloudflare: 401 invalid token
external-secrets: secret synced, source value is empty string

```

## Fix

### cert-manager ClusterSecretStore

* **`letsencrypt-issuer-credentials.externalsecret.yaml`** — fixed path
  typo (`lestencrypt` → `letsencrypt`)

## Technical Impact

### Behavioural Changes

Certificate renewals resume; no manual rotation needed.

### Regression Risk

**Low** — change limited to a single ExternalSecret path. Other ExternalSecrets
referencing the same OpenBao mount are unaffected.

### Observability

* cert-manager `Certificate` resources transition to `Ready=True`
* ExternalSecret status reports `SecretSynced` with non-empty `valueMap`
* Cloudflare DNS-01 challenge succeeds (visible in cert-manager pod logs)

## Testing Validation

* [ ] Original issue no longer reproduces (renewal succeeds)
* [ ] `cmctl status certificate <name>` reports `Ready`
* [ ] No regressions on other ExternalSecrets using `vault.chezmoi.sh`

## Related Issues

Closes #1234

<!-- markdownlint-disable MD040 -->
````

<!-- markdownlint-enable MD040 -->

***

## Fetching real examples on demand

```sh
# List last 3 non-dependency merged PRs
gh pr list --limit 30 --state merged --json number,title,author \
  | python3 -c "
import json, sys
prs = json.load(sys.stdin)
human = [p for p in prs if not p['author']['is_bot']][:3]
for p in human: print(p['number'], p['title'])
"

# View a specific PR body
gh pr view <number>
```
