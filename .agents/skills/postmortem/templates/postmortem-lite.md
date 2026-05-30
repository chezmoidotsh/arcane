---
title: "[Event Name]"
date: YYYY-MM-DD
author: "Name"                            # human: Name · AI agent: [provider:model]
participants: ["Name", "[anthropic:claude-sonnet-4-6]"]
severity: "Medium | Low"                  # lite format is for Medium/Low only — escalate if higher
status: "Draft | Open | Verified | Closed"
detection-method: "Alert | User report | Manual discovery"
duration: ""                              # e.g. "~45min"
services-affected: []
users-affected: ""
root-cause-family: [""]                   # required even in lite format
related-incidents: []
---

> **When to use lite format:** incident <2h, no data loss, no security exposure, no systemic
> lesson, severity ≤ Medium. If any of these conditions fail, use the full template instead.
>
> Remove all `>` instruction lines before committing.

## Event

**Expected:** \[What should have happened]
**Actual:** \[What happened — quantified]
**Impact:** \[Scope, duration, who was affected]
**Resolution:** \[What fixed it]

> If you include any timestamps in this section, they must have a real source (log, shell
> history, commit time). See SKILL.md §"Timestamp sourcing". Don't fill gaps with `+5min`
> intervals — incomplete and honest beats complete and fabricated.

## Root Cause

**Technique:** \[5 Whys]  *(lite format defaults to 5 Whys; escalate to full template otherwise)*

\[Compact analysis — 3–5 lines max. State the root cause in bold.]

**Root cause:** **\[One-sentence structural condition]**

## Change Register

* [ ] \[due:: YYYY-MM-DD] \[priority:: high|medium|low] \[size:: S|M|L] \[owner:: Name] \[Action]
  * **Verification:** \[Observable outcome]
  * **If not done:** \[Consequence]

## Agent Knowledge (optional)

* \[Component]: \[Gotcha or heuristic, one line]
