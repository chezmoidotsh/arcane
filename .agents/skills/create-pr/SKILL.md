---
name: create-pr
description: >
  Opens a well-formed pull request for the Arcane repository following project conventions. Use when asked to create,
  open, or submit a pull request, or to push a branch and request a review. Enforces sentence-form PR titles (the
  symbol-based `type[scope]: Subject` format stays on commits — labels carry type and scope on the PR), branch naming
  conventions, structured PR body, and Assisted-by transparency trailer. Arms a background monitor after creation that
  watches for merges and new comments/reviews so follow-up feedback gets picked up automatically.
compatibility: Requires git, GitHub CLI (gh), and jq
---

# Arcane Pull Request Skill

## Pre-flight checks

Before pushing anything:

1. Gather context in one pass (branch, issue number, push status, commits since base, files changed, untracked files):

   ```sh
   bash .agents/skills/create-pr/scripts/gather-context.sh main
   ```

   Use this output for the whole draft below instead of re-running `git log` / `git diff` / `git status` piecemeal.

2. Read `.agents/skills/git-commit/SKILL.md` for commit format and scope conventions.

3. Pick the matching PR template in `.github/PULL_REQUEST_TEMPLATE/`:

   | Change type                             | Template                                                | Distinguishing sections                                                                                                 |
   | --------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
   | New app / new infra component           | `feature.md`                                            | Infrastructure Components, Security Implementation, External Access Points, Integration Points, Future Enhancements     |
   | Restructure / consolidation / migration | `refactoring.md`                                        | Rationale, Architecture Simplification, Security Boundary Preservation, Behavioural Changes, Migration Path, Next Steps |
   | Bug fix / regression                    | `bugfix.md`                                             | Root Cause, Behavioural Changes, Regression Risk, Observability                                                         |
   | Anything else / unsure                  | `pull_request_template.md` (root, same as `feature.md`) | —                                                                                                                       |

   The root `pull_request_template.md` is a copy of `feature.md` and applies by default. To use a non-default template
   explicitly, append `?template=<name>.md` to the PR URL or use `gh pr create --web` and pick from the GitHub picker.

4. List the last 3 merged PRs that are not dependency bumps for style reference:

   ```sh
   gh pr list --limit 30 --state merged --json number,title,author \
     | python3 -c "
   import json, sys
   prs = json.load(sys.stdin)
   human = [p for p in prs if not p['author']['is_bot']][:3]
   for p in human: print(p['number'], p['title'])
   "
   ```

5. Run the commit validator and review its output:

   ```sh
   bash .agents/skills/create-pr/scripts/validate_commits.sh main
   ```

   The script prints `OK`, `FAIL`, or `WARN` for each check:

   - **`FAIL`** — must be fixed before opening the PR (symbol format, GPG signature, Assisted-by trailer).
   - **`WARN`** — `Signed-off-by` is missing. This is a **user responsibility**: the Signed-off-by line is a DCO legal
     attestation that only the human committer can make. Surface the warning to the user and let them decide. Do not add
     `-s` to any commit command yourself.

6. Run trunk check on the changed files and fix all issues before pushing:

   ```sh
   trunk check --filter=-conftest
   ```

   - **`ISSUES` reported** — fix every lint/format error before creating the PR. Do not suppress trunk warnings with
     `trunk-ignore` unless the warning is a known false positive; explain why in a comment when you do.
   - **`No issues`** — proceed to push.

   Run trunk check locally rather than relying on the CI to catch it: a failed CI run after the PR is open costs a
   round-trip and blocks review.

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

### Opening a new PR

1. Create a branch following the naming conventions above.
2. Run the commit validator (step 5 above) and fix any `FAIL` items; surface `WARN` items to the user.
3. Run `trunk check --filter=-conftest` (step 6 above) and fix all issues.
4. Push: `git push -u origin <branch-name>`
5. Draft the PR body following the selected template — see `.github/PULL_REQUEST_TEMPLATE/<type>.md` and
   `references/pr-examples.md`.
6. Create the PR with a **sentence-form** title that says what changes (no symbol prefix, no bracketed scope — the
   commit symbol format is for git log, not for PR titles).
7. Apply the scope label(s) matching the changed paths (`project`, `catalog`, `agents:skills`, `agents:sessions`,
   `agents:knowledge`, `gh`, `deps`) — see `.github/labels.yaml`. There is no `type::*` label for PRs; type is a
   GitHub-native Issue Type field on issues only. Add `size::*` when you have signal.
8. Launch the post-creation monitor (see "Post-creation monitoring" below) so merges and new comments are picked up
   without the user having to check back manually.

### Post-creation monitoring

Right after `gh pr create` succeeds, arm a watcher for that PR number using the Monitor tool — persistent, so it keeps
running for the rest of the session instead of timing out:

```js
Monitor({
  command: "bash .agents/skills/create-pr/scripts/monitor-pr.sh <pr-number> 60",
  description: "PR #<pr-number> merge/comments watch",
  persistent: true,
});
```

The script (`.agents/skills/create-pr/scripts/monitor-pr.sh`) polls every 60s and emits one line per event, then exits
once the PR leaves the `OPEN` state:

- `[comment] <user>: <body>` — a top-level PR conversation comment
- `[review comment] <user> on <path>:<line>: <body>` — an inline diff comment
- `[review <STATE>] <user>: <body>` — a submitted review (`APPROVED` / `CHANGES_REQUESTED` / `COMMENTED` with a body)
- `[state] PR #<n> is now MERGED` or `CLOSED` — terminal, the monitor exits after this line

**On a `MERGED` event:** tell the user the PR merged, stop treating the branch as active work. Do not delete the local
or remote branch automatically — offer to, but deletion is destructive and needs confirmation per the repo's operating
constraints.

**On a `CLOSED` (not merged) event:** tell the user and ask whether to keep working on the branch or drop it.

**On a `[comment]` / `[review comment]` / `[review CHANGES_REQUESTED]` event:** first judge whether the feedback is
actually pertinent — a reviewer (human or bot) can be wrong, out of date, or flagging something already handled
elsewhere. Don't act just because a comment exists.

- **Pertinent and mechanical** (typo, requested rename, missing test the reviewer pointed at, lint/CI fix, a small
  clarification) — implement it directly: edit, then follow "Pushing follow-up commits to an existing PR" below
  (validate commits, `trunk check`, push).
- **Pertinent but a design change, ambiguous, or touches security/secrets/shared infra** — do not push unilaterally.
  Surface the comment to the user and wait for direction, same as any other risky/hard-to-reverse action. Leave the
  thread unresolved until that direction lands.
- **Not pertinent** (already handled, misunderstanding, doesn't apply here) — reply explaining why, don't change code
  just to appease the comment.
- **A `[review APPROVED]` or plain `[review COMMENTED]` with no actionable ask** — no action needed, just note it to the
  user if relevant. Reviews themselves aren't resolvable on GitHub, only their individual review-comment threads are.

**Always reply on the specific thread, never a generic top-level summary comment** — a reviewer re-reading the PR should
see the answer to their exact comment, in place, not have to cross-reference a separate comment listing everything at
once:

- Top-level PR conversation comment (`[comment]`): `gh pr comment <n> --body "..."`.
- Inline review comment (`[review comment]`) that was pertinent and is now addressed (code changed, or a valid "not
  applicable, because …" explanation given): reply **and** mark the thread resolved in one step —
  `bash .agents/skills/create-pr/scripts/resolve-review-comment.sh <pr-number> <comment-id> "<reply-body>"`. Only
  resolve once the fix is actually pushed (or the explanation is final) — a promise to fix later stays unresolved.
- Inline review comment that's pertinent but needs the user's call: reply (if there's something worth saying yet) but
  leave the thread unresolved — resolving is a claim that the concern is settled, and it isn't yet.

This mirrors the existing "confirm before pushing/commenting" rule in `AGENTS.md`: the monitor's job is to bring
feedback to your attention immediately, not to grant blanket authority to push unreviewed changes.

### Pushing follow-up commits to an existing PR

When adding a commit to a branch that already has an open PR:

1. Run the commit validator and trunk check as above.
2. Push the commit.
3. **Ask the user** whether the PR body needs updating to reflect the new changes:

   > A follow-up commit was just pushed to PR #N. Do you want me to review the PR body and update it to reflect the new
   > changes?

   If the user says yes, fetch the current body with `gh pr view --json body`, diff it against the new commits, and
   propose targeted edits to the Summary, Changes Made, and Testing Validation sections. Never silently rewrite the PR
   body — always show the diff to the user before applying.

## PR title format

Sentence form, no symbol prefix, no bracketed scope. Scope lives in the **scope label** (`project`, `catalog`,
`agents:skills`, …) — there's no `type::*` label for PRs, type is a GitHub-native Issue Type field on issues only. The
commit symbol format stays where it belongs — on commits — and is validated by commitlint there.

Examples:

| Bad (commit format applied to a PR)                       | Good (sentence + labels)                            |
| --------------------------------------------------------- | --------------------------------------------------- |
| `+[project:lungmen.akn]: Add Forgejo Git hosting service` | `Add Forgejo as a self-hosted Git forge on lungmen` |
| `![project:lungmen.akn]: WAL volume full`                 | `Fix CNPG apps-secured WAL retention on lungmen`    |
| `^[deps]: cert-manager to v1.16`                          | `Bump cert-manager to v1.16`                        |

Rules:

- Sentence-case, no trailing period.
- ≤ 70 characters when possible (GitHub truncates around there in lists).
- Start with a verb — `Add …`, `Fix …`, `Replace …`, `Bump …`, `Document …`.
- If the change is the implementation of a single issue, the PR title can be the same sentence as the issue title —
  that's a feature, not a duplicate.

## PR body structure

The templates in `.github/PULL_REQUEST_TEMPLATE/` are the authoritative structure. Fill them in honestly and concisely.
The three templates share the same skeleton — only the `Technical Impact` sub-sections (and a few specific sections like
`Rationale` or `Root Cause`) differ.

### Shared skeleton (all templates)

```markdown
## Summary

2–4 sentences: what changed, why now, strategic context (phase in a plan, motivating issue). Always include "**Related
Issue:** #<n>".

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

Closes #<number> <!-- or "Addresses #X (Phase N)" for multi-phase work -->

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

Plus an optional `## Future Enhancements` section after Technical Impact for follow-up work intentionally left out of
scope.

**`refactoring.md`** — adds `## Rationale` (right after Summary, before Changes Made) explaining why this refactor now.
Technical Impact sub-sections:

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

**`bugfix.md`** — adds `## Root Cause` (right after Summary) with logs/metrics that confirm the diagnosis, then `## Fix`
instead of `## Changes Made`. Technical Impact sub-sections:

```markdown
### Behavioural Changes

What changes for users / operators after the fix.

### Regression Risk

Low / Medium / High — justify the rating, list affected areas and mitigation.

### Observability

Logs / metrics / probes that will confirm the fix in production.
```

## Creating the PR

Always write the PR body to a temp file and use `--body-file`. **Never** use `--body "$(cat <<'EOF' ... EOF)"` — shell
quoting in that pattern causes agents to escape backticks as \`\`\`, which GitHub renders literally and corrupts the
body.

```sh
git push -u origin <branch-name>
cat > /tmp/pr_body.md << 'PREOF'
<body following the selected template>
PREOF
gh pr create \
  --title "Sentence describing the change" \
  --body-file /tmp/pr_body.md \
  --base main \
  --label "project"
rm /tmp/pr_body.md
```

## Rules

- **PR title**: sentence-case English, verb-first, no symbol prefix, no bracketed scope, no trailing period. The commit
  symbol format stays on commits.
- **PR labels**: the scope label(s) matching the changed paths are mandatory (see `.github/labels.yaml`: `project`,
  `catalog`, `agents:skills`, `agents:sessions`, `agents:knowledge`, `gh`, `deps`). Add `size::*` when you have signal;
  `priority::*` is issues-only.
- **Commits**: All commits must have the symbol-based `type[scope]: Subject` format, GPG signature (`-S`), and
  `Assisted-by:` trailer. Signed-off-by is the user's responsibility — never add `-s` yourself.
- **PR body line length**: No hard limit — do NOT wrap PR body text at 80 characters. GitHub renders Markdown, so
  natural prose flow is preferred over artificial line breaks. The 80-char rule applies only to git commit bodies, not
  PR descriptions.
- **File paths**: Link files in Changes Made using `[`path`](path)` markdown syntax
- **Technical Impact**: Always present with **named sub-sections** — never just a bare Before/After table or a flat
  bullet list. Drop sub-sections that don't apply rather than leaving them empty.
- **Refactor PRs**: `## Rationale` is mandatory; explains _why this refactor now_.
- **Bugfix PRs**: `## Root Cause` must include evidence (logs/metrics), not just a hypothesis.
- **Attribution**: Always end the body with `<sub>AI-assisted with <provider>:<model-id> under human supervision</sub>`
- **Issue reference**: Always include `Closes #number` or `Addresses #number (Phase N)` when applicable
- **No broken state**: Never create a PR with known broken manifests or missing secrets

## Examples

See `references/pr-examples.md` for real merged PRs from this repository, each illustrating one of the three templates.

**Good — feature PR with named Technical Impact sub-sections:**

```sh
git push -u origin feat/forgejo-lungmen
cat > /tmp/pr_body.md << 'PREOF'
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
PREOF
gh pr create \
  --title "Add Forgejo as a self-hosted Git forge on lungmen" \
  --body-file /tmp/pr_body.md \
  --base main \
  --label "project"
rm /tmp/pr_body.md
```

**Bad — empty body, no labels, title doesn't say what changes:**

```sh
gh pr create \
  --title "Forgejo"               # single word, no outcome
  --body "Added Forgejo as described in issue #973"   # no Summary, no template
```

## Review checklist

- [ ] Branch name follows convention
- [ ] Commit validator shows no `FAIL` lines; `WARN` lines surfaced to user
- [ ] `trunk check --filter=-conftest` reports `No issues` locally
- [ ] PR title is a sentence — verb-first, no symbol prefix, no bracketed scope
- [ ] PR labels include the scope label(s) matching the changed paths
- [ ] PR body matches the selected template skeleton: Summary, Changes Made (with subsystem headings), Technical Impact
      (with **named sub-sections**), Testing Validation, Related Issues
- [ ] Refactor PRs include `## Rationale`; bugfix PRs include `## Root Cause` with evidence
- [ ] File paths in Changes Made use `[`path`](path)` link syntax
- [ ] Attribution footer included
- [ ] Issue referenced (`Closes #number` or `Addresses #number (Phase N)`)
- [ ] Post-creation monitor launched (`.agents/skills/create-pr/scripts/monitor-pr.sh`, `Monitor` tool,
      `persistent: true`)
- [ ] Every actioned review comment got a reply on its own thread (not a generic summary comment), and pertinent ones
      that are now addressed were marked resolved

## References

- Commit rules: `.agents/skills/git-commit/SKILL.md`
- PR templates: `.github/PULL_REQUEST_TEMPLATE/` (`feature.md`, `refactoring.md`, `bugfix.md`)
- Real PR examples: `.agents/skills/create-pr/references/pr-examples.md`
- Project overview: `AGENTS.md`
- Commit config: `.commitlintrc.js`
- Post-creation watcher: `.agents/skills/create-pr/scripts/monitor-pr.sh`
- Reply-and-resolve helper: `.agents/skills/create-pr/scripts/resolve-review-comment.sh`
