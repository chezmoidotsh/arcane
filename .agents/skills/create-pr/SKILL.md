---
name: create-pr
description: >
  Opens a well-formed pull request for the Arcane repository following project
  conventions. Use when asked to create, open, or submit a pull request, or to
  push a branch and request a review. Enforces Gitmoji PR title, branch naming
  conventions, structured PR body, and AI attribution footer.
compatibility: Requires git and GitHub CLI (gh)
allowed-tools: Bash(git:*) Bash(gh:*)
---

# Arcane Pull Request Skill

## Pre-flight checks

Before pushing anything, read:

* `.claude/rules/git-commits.md` — commit format and scope conventions
* `.github/PULL_REQUEST_TEMPLATE/` — available PR templates
* Recent merged PRs: `gh pr list --limit 5 --state merged`

Verify all commits follow Gitmoji format with signoff and GPG signature. Fix any non-conforming commits before creating the PR.

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

1. Verify all commits are Gitmoji-formatted with `-S -s` flags and `Co-authored-by: Claude <claude@anthropic.com>`.
2. Push branch: `git push -u origin <branch-name>`
3. Study the matching PR template in `.github/PULL_REQUEST_TEMPLATE/` and recent merged PRs for structure.
4. Draft the PR body following the standard sections below.
5. Create the PR with a Gitmoji title matching the primary commit scope.
6. Include AI attribution footer.

## PR body structure

All PRs follow this structure (derived from PRs #667, #939, #973):

```markdown
## Summary

1–3 sentences: what changed and why it matters.

## Changes Made

### <Component or feature name>

Changes grouped by subsystem. Link file paths and describe each file's purpose:

- **[`path/to/file.yaml`](path/to/file.yaml)** — what it does and why it exists
- **[`path/to/other.yaml`](path/to/other.yaml)** — purpose
- Removed: `legacy-file.yaml` — reason for removal

### <Second component if applicable>

- ...

## Technical Impact

Explain the architectural effects: what changed in the system, security implications,
simplifications, or trade-offs. Use a table when comparing before/after state.

| Before | After |
| ------ | ----- |
| 5 independent clusters | 2 shared clusters |

Include subsections for Security, Architecture, or Next Steps when relevant.

## Future Enhancements (optional — omit if not applicable)

- Planned follow-up work not in scope for this PR

## Testing Validation

After deployment, verify:

- [ ] Pods reach `Running` status in the target namespace
- [ ] ExternalSecrets sync successfully
- [ ] <service-specific check, e.g. HTTPRoute reports `Accepted`>
- [ ] <functional check, e.g. database connection succeeds>

## Related Issues

Closes #<number>

---
<sub>Analysis and writing by Claude under human supervision</sub>
```

## Creating the PR

```sh
git push -u origin <branch-name>
gh pr create \
  --title ":emoji:(scope): Subject" \
  --body "$(cat <<'EOF'
<body following structure above>
EOF
)" \
  --base main
```

## Rules

* **PR title**: Gitmoji format matching the primary commit — `:emoji:(scope): Subject`
* **Commits**: All commits must have Gitmoji format, signoff, GPG signature, and `Co-authored-by: Claude <claude@anthropic.com>`
* **File paths**: Link files in Changes Made using `[`path`](path)` markdown syntax
* **Technical Impact**: Always present — explains architecture and security effects, not just what files changed
* **Attribution**: Always end the body with `<sub>Analysis and writing by Claude under human supervision</sub>`
* **Issue reference**: Always include `Closes #number` or `Refs #number` when applicable
* **No broken state**: Never create a PR with known broken manifests or missing secrets

## Examples

**Good — proper title, all sections, file links, attribution:**

```sh
git push -u origin feat/forgejo-lungmen
gh pr create \
  --title ":sparkles:(project:lungmen.akn): Add Forgejo Git hosting service" \
  --body "$(cat <<'EOF'
## Summary

Adds Forgejo as a self-hosted Git forge to the lungmen.akn cluster. Forgejo is
a lightweight software forge providing GitHub-compatible Git hosting
capabilities for personal infrastructure development.

## Changes Made

### New Application: Forgejo

Created complete Forgejo application structure in
`projects/lungmen.akn/src/apps/forgejo/`:

- **[`forgejo.deployment.yaml`](projects/lungmen.akn/src/apps/forgejo/forgejo.deployment.yaml)** — Deploys Forgejo 10.0 from Codeberg official image
- **[`forgejo.httproute.yaml`](projects/lungmen.akn/src/apps/forgejo/forgejo.httproute.yaml)** — External access via Envoy Gateway on forgejo.chezmoi.sh
- **[`forgejo.database.externalsecret.yaml`](projects/lungmen.akn/src/apps/forgejo/forgejo.database.externalsecret.yaml)** — PostgreSQL credentials from OpenBao
- **[`security/network-policy.default-hardened.yaml`](projects/lungmen.akn/src/apps/forgejo/security/network-policy.default-hardened.yaml)** — Default-deny baseline for the forgejo namespace

## Technical Impact

- **Application**: Forgejo 10.0 — lightweight Git forge replacing external SaaS dependency
- **Database**: CloudNative-PG managed PostgreSQL in shared `postgres-apps` cluster
- **Networking**: Zero-trust Cilium policies with default-deny baseline
- **Secrets**: All credentials sourced from OpenBao via ExternalSecrets Operator

## Testing Validation

After deployment, verify:

- [ ] Forgejo pods reach `Running` status in `forgejo` namespace
- [ ] ExternalSecrets sync for database, admin, and OIDC credentials
- [ ] HTTPRoute `forgejo-websecure` reports `Accepted` status
- [ ] Database connection succeeds (check pod logs for PostgreSQL errors)

## Related Issues

Closes #973

---
<sub>Analysis and writing by Claude under human supervision</sub>
EOF
)" \
  --base main
```

**Bad — wrong title, no structure, no file links, no Technical Impact:**

```sh
gh pr create \
  --title "Add Forgejo to lungmen" \
  --body "Added Forgejo as described in issue #973"
```

## Review checklist

* [ ] Branch name follows convention
* [ ] All commits follow Gitmoji format with `-S -s` flags
* [ ] PR title is Gitmoji-formatted with correct scope
* [ ] PR body has all standard sections: Summary, Changes Made, Technical Impact, Testing Validation, Related Issues
* [ ] File paths in Changes Made use `[`path`](path)` link syntax
* [ ] Attribution footer included
* [ ] Issue referenced (`Closes #number` or `Refs #number`)

## References

* Commit rules: `.claude/rules/git-commits.md`
* PR templates: `.github/PULL_REQUEST_TEMPLATE/`
* Project overview: `CLAUDE.md`
* Commit config: `.commitlintrc.js`
* Real examples: PRs #667, #939, #973
