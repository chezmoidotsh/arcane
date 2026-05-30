---
title: "[Event Name]"
date: YYYY-MM-DD
author: "Name"                            # human: Name · AI agent: [provider:model]
participants:
  - "Name"                                # human: Name · AI agent: [provider:model] · system: [system:name]
  - "[anthropic:claude-sonnet-4-6]"
severity: "Critical | High | Medium | Low"   # see SKILL.md §"Severity grid" — homelab-calibrated
status: "Draft | Open | Verified | Closed"   # Draft: in progress · Open: merged, follow-up pending
                                              # Verified: all actions confirmed · Closed: archived
detection-method: "Alert | User report | Manual discovery | External report | AI anomaly detection"
duration: ""                              # free-form: "~45min" / "5h20m" / "3 days, 8 attempts"
services-affected: []
users-affected: ""                        # qualitative: "family — NAS down" / "me only" / "no impact"
root-cause-family:                        # tag with one or more families (used by INDEX.md + Pareto review)
  - ""                                    # e.g. observability-gap, dependency-cycle, merge-vs-replace,
                                          #     policy-scope-too-broad, missing-pre-deploy-check,
                                          #     state-drift, network-policy-incomplete, …
related-incidents:                        # list with explicit relation
  - path: "docs/incidents/YYYY-MM-DD-other.md"
    relation: "Same auth chain" | "Same dependency cycle" | "Recurring on same component" | …
related-adrs: []                          # e.g. ADR-005 (envoy-gateway-oidc)
related-issues: []                        # GitHub issue links
---

> **Authoring instructions:** Fill in every section. Remove all lines starting with `>`
> (they are instructions, not content). Save to `docs/incidents/YYYY-MM-DD-<short-description>.md`.
>
> **For incidents <2h with no data loss and no systemic lesson:** use the **lite format** instead
> (see SKILL.md §"Lite format"). The full template below is reserved for Critical/High incidents
> or any incident that surfaces a structural lesson.

# Post-Mortem: \[Event Name]

## Executive Summary

> 3–5 sentences for non-technical readers. No jargon, no acronyms. What failed, what the
> impact was, why it happened at the highest level, and what the main fix is.

\[3–5 sentence plain-language summary]

***

## Event Summary

**Expected outcome:** \[What was supposed to happen — specific, quantified]

**Actual outcome:** \[What happened — same level of specificity]

**Impact:** \[Operational, data, security, family — qualitative for homelab]

**Duration:** \[Incident start → fully resolved, with timestamps]

**First signal:** \[When did the divergence first become visible?]

***

## Timeline

> Chronological sequence from first signal to full resolution. Actor format:
> `Name` (human) · `[provider:model]` (AI) · `[system:name]` (alerts, ArgoCD, CI…).
>
> Timestamp format (UTC, ISO 8601): `YYYY-MM-DDTHH:mm[:ss]`
> Prefix `±Xm` when skew is known, `±?` when approximate but not quantifiable.
> Always add a `<!-- skew: ... -->` comment before the table.
>
> **DO NOT invent timestamps.** Every entry must come from a real source: a log line, shell
> history, commit time, pod age, or explicit human recall. Interpolating "+5 min" between
> two known points to fill the timeline is fabrication. If no source exists for a step,
> either omit the time column or write `±? — unsourced`. See SKILL.md §"Timestamp sourcing".
>
> To measure clock skew on Talos: `talosctl time --nodes <node-ip>` then
> `date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"` for local UTC reference.
>
> **Optional — omit the table when timestamps are unreliable.** If no structured logs are
> available, the incident was observed only retrospectively, or every timestamp would be
> `±?` with unknown skew, **omit the timeline entirely** rather than including inaccurate
> data. Note the omission in Event Summary: "Timeline omitted — timestamps not reliably
> reconstructable." Consistent with the anti-fabrication rule in SKILL.md.

<!-- skew: ±? — [src of uncertainty] -->

| Time (UTC)           | Actor                    | Event or decision   |
| -------------------- | ------------------------ | ------------------- |
| YYYY-MM-DDTHH:mm     | Name / \[provider:model] | \[What happened]    |
| ±5m YYYY-MM-DDTHH:mm | Name / \[provider:model] | \[What was decided] |
| ±? YYYY-MM-DDTHH:mm  | \[system:name]           | \[Automated event]  |

***

## What Went Well

> Controls that actually worked. Not decoration — identifies behaviors and controls worth
> keeping when the system evolves.

* \[What worked and why it mattered]

***

## Root-Cause Analysis

**Technique:** \[5 Whys | Ishikawa | Swiss Cheese | Fault Tree | Pareto]
**Why this technique:** \[One-sentence justification — see SKILL.md §"Choosing a technique"]

> **Escalation rule:** if 5 Whys blocks at a "Why" (no honest answer) or branches into >1
> independent chains, **switch** to Ishikawa or Swiss Cheese — don't stop with "no root cause".

### Analysis

> Apply the chosen technique (see `references/` for step-by-step guides). Show the reasoning
> chain, not just the conclusion.

1. **Why did \[symptom]?** → Because \[cause]
2. **Why did \[cause]?** → Because \[deeper cause]
3. **Why did \[deeper cause]?** → Because \[deeper still]
4. **Why did \[deeper still]?** → Because \[near root]
5. **Why did \[near root]?** → Because **\[ROOT CAUSE]**

### Root Causes

> **Test each candidate:** "If I fix this, does this *class* of problem stop recurring?"
> If no, move it to Contributing Factors.

* **\[Root cause]** — \[One sentence explaining why this condition made the failure probable]

### Contributing Factors

* **\[Factor]** — \[How it made things worse, and why it's not a root cause]

***

## Warning Signs Missed

> Signals visible in retrospect. For each: when it was visible, why it wasn't acted on.
> "We didn't have visibility" → monitoring gap. "It was flagged but dismissed" → prioritization.

| Signal                 | When visible     | Why it wasn't acted on                                  |
| ---------------------- | ---------------- | ------------------------------------------------------- |
| \[What was observable] | \[Date or phase] | \[Dismissed / no owner / no visibility / optimism bias] |

***

## Control Analysis

### In Control (what we could have changed)

* \[Internal decision, process gap, tooling choice]

### Out of Control (external factors)

| External factor | What would reduce exposure?    |
| --------------- | ------------------------------ |
| \[Factor]       | \[Specific resilience measure] |

***

## Systemic Lessons

> The broader insight beyond this specific incident — a structural condition that will produce
> similar failures until addressed. Link related ADRs or incidents sharing the same pattern.

* **\[Lesson]** — \[Why this is systemic, not incident-specific. Reference related ADR/incident.]

***

## From Lesson to Control

> **Mandatory section.** Every systemic lesson above must map to a concrete artifact that will
> enforce or surface it in the future. If a lesson cannot be converted (no artifact type fits),
> say so explicitly — but the default expectation is that lessons become controls.
>
> **Artifact types:** ADR · OPA rule · Runbook step · Alert rule · CI test · Pre-deploy check ·
> Comment in code · Knowledge file in `.agents/knowledge/`

| Lesson                | Artifact type | Linked artifact (path / link / "TBD")             |
| --------------------- | ------------- | ------------------------------------------------- |
| \[Lesson short title] | \[Type]       | \[Path or "TBD with deadline in Change Register"] |

***

## Change Register

> Every action: what changes, who owns it, when it's due, what proves it worked.
>
> **Format** (parseable by `.github/workflows/schedule.postmortem-followup.yaml`):
> `- [ ] [due:: YYYY-MM-DD] [priority:: high|medium|low] [size:: S|M|L] [owner:: Name] Action`
>
> **Priority semantics (homelab):**
>
> * `high`   = without this, the same class of incident recurs likely within 1 month
> * `medium` = mitigation or hardening; recurrence possible but not immediate
> * `low`    = improvement, cleanup, or nice-to-have
>
> **Size:** S = <2h work · M = half-day to 1 day · L = multi-day or requires research
>
> **Verification = observable outcome of the system, not output (no "commit done").**

* [ ] \[due:: YYYY-MM-DD] \[priority:: high] \[size:: S] \[owner:: Name] \[Specific action]
  * **Verification:** \[Observable system behavior, not "file present in git"]
  * **If not done:** \[Concrete consequence — what breaks or recurs]

* [ ] \[due:: YYYY-MM-DD] \[priority:: medium] \[size:: M] \[owner:: Name] \[Specific action]
  * **Verification:** \[Observable]
  * **If not done:** \[Consequence]

***

## Agent Knowledge

> **Mandatory if any non-obvious operational truth was discovered.** Distill 1–5 bullets that
> future AI agents (or you, in 6 months) should know before touching this component. These
> bullets get extracted to `.agents/knowledge/<topic>.md` and loaded by relevant skills.
>
> Format: declarative facts, not narrative. Each bullet stands alone without PM context.

* \[Component or command]: \[Behavior or gotcha in one sentence]
* \[Component]: \[Heuristic to apply in the future]

***

## Resolution Tracker

> **What to write:** A living checklist of what has been done and what remains outstanding.
> Unlike the Change Register (planning artifact with owners and dates), this section tracks
> actual execution status with links to GitHub issues and PRs. Update it as items complete.
> Group by natural dependency boundaries (e.g., "pending merge", "pending alerting").
> Every item that has a corresponding GitHub issue or PR must link to it.

<!-- trunk-ignore-begin(markdown-link-check): URL is a placeholder, not a real link -->

### Done

* [x] \[What was completed] — [PR #N](URL) / [Issue #N](URL)

### Pending — \[group label, e.g. "after PR #N merges"]

* [ ] \[What remains] — [Issue #N](URL) if applicable — \[brief note on blocker if any]

<!-- trunk-ignore-end(markdown-link-check) -->

***

## Verification Schedule

> **Don't skip.** A change register without follow-up is theatre. The GA at
> `.github/workflows/schedule.postmortem-followup.yaml` opens GitHub issues when `[due::]` dates pass
> without an issue existing — but this final review is the human checkpoint.

| Checkpoint | Date       | What we'll check                                 | Forum       |
| ---------- | ---------- | ------------------------------------------------ | ----------- |
| 1-week     | YYYY-MM-DD | \[High-priority items complete? Any regression?] | Solo review |
| 1-month    | YYYY-MM-DD | \[Medium items done? Has metric improved?]       | Solo review |
| 3-month    | YYYY-MM-DD | \[Has this class of incident recurred?]          | Solo review |
