---
title: "[Event Name]"
date: YYYY-MM-DD
author: "Name"                            # human: Name · AI agent: [provider:model]
participants:
  - "Name"                                # human: Name · AI agent: [provider:model] · system: [system:name]
  - "[anthropic:claude-sonnet-4-6]"
severity: "Critical | High | Medium | Low"
status: "Draft | Under Review | Final"
detection-method: "Alert | User report | Manual discovery | External report | AI anomaly detection"
mttd: ""                                  # time from incident start to detection, e.g. "12 min"
mttr: ""                                  # time from detection to full resolution, e.g. "47 min"
services-affected: []
users-affected: ""                        # quantified, e.g. "all users of X" or "3 dependent clusters"
related-incidents: []                     # paths to docs/incidents/*.md
related-adrs: []                          # e.g. "docs/decisions/005-envoy-gateway-oidc.md"
---

> **Authoring instructions:** Fill in every section. Remove all lines starting with `>`
> (these are instructions, not content). Save to `docs/incidents/YYYY-MM-DD-<short-description>.md`.

# Post-Mortem: \[Event Name]

## Executive Summary

> **What to write:** 3–5 sentences for non-technical readers. No jargon, no acronyms.
> What failed, what the impact was, why it happened at the highest level, and what the
> main fix is. A stakeholder should understand the full picture from this paragraph alone.

\[3–5 sentence plain-language summary for stakeholders]

***

## Event Summary

> **What to write:** Quantified expected vs actual outcome. Numbers, not adjectives.

**Expected outcome:** \[What was supposed to happen — be specific and quantified]
**Actual outcome:** \[What happened — same level of specificity]
**Impact:** \[Financial, operational, reputational — quantify where possible]
**Duration:** \[Incident start → fully resolved, with timestamps]
**First signal:** \[When did the divergence from expected behavior first become visible?]

***

## Timeline

> **What to write:** Chronological sequence from first signal to full resolution. Include
> the actor for each decision so it's clear who did what and when. Be honest about what
> was and wasn't visible at the time — this anchors hindsight bias.
>
> Actor format: `Name` for humans · `[provider:model]` for AI agents · `[system:name]` for
> automated systems (alerts, ArgoCD, CI pipelines).

| Time (UTC)          | Actor                                     | Event or Decision                    |
| ------------------- | ----------------------------------------- | ------------------------------------ |
| \[YYYY-MM-DD HH:MM] | Name / \[provider:model] / \[system:name] | \[What happened or what was decided] |
| \[YYYY-MM-DD HH:MM] | Name / \[provider:model] / \[system:name] | \[What happened or what was decided] |

***

## What Went Well

> **What to write:** Controls that actually worked — monitoring that fired, runbooks that were
> followed, decisions that contained the blast radius, people who escalated correctly. This is
> not decoration: it identifies behaviors worth reinforcing and controls worth keeping.

* \[What worked and why it mattered]

***

## Root-Cause Analysis

> **What to write:** Apply the chosen technique (see `references/` for step-by-step guides).
> Default to 5 Whys; switch to Ishikawa, Fault Tree, Swiss Cheese, or Pareto when the
> situation calls for it (see SKILL.md for the selection table). Show the reasoning chain,
> not just the conclusion.

### Technique: \[5 Whys / Ishikawa / Fault Tree / Swiss Cheese / Pareto]

> Remove the placeholder below and replace with the actual analysis using the chosen technique.

1. **Why did \[symptom] happen?** → Because \[cause]
2. **Why did \[cause] happen?** → Because \[deeper cause]
3. **Why did \[deeper cause] happen?** → Because \[deeper still]
4. **Why did \[deeper still] happen?** → Because \[near root]
5. **Why did \[near root] happen?** → Because **\[ROOT CAUSE]**

### Root Causes

> **Test each candidate:** "If I fix this, does this *class* of problem stop recurring?"
> If no, move it to Contributing Factors.

* **\[Root cause 1]** — \[One clear sentence explaining why this condition made the failure probable]

### Contributing Factors

* **\[Factor]** — \[How it made things worse, and why it's not a root cause]

***

## Warning Signs Missed

> **What to write:** Signals that were visible before the failure, in hindsight. For each:
> when it was visible, and why it wasn't acted on. "We didn't feel safe raising it" is often
> a deeper root cause than any technical finding.

| Signal                 | When visible     | Why it wasn't acted on                                               |
| ---------------------- | ---------------- | -------------------------------------------------------------------- |
| \[What was observable] | \[Date or phase] | \[Dismissed / not raised / no owner / optimism bias / no visibility] |

***

## Control Analysis

### In Control (what we could have changed)

> Internal decisions, process gaps, tooling choices, resource allocation. The question is prevention.

* \[Internal decision or gap]

### Out of Control (external factors)

> Market conditions, vendor outages, customer decisions, macro events. For each: what specific
> change would have reduced our exposure? That question usually reveals an in-control decision.

| External factor | What would reduce exposure?    |
| --------------- | ------------------------------ |
| \[Factor]       | \[Specific resilience measure] |

***

## Systemic Lessons

> **What to write:** The broader insight this post-mortem surfaces — something true beyond
> this specific incident. Not "we should have caught this sooner" but "our monitoring coverage
> has no owner and drifts over time." Link to related ADRs or incidents if they share the
> same systemic pattern. Systemic lessons often deserve their own ADR.

* **\[Lesson]** — \[Why this is systemic, not incident-specific. Reference related ADR or incident if applicable.]

***

## Change Register

> **What to write:** Every action item must be specific (not "improve X"), owned by a named
> person or agent, dated, and verifiable. An AI agent can own an item it will execute
> autonomously; a human must own anything requiring judgment, approval, or external interaction.
> Priority: P0 = fix within 24h · P1 = this week · P2 = this month.

| # | Priority     | Action                                   | Owner                    | Due Date   | Verification                                              |
| - | ------------ | ---------------------------------------- | ------------------------ | ---------- | --------------------------------------------------------- |
| 1 | P0 / P1 / P2 | \[Specific, concrete change — not vague] | Name / \[provider:model] | YYYY-MM-DD | \[Observable evidence the change happened and had effect] |
| 2 |              |                                          |                          |            |                                                           |
| 3 |              |                                          |                          |            |                                                           |

***

## Verification Schedule

> **Don't skip this section.** Without checkpoints and specific observables, the change
> register is a list of intentions with no feedback loop. Set at least two dates.

| Checkpoint     | Date       | What we'll check                                 | Forum                      |
| -------------- | ---------- | ------------------------------------------------ | -------------------------- |
| 1-week review  | YYYY-MM-DD | \[Are P0/P1 items complete? Any regressions?]    | \[Standup / 1:1]           |
| 1-month review | YYYY-MM-DD | \[Are P2 items complete? Are metrics improving?] | \[Team review]             |
| 3-month review | YYYY-MM-DD | \[Has this class of incident recurred?]          | \[Quarterly retrospective] |
