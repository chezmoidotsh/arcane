---
name: git-commit
description: >
  Creates properly formatted Git commits following Arcane project conventions.
  Use this skill whenever the user wants to commit changes, stage files,
  write a commit message, or finalize work — including phrases like "commit this",
  "commit everything", "make a commit", "stage and commit", or "create a commit message".
  Also triggers when the user finishes a coding task and the next logical step is
  to persist the changes to git. Enforces symbol-based type format with mandatory
  square-bracket scope, structured body, and Assisted-by transparency trailer per
  emerging open-source standards.
compatibility: Requires git
---

# Arcane Git Commit Skill

## Why we commit this way

This repository treats commits as a historical record, not just a synchronization
mechanism. We keep all commits — including imperfect ones — rather than squashing
everything into a single merge commit.

* **Errors are part of the history.** Committing a mistake and then fixing it in the next
  commit is valuable. It shows the debugging trail and helps future me understand what went
  wrong and how it was resolved.
* **Small, atomic commits aid debugging and review.** PRs in this repo tend to be large.
  Breaking changes into unit-sized commits makes it possible to bisect issues, isolate
  regressions, and review changes incrementally rather than as a monolithic diff.
* **Overloading a commit obscures its intent.** A commit that touches ten unrelated things
  is hard to describe, hard to review, and hard to revert. One logical change per commit
  keeps the history readable.

## Commit format

```text
type[scope]: Subject starting with uppercase

Body providing context and intent, max 80 chars/line

Assisted-by: <provider>:<model-id>
```

For breaking changes:

```text
type![scope]: Subject starting with uppercase

Body providing context and intent.

BREAKING CHANGE: What breaks and how to migrate.

Assisted-by: <provider>:<model-id>
```

### Type

The type is a single ASCII symbol (two characters for breaking changes) that encodes the
nature of the change. It appears at the very start of the commit subject and is readable
in any terminal or rendering environment without emoji support.

| Type | Meaning                                                         |
| ---- | --------------------------------------------------------------- |
| `+`  | Add — new feature, service, resource, initial deploy            |
| `-`  | Remove — delete service, file, dead code                        |
| `~`  | Improve — perf, config update, behavioral improvement (non-bug) |
| `!`  | Fix — repair a bug or broken behavior                           |
| `=`  | Refactor — no behavior change (style, tests, DX, CI)            |
| `^`  | Bump — dependency version upgrade or downgrade                  |
| `>`  | Move — rename or relocate resources                             |
| `<`  | Revert — undo a previous commit                                 |
| `#`  | Docs — ADRs, README, procedures, comments                       |
| `$`  | Security — fix, policy, secret management                       |
| `?`  | Experiment — POC, investigation, research                       |
| `*`  | Wildcard — does not fit any other type                          |

**Breaking change types** (append `!` to the base type, before `[`):

| Type | Meaning                                                                   |
| ---- | ------------------------------------------------------------------------- |
| `+!` | Add (breaking) — addition that breaks backward compatibility              |
| `~!` | Improve (breaking) — behavioral change that breaks backward compatibility |
| `-!` | Remove (breaking) — removal that breaks backward compatibility            |

> The full authoritative list lives in `.commitlintrc.js` → `types` array.

**Type selection rules:**

* `~` vs `!` — if it repaired a broken behavior: `!`. If it changed correct behavior: `~`.
* `=` vs `~` — if the change is observable by users or dependent systems: `~`. If
  the behavior is identical from the outside: `=`.
* `^` — always use for dependency bumps, even manual ones; reserve `~` for configuration
  changes that affect behavior.
* `CI/CD` is not a type — use the type that describes what changed (`+` for a new
  pipeline, `~` for a modified one, `=` for a refactored one) and put `gh` or the
  relevant project as the scope.

### Scope

The scope is enclosed in square brackets and identifies which part of the repository
the commit touches. It must be an exact value from `.commitlintrc.js` → `scopes` array.

| Scope                   | Path                          |
| ----------------------- | ----------------------------- |
| `project:amiya.akn`     | `projects/amiya.akn/`         |
| `project:chezmoi.sh`    | `projects/chezmoi.sh/`        |
| `project:hass`          | `projects/hass/`              |
| `project:kazimierz.akn` | `projects/kazimierz.akn/`     |
| `project:lungmen.akn`   | `projects/lungmen.akn/`       |
| `project:shodan.akn`    | `projects/shodan.akn/`        |
| `catalog:ansible`       | `catalog/ansible/`            |
| `catalog:crossplane`    | `catalog/crossplane/`         |
| `catalog:flakes`        | `catalog/flakes/`             |
| `catalog:kustomize`     | `catalog/kustomize/`          |
| `catalog:kairos-bundle` | `catalog/kairos-bundles/`     |
| `catalog:talos`         | `catalog/talos/`              |
| `gh`                    | `.github/`, root config files |
| `deps`                  | Dependency updates            |

**Multiple scopes:** `[scope1,scope2]` (comma-separated inside brackets, no spaces, max 3)
— only when one logical change atomically touches multiple components.

#### Scope decision tree

```text
Which files changed?
├── projects/<name>/*   →  project:<name>
├── catalog/<type>/*    →  catalog:<type>
├── .github/* or root   →  gh
├── dependency update   →  deps
└── ambiguous           →  ask the user — never guess
```

### Subject

* Imperative mood, UPPERCASE first letter, no final period
* Max 100 characters
* Describes the change concisely

### Body

The body is optional for trivial changes and mandatory for everything else. It provides
context that the subject alone cannot convey.

**What to include:**

* The motivation or reason for the change
* Trade-offs or alternatives considered
* Impact on affected systems, services, or users
* References to issues, PRs, or external documentation (do not use '#' syntax for issue
  references since commitlint breaks on that — use plain text like "see issue 123" instead)

**What NOT to include:**

* A restatement of the diff (the diff already shows what changed)
* Implementation details that are obvious from the code

**Formatting rules:**

* Max 80 characters per line
* Sentence-case (start each sentence with UPPERCASE)
* Complete sentences with proper grammar

**Breaking changes** require a mandatory `BREAKING CHANGE:` paragraph in the body
explaining what breaks and how to migrate.

### Assisted-by trailer

This project uses the `Assisted-by:` git trailer to disclose AI assistance. This is
the emerging open-source standard (Linux Kernel, Fedora, LLVM, OpenTelemetry, OpenInfra,
Rocky Linux) and is semantically more accurate than `Co-authored-by:` — the human remains
sole author, the AI is acknowledged as an assistant, not a co-author with legal personhood.

Format: `Assisted-by: <provider>:<model-id>` — use the identifier of the model powering
the current session (e.g. `Assisted-by: github-copilot:claude-sonnet-4.6`).

### Signing and DCO — the AI must stay out of this

The `git commit -s` flag adds a `Signed-off-by:` trailer. This is the committer's
acceptance of the Developer Certificate of Origin (DCO) — a legal attestation that they
have the right to submit code under the project's license (Apache 2.0). Only the human
can accept the DCO. The AI must never add signing flags to the commit command:

* **`-s` (signoff)** — implies legal acceptance the AI cannot provide

The human's git hooks or configuration handle signing independently. The AI's commit
command is always:

```bash
git commit -S -m "..."
```

## Workflow

### 1. Survey the workspace

```bash
git status
git diff --cached --name-only
git diff --name-only
git --no-pager log --oneline --no-merges -10
```

* Staged files (`--cached`) determine what goes into the commit
* Unstaged files (`diff --name-only`) — mention to the user if there are
  relevant unstaged changes they might want to include or exclude
* Recent commits provide style context

### 2. Check for commit splitting

If staged changes span multiple scopes and are not a single atomic change, suggest
splitting into separate commits. For example, files from both `projects/lungmen.akn/`
and `catalog/ansible/` staged together should usually become two commits with different
scopes and types. Ask the user if unsure.

### 3. Select the type

Match the change type using the table above. When in doubt between two types, use the
type selection rules. Never guess on ambiguous cases — ask the user.

### 4. Determine the scope

Use the scope decision tree. Validate against `.commitlintrc.js` if unsure.
Never guess on ambiguous cases — ask the user.

### 5. Draft the subject

Imperative mood, UPPERCASE start, no period, max 100 chars.

### 6. Write the body

For non-trivial changes, explain the WHY — motivation, impact, trade-offs — not the
WHAT (the diff already shows that). Max 80 chars per line, sentence-case.

**The WHY must come from the user, not from the diff.**

The diff shows what changed. The body captures why the human decided to make that
change — and only the human knows that. An AI-inferred motivation may sound plausible
but can actively mislead future readers of the history. A missing body is recoverable;
a wrong body is not.

Acceptable sources for the WHY:

* The user's own words anywhere in the conversation — including context set earlier
  (e.g. "I want to improve this skill because it doesn't follow the new practices"
  is a valid motivation even if said several exchanges before the commit request)
* A linked issue or PR description the user pointed to

Not acceptable:

* Your interpretation of the diff
* Motivations you reconstructed from code or config changes
* What you think the reason probably was

Before writing the body, ask yourself two questions:

**1. Is there a WHY at all?**
A conclusion is not a reason. "It doesn't make sense anymore", "vire ça", "fix this"
all express a decision — not the motivation behind it. If the user hasn't said why,
ask before writing anything.

**2. Is the WHY specific enough to be useful in 6 months?**
A vague reason ("to follow new practices", "for better maintainability") tells a
future reader nothing. Push for the specifics: which practices? what problem does
this solve? what would break if we didn't do it? If the body would be vague, ask
one targeted follow-up question to fill the gap — don't pad with generalities.

### 7. Stage and commit

```bash
git add <files>
git commit -S -m "$(cat <<'EOF'
type[scope]: Subject

Body providing context and intent.

Assisted-by: <provider>:<model-id>
EOF
)"
```

Do NOT add `-s` or `--signoff` flags (see "Signing and DCO" above).

## Examples

### Good — simple addition, clear subject

```bash
git commit -S -m "$(cat <<'EOF'
+[project:lungmen.akn]: Add Forgejo Git hosting service

Forgejo is a lightweight self-hosted forge with GitHub-compatible
APIs, enabling version-controlled infrastructure repositories
without relying on external SaaS providers.

Assisted-by: github-copilot:claude-sonnet-4.6
EOF
)"
```

### Good — dependency bump (automated)

```bash
git commit -S -m "^[deps]: cert-manager to v1.16.0"
```

### Good — multi-scope atomic change

```bash
git commit -S -m "$(cat <<'EOF'
^[catalog:kustomize,catalog:crossplane]: Update cert-manager to v1.16.0

Both the Kustomize base and Crossplane composition depend on the
cert-manager API version. Bumping them atomically prevents version
skew between the two catalogs.

Assisted-by: github-copilot:claude-sonnet-4.6
EOF
)"
```

### Good — breaking change with mandatory body paragraph

```bash
git commit -S -m "$(cat <<'EOF'
~![project:amiya.akn]: Drop Authelia in favor of Pocket-Id native OIDC

Authelia introduced operational overhead with its LDAP dependency.
Pocket-Id covers the same OIDC use cases natively.

BREAKING CHANGE: All services relying on Authelia OIDC endpoints must
update their client_id and redirect URIs before this commit is deployed.
Authelia's Kubernetes resources are fully removed; rollback requires
restoring from the previous tag.

Assisted-by: github-copilot:claude-sonnet-4.6
EOF
)"
```

### Bad — no type, no scope, body restates the diff

```bash
git commit -S -m "add forgejo - creates deployment, httproute and secrets"
```

### Bad — wrong trailer, illegal signing flags, body describes WHAT

```bash
git commit -s -m "$(cat <<'EOF'
+[project:lungmen.akn]: Add forgejo

added kustomization.yaml, deployment.yaml, httproute.yaml,
externalsecret.yaml and network policies

Co-authored-by: Claude <claude@anthropic.com>
EOF
)"
```

### Bad — breaking type applied where it cannot break

```bash
# !! is not a valid type; fix commits cannot be breaking by nature
git commit -S -m "!![project:amiya.akn]: Fix OIDC redirect loop"
```

## References

* Commit config: `.commitlintrc.js`
* ADR-010: `docs/decisions/010-replace-gitmoji-with-symbol-commit-types.md`
* <https://allthingsopen.org/articles/open-source-ai-contributions-assisted-by-git-trailer-standard>
* <https://github.com/rust-lang/rust-forge/blob/8a1ce25d78f9d20a85201bf8808f1c8081be41cf/src/policies/llm-usage.md>
* <https://docs.kernel.org/process/coding-assistants.html>
