---
name: postmortem
description: >
  Produces a rigorous, blame-free post-mortem analysis of a failure event — missed targets,
  failed launches, broken processes, bad hires, outages, or any outcome that diverged
  significantly from expectations. Use this skill whenever the user wants to analyze what
  went wrong, understand root causes, write a post-mortem, do a retrospective on a failure,
  figure out why something failed, debrief after a missed deadline or quarter, review a
  production incident, or extract lessons from a negative outcome. Also trigger when phrases
  like "what went wrong", "why did this fail", "let's look back at what happened",
  "retrospective on the incident", "lessons learned", "we need to understand why X happened",
  or "postmortem" / "post-mortem" / "blameless postmortem" appear. Even when the user
  doesn't use those exact words — if they describe a failure and want to understand causes
  and prevent recurrence, this is the right skill.
compatibility: none required
---

# Post-Mortem Analysis Skill

## Why we write post-mortems

A post-mortem extracts maximum learning from a failure so the system improves. It is neither a
blame session (which suppresses honest input and guarantees recurrence) nor a whitewash (which
produces vague action items that nobody tracks). The goal: identify what *conditions* made the
bad outcome predictable in hindsight, then change those conditions.

Post-mortems are only useful if they're honest — and honesty requires psychological safety.
If the user mentions that people are defensive or that the culture is blame-oriented, name that
explicitly in the document. A sanitized post-mortem protects individuals; an honest one protects
the system.

## When NOT to use this skill

* **Pre-mortems** (prospective risk analysis before a launch) — different framework, not this one.
* **Sprint retrospectives** focused on process improvement rather than a specific failure event.
* **Blame-oriented investigations** — if the user wants to assign fault rather than understand
  causes, name the conflict and redirect toward systemic analysis.
* **Incident response** (active outage management) — this is for after the dust settles.
* **Trivial deviations** — a five-minute deployment delay or a minor config typo with zero
  user impact doesn't need a post-mortem. Reserve this for events with real impact.

## Workflow

### Attribution convention

Post-mortems record who did what. In an AI-assisted context, actors and owners can be humans,
AI agents, or automated systems. Use this format consistently across the frontmatter, timeline,
and change register:

| Type             | Format             | Example                                    |
| ---------------- | ------------------ | ------------------------------------------ |
| Human            | `Name`             | `Alexandre`                                |
| AI agent         | `[provider:model]` | `[anthropic:claude-sonnet-4-6]`            |
| Automated system | `[system:name]`    | `[system:alertmanager]`, `[system:argocd]` |

This mirrors the `Assisted-by: provider:model` trailer convention used in git commits.

**Ownership rules:** An AI agent can own a change register item when it will execute the fix
autonomously. A human must own any item requiring judgment, approval, or external interaction.
When an AI drafts the document itself, record it in the `author` and `participants` frontmatter
fields using the `[provider:model]` format.

***

### Step 1 — Gather the facts from the user

The facts must come from the user, not from inference. An AI-inferred account of what happened
may sound plausible but will embed false context in a document the team uses to make real
decisions. Before writing anything, ask the user for:

* The **event**: what was expected to happen, what actually happened, and when the gap became visible.
* The **impact**: quantified where possible (downtime, revenue, user count, SLA breach, data loss).
* The **timeline**: key events in order — what changed, when, and who noticed.
* The **decisions made** during the event and why they were made at the time.
* The **warning signs** that were visible in retrospect.
* Any **context** at the time (release pressure, known technical debt, staffing gap, etc.).

If the user gives incomplete information, ask targeted follow-up questions. Do not fill gaps
with plausible guesses — a wrong account is worse than an incomplete one.

### Step 2 — Define the event precisely

Before any analysis, crystallize a precise event definition. This anchors everything that
follows: if the event is vague, the root causes will be vague.

**Bad:** "The deploy failed last Tuesday."

**Good:** "The Kubernetes rolling update for `forgejo` at 14:32 UTC on 2026-05-18 failed to
complete within the 10-minute window. Four pods entered `CrashLoopBackOff` due to a missing
secret. Service was degraded for 47 minutes. No data loss; no external user impact."

Push for specifics: numbers, timestamps, named components, stated objectives vs actual results.

### Step 3 — Build the timeline

Reconstruct the sequence from first signal to full resolution. Each entry should capture: what
happened, when, and what decision was made (if any) at that moment.

A complete timeline prevents the "we should have caught this earlier" fallacy by showing exactly
what was visible and when — it anchors hindsight bias.

**Timestamp format** — all timestamps are UTC, using ISO 8601:

```
YYYY-MM-DDTHH:mm[:ss[.nnnn]]
```

Sub-seconds and seconds are optional. When a timestamp is approximate, prefix it with
`±Xm` (known skew) or `±?` (approximate, skew unknown):

| Example                | Meaning                                               |
| ---------------------- | ----------------------------------------------------- |
| `2026-05-25T16:28:24`  | Exact — sourced from a structured log                 |
| `±5m 2026-05-25T18:30` | Approximate ±5 min — inferred from log gaps or memory |
| `±? 2026-05-25T18:30`  | Approximate — skew not quantifiable                   |

**Clock skew** — always add a `<!-- skew: ... -->` comment before the timeline table
documenting the uncertainty source and how it was (or could be) measured. To measure
clock skew at incident time on a Talos cluster:

```bash
# NTP skew on Talos nodes — compare LOCAL TIME vs REFERENCE TIME (NTP) columns
talosctl time --nodes <node-ip>

# Local machine UTC reference at this instant
date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"
```

### Step 4 — Choose the root-cause technique

Select the right technique based on the failure type, then read the corresponding reference file
before applying it:

| Situation                                                   | Technique           | Reference                           |
| ----------------------------------------------------------- | ------------------- | ----------------------------------- |
| Single linear cause chain (most post-mortems)               | 5 Whys              | `references/five-whys.md`           |
| Multiple interacting causes, complex systems                | Ishikawa (Fishbone) | `references/ishikawa.md`            |
| Engineering/system failures with clear component boundaries | Fault Tree Analysis | `references/fault-tree-analysis.md` |
| Near-misses, safety-critical, multi-layer defense failures  | Swiss Cheese Model  | `references/swiss-cheese-model.md`  |
| Recurring failures, pattern across multiple incidents       | Pareto Analysis     | `references/pareto-analysis.md`     |

When unsure, default to **5 Whys** — it handles most post-mortems and naturally surfaces when
a deeper technique is needed (the chain loops, dead-ends, or branches into multiple threads).

**The test for a good root cause:** Could a specific, concrete change prevent recurrence of
this *class* of problem? If yes, you've found something real. If you reach "that's just how it
is," back up and try a different angle.

### Step 5 — Separate root causes from contributing factors

This distinction matters more than most people realize. Addressing only contributing factors
produces a different-looking but structurally identical failure next time.

* **Root cause:** the fundamental condition that made the outcome probable. Fix it and this
  *class* of problem stops recurring.
* **Contributing factor:** made the failure worse or more likely, but isn't the core enabler.
  Fixing it reduces impact without addressing the underlying structural condition.

Ask for each candidate: "If I remove this factor, does this *class* of problem stop recurring?"
If no, it's contributing, not root.

**Bad:** "The engineer pushed without review." → Still a symptom.
**Good:** "No required review gate existed in the CI pipeline for this environment." → The
structural gap that enabled every "pushed without review" incident in this class.

### Step 6 — Identify missed warning signs

Every failure has precursors that are obvious in hindsight. For each signal, ask *why it wasn't
acted on* — the answer often reveals a deeper root cause:

* "We didn't have visibility" → monitoring gap
* "It was flagged but dismissed" → prioritization or incentive problem
* "We didn't feel safe raising it" → psychological safety — often a deeper root cause than any
  technical finding

### Step 7 — In-control vs out-of-control analysis

Some failures happen despite correct decisions. "It was outside our control" is sometimes real,
sometimes an avoidance tactic. Be rigorous:

* **In control:** internal decisions, process gaps, tooling choices, resource allocation. → Prevention.
* **Out of control:** market shifts, vendor outages, customer decisions, macro events. → Resilience.

For every out-of-control factor, ask: "What specific change would have reduced our exposure?"
That question usually reveals an in-control decision that was made implicitly.

### Step 8 — Identify what went well

In a blameless post-mortem, "what went well" is not decorative. It identifies which controls
actually worked — the monitoring that fired, the person who escalated, the runbook that was
followed — so those behaviors are reinforced and not accidentally removed in the next
architecture change.

### Step 9 — Surface systemic lessons

Some failures reveal something true beyond this specific incident — a structural condition that
will produce similar failures until addressed. Distinguish these from tactical fixes:

* **Tactical fix:** "Add a pre-deploy check for the missing secret."
* **Systemic lesson:** "Our secret provisioning has no pre-deploy gate and no owner; this
  pattern appears in three of the last five incidents."

Systemic lessons often deserve their own ADR (see `.agents/skills/adr-authoring/SKILL.md`).

### Step 10 — Build the change register

Vague action items are the primary failure mode of post-mortems. Every item needs:

1. **What exactly is changing** — not "improve monitoring" but "add `CrashLoopBackOff` alert
   with owner assignment to the `ops` channel"
2. **Who owns it** — a named person, not a team
3. **By when** — a real date
4. **How to verify** — observable evidence the change happened and had effect

### Step 11 — Set the verification date

The most commonly skipped step. Without a review date and a specific observable, the change
register is a list of intentions. Pick a concrete date, a specific metric, and a forum.

## Saving the output

Save the completed post-mortem in `docs/incidents/` (create the directory if it doesn't
exist), named with a date prefix and a short description:

```
docs/incidents/YYYY-MM-DD-<short-description>.md
```

Examples:

* `docs/incidents/2026-05-18-forgejo-deploy-crashloopbackoff.md`
* `docs/incidents/2026-05-01-q1-revenue-miss.md`

Commit with the `@` type: `@[docs]: Post-mortem for <event>` — read
`.agents/skills/git-commit/SKILL.md` for the full commit format and signing requirements.

## Using the template

Copy `templates/postmortem.md`, fill in every section, and remove all authoring instructions
(lines starting with `>`). Do not invent a new layout — the template enforces the structure
that makes post-mortems comparable and searchable over time.

## Good vs bad output

**Good — precise event definition:**

> Closed $420K in new ARR vs $680K target — a $260K miss driven by three deals that slipped
> to Q4 and one deal lost to a competitor. Impact: hiring plan delayed 2 months.

**Bad — vague event definition:**

> We didn't hit Q3 targets. Things were harder than expected.

***

**Good — root cause that names a structural condition:**

> Qualification criteria were built 8 months ago for SMB deals and never updated for enterprise
> sales cycles. No owner, no review process.

**Bad — root cause that's actually a symptom:**

> The salesperson didn't qualify the deal properly.

***

**Good — actionable change register entry:**

| # | Action                                                                         | Owner | Due Date   | Verification                                                           |
| - | ------------------------------------------------------------------------------ | ----- | ---------- | ---------------------------------------------------------------------- |
| 1 | Add deal-slippage risk flag to CRM for any opportunity >60 days without a demo | Alex  | 2026-06-01 | Flag visible in CRM weekly report; reviewed in Monday pipeline meeting |

**Bad — vague action item:**

| # | Action                        | Owner      | Due Date | Verification |
| - | ----------------------------- | ---------- | -------- | ------------ |
| 1 | Improve qualification process | Sales team | TBD      | —            |

## Guardrails

Each guardrail exists to prevent a specific, recurring failure mode of post-mortems:

* **Don't write the facts yourself.** You don't know what happened; the user does. An invented
  timeline looks credible but misleads future readers. Ask until you have enough to write accurately.
* **Don't stop at the first "why."** "Someone made a mistake" is a symptom. Keep drilling until
  you reach the structural condition that made the mistake probable.
* **Don't write vague action items.** "Improve process" and "better communication" are not action
  items. Without a named owner, a date, and a verification method, the change register is theater.
* **Don't skip the verification date.** A change register without review is a list of intentions
  with no feedback loop. This is how organizations write the same post-mortem twice.
* **Don't sanitize blame into vagueness.** The goal is blame-free, not fact-free. "The deployment
  process had no required sign-off gate" is honest and blame-free. "There were some process gaps"
  is vague and useless.
* **Don't write a post-mortem for trivial events.** Applying the full framework to every minor
  deviation wastes credibility and attention for the incidents that matter.

## Tone

The post-mortem should read like an engineering incident report, not a performance review.
"Our qualification framework hadn't been updated when we moved upmarket, and no one owned
keeping it current" is understanding. "The salesperson didn't qualify the deal properly" is
blame. Both may be true — but only the first one prevents recurrence.

## References and related skills

* Root-cause reference files: `references/` (five-whys.md, ishikawa.md, fault-tree-analysis.md,
  swiss-cheese-model.md, pareto-analysis.md)
* Committing the output: `.agents/skills/git-commit/SKILL.md`
* Documenting structural lessons as ADRs: `.agents/skills/adr-authoring/SKILL.md`
* Output template: `templates/postmortem.md`
