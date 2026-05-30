---
name: create-pr
description: >
  Opens a well-formed pull request for the Arcane repository following project
  conventions. Use when asked to create, open, or submit a pull request, or to
  push a branch and request a review. Enforces symbol-based PR title matching
  commit format, branch naming conventions, structured PR body, and Assisted-by
  transparency trailer.
compatibility: Requires git and GitHub CLI (gh)
---

# Arcane Pull Request Skill

## Pre-flight checks

Before pushing anything:

1. Read `.agents/skills/git-commit/SKILL.md` for commit format and scope conventions.

2. Pick the matching PR template in `.github/PULL_REQUEST_TEMPLATE/`:

   | Change type                             | Template                                                | Distinguishing sections                                                                                                 |
   | --------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
   | New app / new infra component           | `feature.md`                                            | Infrastructure Components, Security Implementation, External Access Points, Integration Points, Future Enhancements     |
   | Restructure / consolidation / migration | `refactoring.md`                                        | Rationale, Architecture Simplification, Security Boundary Preservation, Behavioural Changes, Migration Path, Next Steps |
   | Bug fix / regression                    | `bugfix.md`                                             | Root Cause, Behavioural Changes, Regression Risk, Observability                                                         |
   | Anything else / unsure                  | `pull_request_template.md` (root, same as `feature.md`) | —                                                                                                                       |

   The root `pull_request_template.md` is a copy of `feature.md` and applies by
   default. To use a non-default template explicitly, append
   `?template=<name>.md` to the PR URL or use `gh pr create --web` and pick from
   the GitHub picker.

3. List the last 3 merged PRs that are not dependency bumps for style reference:

   ```sh
   gh pr list --limit 30 --state merged --json number,title,author \
     | python3 -c "
   import json, sys
   prs = json.load(sys.stdin)
   human = [p for p in prs if not p['author']['is_bot']][:3]
   for p in human: print(p['number'], p['title'])
   "
   ```

4. Run the commit validator and review its output:

   ```sh
   bash .agents/skills/create-pr/scripts/validate_commits.sh main
   ```

   The script prints `OK`, `FAIL`, or `WARN` for each check:

   * **`FAIL`** — must be fixed before opening the PR (symbol format, GPG signature, Assisted-by trailer).
   * **`WARN`** — `Signed-off-by` is missing. This is a **user responsibility**: the Signed-off-by line is
     a DCO legal attestation that only the human committer can make. Surface the warning to the user and
     let them decide. Do not add `-s` to any commit command yourself.

## Branch naming

| Type          | Pattern                 | Example                     |
| ------------- | ----------------------- | --------------------------- |
| Feature       | `feat/<desc>`           | `feat/forgejo-lungmen`      |
| Bug fix       | `fix/<desc>`            | `fix/cert-manager-renewal`  |
| Documentation | `docs/<desc>`           | `docs/bootstrap-guide`      |
| Tooling       | `chore/<desc>`          | `chore/renovate-config`     |
| Refactor      | `refactor/<desc>`       | `refactor/network-policies` |
| Issue-based   | `issue-<number>/<desc>` | `issue-661/consolidate-db`  |

## Workflow

1. Create a branch following the naming conventions above.
2. Push: `git push -u origin <branch-name>`
3. Run the commit validator (step 4 above) and fix any `FAIL` items; surface `WARN` items to the user.
4. Draft the PR body following the selected template — see `.github/PULL_REQUEST_TEMPLATE/<type>.md` and `references/pr-examples.md`.
5. Create the PR with a symbol-based title matching the primary commit format.

## PR body structure

The templates in `.github/PULL_REQUEST_TEMPLATE/` are the authoritative
structure. Fill them in honestly and concisely. The three templates share the
same skeleton — only the `Technical Impact` sub-sections (and a few specific
sections like `Rationale` or `Root Cause`) differ.

### Shared skeleton (all templates)

```markdown
## Summary

2–4 sentences: what changed, why now, strategic context (phase in a plan,
motivating issue). Always include "**Related Issue:** #<n>".

## Changes Made

### <Subsystem or component name>

Optional 1-line intro describing the subsystem, then file list:

- **[`path/to/file.yaml`](path/to/file.yaml)** — what it does and why it exists
- Removed: `legacy-file.yaml` — replaced by …

## Technical Impact

(See template-specific sub-sections below.)

## Testing Validation

- [ ] Pods reach `Running` status in the target namespace
- [ ] ExternalSecrets sync successfully
- [ ] <service-specific check>

## Related Issues

Closes #<number>   <!-- or "Addresses #X (Phase N)" for multi-phase work -->

---
<sub>AI-assisted with <provider>:<model-id> under human supervision</sub>
```

### Template-specific Technical Impact sub-sections

**`feature.md`** — keep sections that apply, remove the rest:

```markdown
### Infrastructure Components
New services, charts, operators introduced and their role.

### Security Implementation
Network policies (Cilium), OpenBao paths, ExternalSecrets, OIDC, attack surface.

### External Access Points
HTTPRoute / TCPRoute hostnames, LoadBalancer services, OIDC integration.

### Integration Points
How this connects to existing systems (databases, registry, gateways).
```

Plus an optional `## Future Enhancements` section after Technical Impact for
follow-up work intentionally left out of scope.

**`refactoring.md`** — adds `## Rationale` (right after Summary, before
Changes Made) explaining why this refactor now. Technical Impact sub-sections:

```markdown
### Architecture Simplification
Before/after comparison — use a table when the gain is striking.

| Before | After |
| ------ | ----- |
|        |       |

### Security Boundary Preservation
Confirm isolation, secrets, network policies preserved or improved.

### Behavioural Changes
None (pure refactor) / observable differences for users or operators.

### Migration Path
Steps required to roll out without downtime, if any.

### Next Steps
Subsequent phases — keep when this PR is a milestone within a larger plan.
```

The `### Removed` sub-section inside Changes Made is required for refactors.

**`bugfix.md`** — adds `## Root Cause` (right after Summary) with logs/metrics
that confirm the diagnosis, then `## Fix` instead of `## Changes Made`.
Technical Impact sub-sections:

```markdown
### Behavioural Changes
What changes for users / operators after the fix.

### Regression Risk
Low / Medium / High — justify the rating, list affected areas and mitigation.

### Observability
Logs / metrics / probes that will confirm the fix in production.
```

## Creating the PR

```sh
git push -u origin <branch-name>
gh pr create \
  --title "type[scope]: Subject" \
  --body "$(cat <<'EOF'
<body following the selected template>
EOF
)" \
  --base main
```

## Rules

* **PR title**: Symbol-based format matching the primary commit — `type[scope]: Subject` (see `.agents/skills/git-commit/SKILL.md` for type table)
* **Commits**: All commits must have symbol format, GPG signature (`-S`), and `Assisted-by:` trailer.
  Signed-off-by is the user's responsibility — never add `-s` yourself.
* **File paths**: Link files in Changes Made using `[`path`](path)` markdown syntax
* **Technical Impact**: Always present with **named sub-sections** — never just a bare Before/After
  table or a flat bullet list. Drop sub-sections that don't apply rather than leaving them empty.
* **Refactor PRs**: `## Rationale` is mandatory; explains *why this refactor now*.
* **Bugfix PRs**: `## Root Cause` must include evidence (logs/metrics), not just a hypothesis.
* **Attribution**: Always end the body with `<sub>AI-assisted with <provider>:<model-id> under human supervision</sub>`
* **Issue reference**: Always include `Closes #number` or `Addresses #number (Phase N)` when applicable
* **No broken state**: Never create a PR with known broken manifests or missing secrets

## Examples

See `references/pr-examples.md` for real merged PRs from this repository, each
illustrating one of the three templates.

**Good — feature PR with named Technical Impact sub-sections:**

```sh
git push -u origin feat/forgejo-lungmen
gh pr create \
  --title "+[project:lungmen.akn]: Add Forgejo Git hosting service" \
  --body "$(cat <<'EOF'
## Summary

Adds Forgejo as a self-hosted Git forge to the lungmen.akn cluster. Forgejo is
a lightweight software forge providing GitHub-compatible Git hosting
capabilities for personal infrastructure development.

**Related Issue:** #973

## Changes Made

### New Application: Forgejo

- **[`forgejo.deployment.yaml`](projects/lungmen.akn/src/apps/forgejo/forgejo.deployment.yaml)** — Deploys Forgejo 10.0 from Codeberg official image
- **[`forgejo.httproute.yaml`](projects/lungmen.akn/src/apps/forgejo/forgejo.httproute.yaml)** — External access via Envoy Gateway on forgejo.chezmoi.sh
- **[`forgejo.database.externalsecret.yaml`](projects/lungmen.akn/src/apps/forgejo/forgejo.database.externalsecret.yaml)** — PostgreSQL credentials from OpenBao
- **[`security/network-policy.default-hardened.yaml`](projects/lungmen.akn/src/apps/forgejo/security/network-policy.default-hardened.yaml)** — Default-deny baseline for the forgejo namespace

## Technical Impact

### Infrastructure Components

Forgejo 10.0 deployed from the Codeberg official image, backed by a shared
CloudNative-PG cluster in the `databases` namespace. Persistent storage uses
the SMB CSI driver against the NAS for repository data.

### Security Implementation

Zero-trust namespace with a default-deny Cilium policy and explicit allowlists
for Envoy Gateway ingress, PostgreSQL egress, and SSH L7 inspection. All
credentials sourced from OpenBao via ExternalSecrets Operator.

### External Access Points

- HTTP/HTTPS: `forgejo.chezmoi.sh` via Envoy Gateway HTTPRoute
- SSH: dedicated LoadBalancer service for Git clone/push operations
- OIDC client credentials provisioned for future Pocket-Id SSO integration

## Testing Validation

- [ ] Forgejo pods reach `Running` status in `forgejo` namespace
- [ ] ExternalSecrets sync for database, admin, and OIDC credentials
- [ ] HTTPRoute `forgejo-websecure` reports `Accepted` status
- [ ] Database connection succeeds (check pod logs for PostgreSQL errors)
- [ ] Cilium network policies enforce expected traffic isolation

## Future Enhancements

- Configure OIDC provider settings in Forgejo for Pocket-Id SSO
- Enable Forgejo Actions for CI/CD capabilities

## Related Issues

Closes #973

---
<sub>AI-assisted with Z.ai:GLM-4.7 under human supervision</sub>
EOF
)" \
  --base main
```

**Bad — wrong title, no structure, no file links, no Technical Impact sub-sections:**

```sh
gh pr create \
  --title "Add Forgejo to lungmen" \
  --body "Added Forgejo as described in issue #973"
```

## Review checklist

* [ ] Branch name follows convention
* [ ] Commit validator shows no `FAIL` lines; `WARN` lines surfaced to user
* [ ] PR title uses symbol-based format with correct scope (`type[scope]: Subject`)
* [ ] PR body matches the selected template skeleton: Summary, Changes Made (with subsystem headings),
  Technical Impact (with **named sub-sections**), Testing Validation, Related Issues
* [ ] Refactor PRs include `## Rationale`; bugfix PRs include `## Root Cause` with evidence
* [ ] File paths in Changes Made use `[`path`](path)` link syntax
* [ ] Attribution footer included
* [ ] Issue referenced (`Closes #number` or `Addresses #number (Phase N)`)

## References

* Commit rules: `.agents/skills/git-commit/SKILL.md`
* PR templates: `.github/PULL_REQUEST_TEMPLATE/` (`feature.md`, `refactoring.md`, `bugfix.md`)
* Real PR examples: `.agents/skills/create-pr/references/pr-examples.md`
* Project overview: `AGENTS.md`
* Commit config: `.commitlintrc.js`
