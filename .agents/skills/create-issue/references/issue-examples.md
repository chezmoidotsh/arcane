# Issue examples — real and illustrative

Hand-picked references for the `create-issue` skill. Each one demonstrates one
title pattern and one body style — not every example is perfect, but the
patterns are worth copying.

## Cross-cutting feature

**Title:** `Set up cluster observability stack (metrics, logs, alerting)`

**Labels:** `type::feature`, `gh`, `size::XL`, `priority::high`

Why the scope label is `gh`, not `project:lungmen.akn`:

* The body explicitly says it affects amiya, lungmen, kazimierz and any future cluster
* lungmen is the first deployment target, not the scope of the work
* "Cross-cutting" → `gh`, even if the first PR will land in one cluster

Body skeleton — what to keep, what to drop:

```markdown
> [!NOTE]
> **TL;DR**: One sentence with outcome and value.

## Context

Two short paragraphs — current state + concrete pain points with evidence.
Reference post-mortems by number. Skip the "background" history lesson.

## Proposal

When there are real alternatives, present them in a small table. When the
choice is obvious, state it and move on. Decision rationale, not feature list.

## Acceptance criteria

Five or fewer checkable items. Each must be verifiable from logs, metrics,
or manifest state. "Improves observability" fails this; "Grafana renders
cluster CPU at 10s resolution" passes.

## Notes

Two or three high-signal links: ADRs, post-mortems, upstream docs.
```

What this avoided:

* "AI Analysis Placeholder" left empty
* Six-row Risk table with three rows of "TBD"
* "Pain Points" + "Motivation" + "Background" sections that paraphrase each other
* A six-phase implementation plan written before the ADR exists

## Bug reported from observation

**Title pattern:** `<Symptom + where it appears> — <user impact>`

Example: `WAL volume full on apps-secured cluster — immich and paperless unavailable`

**Labels:** `type::bug`, `project:lungmen.akn`, `priority::critical`, `size::M`

The title carries three things a triager needs at a glance:

1. **What** is broken (WAL volume full)
2. **Where** (apps-secured cluster — implicitly on lungmen, confirmed by the label)
3. **Impact** (immich + paperless unavailable)

Body essentials:

```markdown
> [!NOTE]
> **TL;DR**: Single-sentence symptom + impact + duration.

## Context

- Cluster / namespace / app and version
- When the issue started (timestamp if known)
- Any deploy or change that correlates

## Reproduction

Numbered commands a stranger could run. Verbatim output beats narration.

## Acceptance criteria

Conditions that, when true for N consecutive days/runs, mean fixed.
The fix must include observability so we know it's fixed.

## Notes

- Post-mortem link (if any)
- Related issues
```

## Refactor with clear rationale

**Title pattern:** `<Restructure> for <specific reason>`

Example: `Extract shared CNPG backup overlay for cross-cluster reuse`

**Labels:** `type::refactor`, `catalog:kustomize`, `size::S`

Refactor issues need a sharper "why now" — they're easy to defer indefinitely.
If you can't write a body that says "the next time we'd otherwise touch this
is X, and the cost of not doing it is Y", let the refactor surface organically
in the PR that touches the area.

## Dependency bump tracker

**Title pattern:** `<Component> to <version>` (verbs allowed: `Bump …`, `Pin …`, `Hold …`)

Example: `Bump cert-manager to v1.16 (blocked: CRD schema migration)`

**Labels:** `type::chore`, `deps`

Most bumps are Renovate-generated and don't need an issue. File a manual one when:

* A bump requires coordinated changes in multiple files (e.g. CRD schema change)
* A bump is blocked on upstream behavior and you want to track the wait
* You're deliberately staying on an old version and want to document why

Don't open one to say "should upgrade soonish". Renovate already does that.

## Security finding

**Title pattern:** `<Specific weakness> — <attacker capability>`

Example: `OpenBao seal keys not rotated since 2024-12 — full vault unsealing on key leak`

**Labels:** `type::security`, `project:amiya.akn`, `priority::high`

Treat these like bugs but with extra discipline:

* TL;DR includes the *attacker capability* (what they can do), not just the gap
* Acceptance criteria includes "no regression in detection" — fixing without
  closing the detection gap is incomplete
* Add `priority::high` or `priority::critical` based on exploitability

## Experiment / research

**Title pattern:** `Evaluate <option A> vs <option B> for <use case>`

Example: `Evaluate ClickHouse vs VictoriaMetrics for homelab observability`

**Labels:** `type::question` or `type::improve` (depending on whether the outcome is a decision or a change), `gh`

Experiment issues should declare:

* The **decision the experiment will enable** — not just "let's try X"
* The **time-box** — when you'll stop and decide
* The **success threshold** — what data would move the needle

Otherwise they become permanently open question marks.

## Anti-pattern: the kitchen-sink issue

Symptoms of a too-broad issue:

* Title is a project name ("Standardize deployment patterns")
* TL;DR doesn't fit in one sentence
* Acceptance criteria has more than seven items
* "Phase 1 / Phase 2 / Phase 3" subsections without dates or owners

Fix: split it. The follow-ups are the real issues.

## Anti-pattern: the wishlist issue

Symptoms:

* No concrete trigger ("nice to have", "would be cleaner")
* Acceptance criteria is aspirational ("better UX")
* No links to evidence

Fix: don't file it. Let it surface when something concrete pushes it.

## Anti-pattern: the commit-style title

Symptoms:

* Starts with a symbol or gitmoji (`+[…]: …`, `:wrench:(…)…`, `🔧 …`)
* Scope in brackets or parens before the colon
* Reads like a git log entry, not a sentence

Fix: drop the symbol and the bracket; put the type and scope in labels. The
title is for humans scanning a list, not for `git log`.

## How to know your issue is good

Read it 24 hours later, cold. Can you:

* Tell what changes for an operator when it closes, just from the title?
* Start implementing without re-asking yourself what you meant?
* Verify the acceptance criteria from observable state?

If any answer is "no", the issue isn't ready.
