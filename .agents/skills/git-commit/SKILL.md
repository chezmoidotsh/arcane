---
name: git-commit
description: >
  Creates properly formatted Git commits following Arcane project conventions.
  Use when asked to commit changes, write a commit message, or stage files.
  Enforces Gitmoji format with mandatory scope, WHY-focused body,
  Co-authored-by transparency trailer, DCO sign-off, and GPG signature.
compatibility: Requires git
allowed-tools: Bash(git:*)
---

# Arcane Git Commit Skill

## Commit format

```text
:emoji:(scope[,scope2]): Subject starting with uppercase

Body explaining WHY, max 80 chars/line, sentence-case

Co-authored-by: Claude <claude@anthropic.com>
```

## Emojis (most common)

| Emoji        | Use case           |
| ------------ | ------------------ |
| `:sparkles:` | New feature        |
| `:bug:`      | Bug fix            |
| `:memo:`     | Documentation      |
| `:wrench:`   | Configuration      |
| `:bricks:`   | Infrastructure     |
| `:arrow_up:` | Upgrade dependency |
| `:lock:`     | Security fix       |
| `:recycle:`  | Refactor           |
| `:fire:`     | Remove code/files  |
| `:truck:`    | Move or rename     |

Full list: `.claude/rules/git-commits.md`

## Scopes

From `.commitlintrc.js` — use exact values:

| Scope                   | Path                          |
| ----------------------- | ----------------------------- |
| `project:amiya.akn`     | `projects/amiya.akn/`         |
| `project:chezmoi.sh`    | `projects/chezmoi.sh/`        |
| `project:hass`          | `projects/hass/`              |
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

Multiple scopes: `scope1,scope2` (no spaces, max 3) — only when one logical change atomically touches multiple components.

## Scope selection

1. Files in `projects/[name]/`? → `project:[name]`
2. Files in `catalog/[type]/`? → `catalog:[type]`
3. Files in `.github/` or root config? → `gh`
4. Dependency updates? → `deps`
5. Ambiguous → ask the user, never guess

## Workflow

1. Run `git diff --cached --name-only` and `git log --oneline --no-merges -10` to understand the change and match recent patterns.
2. Determine scope(s) using the selection rules above. Validate against `.commitlintrc.js`.
3. Select the emoji matching the change type from the table above.
4. Draft the subject: imperative mood, UPPERCASE start, no final period, max 100 chars.
5. Write the body for non-trivial changes: explain WHY (motivation, trade-offs), not WHAT (the diff already shows that). Max 80 chars/line.
6. Commit with `-S -s` flags and the `Co-authored-by` trailer.

## Co-authored-by — required

Every AI-assisted commit must include:

```text
Co-authored-by: Claude <claude@anthropic.com>
```

## Sign-off and signature — both required

```sh
git commit -S -s -m "$(cat <<'EOF'
:emoji:(scope): Subject

Body explaining WHY.

Co-authored-by: Claude <claude@anthropic.com>
EOF
)"
```

## Examples

**Good — explains WHY, proper format, both flags:**

```sh
git commit -S -s -m "$(cat <<'EOF'
:sparkles:(project:lungmen.akn): Add Forgejo Git hosting service

Forgejo is a lightweight self-hosted forge with GitHub-compatible
APIs, enabling version-controlled infrastructure repositories
without relying on external SaaS providers.

Co-authored-by: Claude <claude@anthropic.com>
EOF
)"
```

**Bad — no emoji, no scope, no flags, body describes WHAT not WHY:**

```sh
git commit -m "add forgejo - creates deployment, httproute and secrets"
```

## References

* Full rules and emoji list: `.claude/rules/git-commits.md`
* Commit config: `.commitlintrc.js`
