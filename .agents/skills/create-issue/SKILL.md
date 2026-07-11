---
name: create-issue
description: >
  Opens a high-quality GitHub issue for the Arcane repository when the agent identifies work that should be tracked — a
  bug found in passing, a follow-up surfaced by a post-mortem, an enhancement worth proposing, an out-of-scope
  improvement that shouldn't expand the current change. Use this skill whenever you would otherwise say "we should also
  do X later" or "this deserves its own issue". Enforces sentence-form titles (no commit symbol format — labels carry
  type and scope), the project's label taxonomy, a focused body skeleton (TL;DR / Context / Proposal / Acceptance
  criteria / Notes), and the Assisted-by attribution footer.
compatibility: Requires git and GitHub CLI (gh)
---

# Arcane Create-Issue Skill

## When to file an issue

File an issue when the work meets **all three** of these:

1. **It's not in scope for the current change.** If you can do it now in the current PR without expanding scope, do it
   now — don't park it.
2. **It's specific enough to act on.** "Improve performance" is not an issue; "Replace nginx with envoy on lungmen
   because of memory pressure (\~800Mi steady-state)" is.
3. **It carries information the codebase doesn't.** A symptom you observed, a decision rationale, a constraint that
   changed. An issue that only restates what `git log` or the manifests already show is noise.

Common high-signal triggers:

- You notice a bug while doing unrelated work.
- A post-mortem produces a follow-up action you can't ship in the same PR.
- You designed something with an explicit tradeoff and want a tracked place for the next iteration.
- You hit an external blocker (upstream bug, missing feature) and need a place to link back to.

Don't file an issue for:

- Refactor ideas with no concrete trigger ("could be cleaner") — let them surface organically.
- Status updates ("X is currently broken, I'll look later") — fix it or open a real issue with a hypothesis.
- Questions you can answer by reading the code — read the code.

## Title format

**Sentence form. No symbol prefix, no bracketed scope, no trailing colon.**

```text
Verb-first descriptive sentence (parenthetical context optional)
```

The commit symbol format (`+[scope]: Subject`) is the **commit** convention and stays there — it's terse on purpose for
git log. In an issue list, a reader needs to scan titles as English. Type and scope belong in **labels**, not in the
title.

### Rules

- **Imperative or descriptive sentence** — start with a verb when proposing work ("Set up …", "Replace …", "Reduce …");
  start with the symptom when reporting a bug ("WAL volume full on …", "ArgoCD sync loops every 30s on …").
- **Sentence-case** — uppercase first letter, the rest as ordinary prose.
- **No trailing period.**
- **Length ≤ 100 characters.** Use parenthetical context for a sub-clause rather than a colon:
  `Set up cluster observability stack (metrics, logs, alerting)`.
- **Be specific.** The title is the most-read field — invest in it.
- **Say what changes for an operator when it closes.** If a triager can't tell the outcome from the title alone, rewrite
  it.

### Good vs bad

| Bad                                                   | Why it's bad                               | Better                                                                 |
| ----------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `+[gh]: Set up observability`                         | Commit format, no outcome                  | `Set up cluster observability stack (metrics, logs, alerting)`         |
| `Fix immich`                                          | No symptom, no scope clarity               | `WAL volume full on apps-secured cluster — immich and paperless down`  |
| `Improve performance`                                 | Vague — what improves, by how much, where? | `Reduce ArgoCD reconciliation interval from 3min to 30s on small apps` |
| `Replace X with Y`                                    | No motivation in the title                 | `Replace Envoy Gateway with Cilium built-in Gateway API`               |
| `Observability`                                       | Single-word, useless in a list             | `Set up cluster observability stack (metrics, logs, alerting)`         |
| `🔧(project:lungmen.akn): Set up observability stack` | Gitmoji + parens, looks like a commit      | `Set up cluster observability stack (metrics, logs, alerting)`         |

When in doubt: read the title cold without the body. If it doesn't answer _what would change_, rewrite it.

## Labels

The title doesn't carry type or scope — **labels and Issue Type do**. Apply one Issue Type and at least one label from
each mandatory group:

| Field / Group | Mandatory            | Apply                                                                                                                                                                          |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Issue Type    | **yes**              | One of `Bug`, `Feature`, `Improvement`, `Task`, `Docs`, `Security`, `Question` — set with `--type <Name>`                                                                      |
| scope         | **yes**              | The repository area as a label (`project`, `catalog`, `gh`, `deps`, …) — name the specific cluster/area in the issue body                                                      |
| `size::*`     | yes when known       | `size::XS`, `size::S`, `size::M`, `size::L`, `size::XL`. If you cannot estimate, leave it off rather than guessing.                                                            |
| `priority::*` | yes when non-default | `priority::critical` (outage / data loss / active security), `priority::high` (this week), `priority::medium` (default — omit unless explicit), `priority::low` (nice-to-have) |

### Issue Type decision tree

What does the issue ask for?

| Intent                                                    | Type          |
| --------------------------------------------------------- | ------------- |
| Repair broken behavior                                    | `Bug`         |
| Add a new capability, service, or initial deployment      | `Feature`     |
| Improve existing behavior (perf, config, UX) — not a bug  | `Improvement` |
| Tooling, CI, refactoring, or repository maintenance       | `Task`        |
| Documentation only (ADRs, READMEs, procedures)            | `Docs`        |
| Security hardening, vulnerability, secret management      | `Security`    |
| Clarification or discussion, no concrete change requested | `Question`    |

Breaking variants of any change add the `breaking-change` label.

### Scope-label decision tree

Which area of the repo does this touch?

| Where the work lands                             | Label                                    |
| ------------------------------------------------ | ---------------------------------------- |
| `projects/<cluster>/`                            | `project` (name the cluster in the body) |
| `catalog/<area>/`                                | `catalog` (name the area in the body)    |
| `.github/`, root configs, cross-cutting concerns | `gh`                                     |
| Dependency updates                               | `deps`                                   |

**Cross-cutting test:** if the issue body would say "this affects all clusters" or "this is a systemic concern", the
scope is `gh`, not one of the projects. Don't pick a single project just because it's where you'll deploy first — that's
a phase, not a scope.

Multi-scope is fine when the work genuinely splits across components — apply multiple scope labels.

The full canonical list is `.github/labels.yaml`.

## Body structure

Five sections, in order. Drop any that don't apply rather than padding. Keep each as short as it can be while remaining
unambiguous.

```markdown
> [!NOTE] **TL;DR**: One sentence — the outcome you want and the value it delivers.

## Context

What exists today, what's broken or missing, evidence (logs, links, post-mortems). Be factual. Skip background the
reader can derive from the codebase.

## Proposal _(or **Reproduction** for bugs)_

For features/improvements: what you want to do, with explicit options when weighing alternatives. For bugs: exact
steps + observed vs expected.

## Acceptance criteria

Observable outcomes that signal "done". Used during review and after deploy. A real checklist, not aspirational bullets.

## Notes

Related issues/PRs/ADRs, upstream references, post-mortems. Optional.

---

<sub>AI-assisted with <provider>:<model-id> under human supervision</sub>
```

### Field rules

- **TL;DR**: one sentence. If you can't, the issue is two issues.
- **Context**: facts and evidence — verbatim error strings, links to runs/logs, references to ADRs and post-mortems. No
  motivational filler ("this is important because…").
- **Proposal**: specific enough that someone could start. Compare alternatives only when the choice is genuinely open;
  otherwise pick one and say why.
- **Acceptance criteria**: each item must be checkable by reading state (logs, metrics, manifests). "Improves UX" fails
  this test; "Grafana dashboard renders cluster CPU at 10s resolution" passes.
- **Notes**: optional. Use only for cross-references that future maintainers will want at hand.

### Body line length

**No hard limit. Do NOT wrap prose at 80 characters.** GitHub renders markdown, so let paragraphs flow as natural
sentences. The 80-char rule is for **commit messages only** (where `git log` is read in a fixed-width terminal); issue
and PR bodies are read in a browser and the raw source is read when the body is edited via the UI or `gh issue edit`.
Wrap only structural elements (tables, code blocks, lists, headings) as usual.

### What NOT to include

- Restating the title or the labels.
- Implementation steps for things that should be PR-level decisions ("create file X, then file Y, then…"). Leave that to
  the planner.
- Empty risk tables, empty "alternatives considered" with one entry, empty migration plans.
- Generic "AI Analysis" placeholders when you don't actually have analysis to share.
- "This will be implemented in phases" when there's no phase plan yet — surface it once it exists.

A focused 30-line body that links to two PRs and one post-mortem is more useful than a 300-line body that fills every
template field.

## Workflow

### 1. Check for duplicates

```sh
gh issue list --repo chezmoidotsh/arcane --state all --search "<keyword>" --limit 10
```

Search title and body for the symptom or feature name. If a related issue exists, decide: comment on it, or file a
distinct one and cross-link.

### 2. Draft title and body

Apply the rules above. Read the title aloud — does it say what changes?

### 3. Pick Issue Type and labels

Mandatory: `--type <Name>` + the scope label. Add `size::*` and `priority::*` when you have signal for them.

### 4. Create the issue

Always write the body to a temp file and use `--body-file` — `--body "$(cat <<EOF…)"` is fragile with backticks and can
corrupt rendering.

```sh
cat > /tmp/issue_body.md << 'IBODY'
> [!NOTE]
> **TL;DR**: <one sentence>

## Context

<facts, evidence>

## Proposal

<what to do>

## Acceptance criteria

- [ ] <criterion 1>
- [ ] <criterion 2>

## Notes

<links>

---

<sub>AI-assisted with <provider>:<model-id> under human supervision</sub>
IBODY

gh issue create \
  --repo chezmoidotsh/arcane \
  --title "Sentence describing the outcome" \
  --body-file /tmp/issue_body.md \
  --type "Feature" \
  --label "gh" \
  --label "size::M"

rm /tmp/issue_body.md
```

### 5. Cross-link

If the issue follows from a post-mortem, add it under "Resolution Tracker" in that post-mortem. If it parks scope
deferred from a PR, link both ways.

## Examples

### Good — cross-cutting feature

**Title:** `Set up cluster observability stack (metrics, logs, alerting)`

**Type:** `Feature` — **Labels:** `gh`, `size::XL`, `priority::high`

**Body skeleton (excerpt):**

```markdown
> [!NOTE] **TL;DR**: Deploy metrics + logs + alerting across all clusters, starting on lungmen.akn, so post-mortems stop
> concluding with "we had no data".

## Context

All clusters currently rely on `kubectl logs`. Every recent post-mortem (#1013 WAL full, #997 commit validator) cites
"no observability" as a slowdown factor. lungmen.akn is the active-development cluster and the natural first target;
design must remain multi-cluster.

## Proposal

Two candidates under evaluation:

| Option           | Pros                                        | Cons                            |
| ---------------- | ------------------------------------------- | ------------------------------- |
| VictoriaMetrics  | Familiar (Prometheus-compatible), efficient | Three components to operate     |
| ClickHouse stack | Unified telemetry, fast queries             | No prior operational experience |

Recommend VictoriaMetrics for the first deploy; revisit ClickHouse once operational baseline exists.

## Acceptance criteria

- [ ] vmagent scrapes all `lungmen.akn` namespaces via ServiceMonitor
- [ ] vector ships logs to VictoriaLogs from all pods
- [ ] At least one alert fires end-to-end (`CrashLoopBackOff` > 5min)
- [ ] Grafana dashboard renders cluster CPU/memory/disk at 10s resolution
- [ ] Cilium policies preserve namespace isolation

## Notes

- Post-mortems referencing this gap: #1013, #997
- ADR pending (Phase 1)
```

### Good — bug found in passing

**Title:** `WAL volume full on apps-secured cluster — immich and paperless unavailable`

**Type:** `Bug` — **Labels:** `project`, `priority::critical`, `size::M`

**Body (excerpt):**

```markdown
> [!NOTE] **TL;DR**: CNPG `apps-secured` WAL volume hit 100%; primary refused writes; immich and paperless have been
> down for 4 days.

## Context

- Cluster: lungmen.akn / namespace: databases
- CNPG cluster: apps-secured (primary `apps-secured-1`)
- First observed: 2026-05-25, surfaced via user report
- Barman archiving has been failing silently since 2026-05-24 (S3 credentials rotated)

## Reproduction

1. `kubectl -n databases get cluster apps-secured -o yaml | yq .status` → `Cluster in healthy state` despite archival
   failure
2. `kubectl -n databases exec apps-secured-1 -- df -h /var/lib/postgresql/wal` → 100%
3. `kubectl -n immich logs deploy/immich-server --tail=50` → `ECONNREFUSED 10.43.x.x:5432`

## Acceptance criteria

- [ ] WAL archiving succeeds for 24h continuously
- [ ] Disk usage stays under 80% for 7 days
- [ ] Alert fires when WAL volume > 85% (depends on observability stack)
```

### Bad — title says nothing, body is a ceremony

**Title:** `🔧(project:lungmen.akn): Set up observability stack (metrics, logs, alerting)`

- Gitmoji + parens — looks like a commit, not a title
- Repeats `project:lungmen.akn` (which the body says is just the first deploy target — scope is actually cross-cutting)
- Body has 12 sections, 250 lines, "Pain Points / Motivation / Background" repeating themselves, an empty Risk table, an
  empty "AI Analysis Placeholder" — none of which a reader can act on
- No `--type`, no scope label, no `size::*`

## Rules summary

- **Title**: sentence-case, ≤100 chars, no trailing period, no symbol prefix, no bracketed scope. Carries the outcome —
  not the type, not the scope.
- **Issue Type** (`--type`) is mandatory — it replaces `type::*` labels. Scope label is also mandatory.
- **Labels**: add `size::*` / `priority::*` when you have signal.
- **Body**: TL;DR + Context + Proposal/Reproduction + Acceptance criteria + Notes. Drop sections that don't apply.
- **Attribution**: end with `<sub>AI-assisted with <provider>:<model-id> under human supervision</sub>`
- **No template padding**: an empty section is worse than no section.
- **Cross-link** related post-mortems, ADRs, PRs.

## Relationship to commits

Commits keep the symbol-based `type[scope]: Subject` format (see `.commitlintrc.js` and the `git-commit` skill). That
format is validated by commitlint and is designed for `git log`, where dozens of entries are read at once and the
symbols become useful shorthand.

Issue and PR titles are read one at a time in a list view; English sentences win there. Don't propagate the commit
format upward.

## References

- Label taxonomy: `.github/labels.yaml`
- Commit conventions (kept symbolic): `.agents/skills/git-commit/SKILL.md`
- PR conventions: `.agents/skills/create-pr/SKILL.md`
- Issue template UI for humans: `.github/ISSUE_TEMPLATE/*.yml`
- Examples (real issues): `references/issue-examples.md`
