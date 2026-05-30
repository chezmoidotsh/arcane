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

A post-mortem in this repository serves three distinct functions. **All three must be present
or the document is wasted effort:**

1. **Memory** — reconstruct what happened without hindsight bias (timeline, decisions, signals).
2. **Feedback loop** — guarantee that in N weeks we know whether the system actually changed
   (verifiable outcomes, dated actions, automated follow-up via `.github/workflows/schedule.postmortem-followup.yaml`).
3. **Structural pressure** — force an architectural or process change that makes the *class* of
   incident improbable (Systemic Lessons → From Lesson to Control → linked artifact).

Post-mortems are only useful if they're honest. In this homelab context, honesty mostly means
not letting an AI agent fabricate a plausible-sounding root cause to "complete" the document.
When the cause is genuinely unknown, say so explicitly (cf. Cilium 1.19 incident).

## When NOT to use this skill

* **Pre-mortems** (prospective risk analysis before a launch) — different framework, not this one.
* **Sprint retrospectives** focused on process improvement rather than a specific failure event.
* **Incident response** (active outage management) — this is for after the dust settles.
* **Trivial deviations** — a 5-minute deployment delay or minor config typo with zero impact
  doesn't need a post-mortem. Reserve this for events with real impact (see severity grid).

## Lite vs full format

| Use lite format (`templates/postmortem-lite.md`)               | Use full format (`templates/postmortem.md`)                   |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| Incident < 2h                                                  | Incident ≥ 2h OR ≥ 8 distinct remediation attempts            |
| No data loss, no security exposure                             | Any data loss, any security exposure (real or evaded by luck) |
| No systemic lesson — single-instance bug, clear isolated cause | Any systemic lesson worth tracking                            |
| Severity Low or Medium                                         | Severity High or Critical                                     |

When in doubt, start lite. If the analysis grows past 100 lines or surfaces a systemic lesson,
promote to full format.

## Severity grid (homelab-calibrated)

Severity is **not** SRE-classic (SLO/SLA-based) — calibrate to the homelab reality:

| Severity | Trigger (any of)                                                            |
| -------- | --------------------------------------------------------------------------- |
| Critical | Essential family service down > 1h (NAS, photos, calendar, home automation) |
|          | OR confirmed data loss                                                      |
|          | OR security exposure: leaked secret, expired cert on public-facing service  |
| High     | Cluster or service down > 30min, affecting me only                          |
|          | OR data loss narrowly evaded (corruption detected just in time)             |
|          | OR known vulnerability present without observed exploitation                |
| Medium   | Degradation > 1h with no data risk                                          |
|          | OR unplanned maintenance that extends                                       |
|          | OR contained incident that signals a structural problem                     |
| Low      | Observed anomaly with no operational impact                                 |
|          | OR unexpected behavior with self-recovery                                   |

If two severities both apply, pick the **higher** one. "It was a maintenance window so it
doesn't count" is not a downgrader — a 45-min API-server outage is a 45-min outage.

## Status workflow

The `status:` frontmatter field has four values:

| Status   | Meaning                                                                     |
| -------- | --------------------------------------------------------------------------- |
| Draft    | In progress, not yet committed to `main`                                    |
| Open     | Merged to `main`, follow-up actions pending. **Default state after merge.** |
| Verified | All Change Register items have verified outcomes (not just checked boxes)   |
| Closed   | Archived; no further action expected                                        |

The followup GitHub Action only operates on `status: Open` post-mortems.

## Root-cause family tagging

The `root-cause-family:` frontmatter field is the input to the Pareto meta-analysis. Tag each
post-mortem with one or more families. Use existing family names when possible; create a new
one only when the failure mode doesn't match any existing tag.

**Current family vocabulary** (extend it, but don't fragment it):

| Family                      | Meaning                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `observability-gap`         | Problem discovered by failure, not by signal — no alert/check existed    |
| `dependency-cycle`          | Component A depends on B which depends on A (storage ↔ registry ↔ …)     |
| `merge-vs-replace`          | Tool applies strategic merge when operator expected replace (or inverse) |
| `policy-scope-too-broad`    | Admission policy / NetworkPolicy with insufficient exclusions            |
| `missing-pre-deploy-check`  | Change deployed without validation that would have caught the regression |
| `state-drift`               | Declared state diverged from running state without detection             |
| `network-policy-incomplete` | NetworkPolicy missed an egress/ingress path                              |
| `upstream-regression`       | Vendor or upstream release introduced the failure                        |
| `bootstrap-coupling`        | Implicit setup step not encoded in code or runbook                       |

When `docs/incidents/INDEX.md` shows a family at **3+ incidents**, that family becomes a
**candidate for a dedicated structural project** (probably an ADR + an infrastructure change),
not another individual fix.

## Choosing a root-cause technique

Default to **5 Whys**. Escalate when the 5 Whys hits one of these signals:

| Symptom in your 5 Whys analysis                                  | Escalate to                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Blocks at a "Why" with no honest answer (you don't know)         | Stop. Document the unknown. Use Ishikawa to enumerate hypotheses. |
| Branches into >1 independent cause chain                         | Ishikawa (groups multiple causes by category)                     |
| Multiple defenses failed in sequence (each could have caught it) | Swiss Cheese (models defense-in-depth gaps)                       |
| Same shape of incident already happened 3+ times                 | Pareto across the family of incidents (cf. INDEX.md)              |
| Engineering system with named components and clear failure modes | Fault Tree                                                        |

**The escalation rule is mandatory**: do not write "no root cause identified" with 5 Whys
unresolved. Either escalate to another technique or document explicitly what you couldn't
investigate and why (lack of expertise, missing telemetry, can't reproduce).

References:

* `references/five-whys.md`
* `references/ishikawa.md`
* `references/swiss-cheese-model.md`
* `references/pareto-analysis.md`
* `references/fault-tree-analysis.md`

## Attribution convention

Post-mortems record who did what. Actors can be humans, AI agents, or automated systems.
Use this format consistently across frontmatter, timeline, and change register:

| Type             | Format             | Example                                    |
| ---------------- | ------------------ | ------------------------------------------ |
| Human            | `Name`             | `Alexandre`                                |
| AI agent         | `[provider:model]` | `[anthropic:claude-sonnet-4-6]`            |
| Automated system | `[system:name]`    | `[system:alertmanager]`, `[system:argocd]` |

This mirrors the `Assisted-by: provider:model` trailer convention used in git commits.

**Ownership rules:** An AI agent can own a Change Register item only when it will execute the
fix autonomously in the same session. Any item requiring future judgment, approval, manual
verification, or external interaction must be owned by a human.

***

## Workflow

### Step 1 — Gather the facts from the user

The facts must come from the user, not from inference. An AI-inferred account of what happened
may sound plausible but will embed false context in a document the team uses to make real
decisions. Before writing anything, ask the user for:

* The **event**: what was expected, what actually happened, when the gap became visible.
* The **impact**: scope (services, cluster, family), duration, data exposure.
* The **timeline**: key events in order — what changed, when, who noticed.
* The **decisions made** during the event and why they were made at the time.
* The **warning signs** that were visible in retrospect.
* Any **context** at the time (release pressure, known technical debt, recent change).

If the user gives incomplete information, ask targeted follow-up questions. Do not fill gaps
with plausible guesses — a wrong account is worse than an incomplete one.

### Step 2 — Define the event precisely

Before any analysis, crystallize a precise event definition. Push for specifics: numbers,
timestamps, named components, stated objectives vs actual results.

**Bad:** "The deploy failed last Tuesday."

**Good:** "The Kubernetes rolling update for `forgejo` at 14:32 UTC on 2026-05-18 failed to
complete within the 10-minute window. Four pods entered `CrashLoopBackOff` due to a missing
secret. Service was degraded for 47 minutes. No data loss; no external user impact."

### Step 3 — Build the timeline

Reconstruct the sequence from first signal to full resolution. Each entry: what happened, when,
what decision was made.

**Timestamp format** — UTC, ISO 8601: `YYYY-MM-DDTHH:mm[:ss[.nnnn]]`

| Example                | Meaning                                               |
| ---------------------- | ----------------------------------------------------- |
| `2026-05-25T16:28:24`  | Exact — sourced from a structured log                 |
| `±5m 2026-05-25T18:30` | Approximate ±5 min — inferred from log gaps or memory |
| `±? 2026-05-25T18:30`  | Approximate — skew not quantifiable                   |

Always add a `<!-- skew: ... -->` comment before the timeline table documenting the uncertainty
source. To measure clock skew on Talos:

```bash
talosctl time --nodes <node-ip>           # NTP skew on Talos nodes
date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"         # local machine UTC reference
```

#### Timestamp sourcing — non-negotiable

**You may not invent timestamps to make the timeline look complete.** The most common AI failure
mode in post-mortems is generating plausible "+5 min" intervals between actions to fill gaps.
This produces a chronology that *looks* precise but is fiction — and fiction in a post-mortem
poisons every future analysis that depends on it.

**Allowed sources for a timestamp:**

| Source                                        | Required marker                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Structured log line (Zot, Cilium, ESO, …)     | Exact form `2026-05-25T16:28:24` — and quote the source in skew comment                       |
| Shell history with PROMPT\_COMMAND timestamps | `±1m` form — reliable to the minute                                                           |
| Commit timestamp (when fix was committed)     | Exact form, taken from `git show -s --format=%cI <sha>`                                       |
| Kubernetes resource creation/restart time     | `±1m` form — from `kubectl get -o yaml` `metadata.creationTimestamp` or pod restart timestamp |
| Operator memory ("around 18:30, I noticed…")  | `±? 2026-05-25T18:30` — skew unknown, marked with `±?`                                        |
| Pod age computed backwards from observation   | `±5m` plus a note in skew comment explaining the back-computation                             |

**Forbidden:**

* Interpolating timestamps between two known points to fill the gap.
* Adding "+5 min" / "+10 min" offsets without a real source for the interval.
* Using a wall-clock timestamp the agent generated itself from "now" at write time.
* Reusing a single observed timestamp for multiple events without marking each as `±?`.

**If a step has no source for its timestamp:** either **omit the time column** for that row,
or write `±? — unsourced` explicitly. **Do not** invent a value, even a vague one.

**The skew comment must be specific about sourcing.** Bad: `<!-- skew: ±? — approximate -->`.
Good: `<!-- skew: exact for [system:zot] (structured JSON logs); ±5m for AI agent actions
(shell history); ±? for Alexandre's recall (memory-based, no log fragment) -->`.

When this rule conflicts with completeness: **incomplete and honest beats complete and
fabricated.** A timeline with three real entries is more useful than ten with five invented.

### Step 4 — Choose and justify the technique

Pick the technique per §"Choosing a root-cause technique". Write the choice and a one-sentence
justification at the top of the Root-Cause Analysis section. **Do not skip the justification** —
it is what forces honesty about whether the technique fits.

### Step 5 — Separate root causes from contributing factors

* **Root cause:** the fundamental condition that made the outcome probable. Fix it and the
  *class* of problem stops recurring.
* **Contributing factor:** made the failure worse or more likely, but isn't the core enabler.

Test: "If I remove this factor, does this *class* of problem stop recurring?" If no, it's
contributing, not root.

### Step 6 — Identify missed warning signs

Every failure has precursors that are obvious in hindsight. For each signal, ask **why it
wasn't acted on**:

* "We didn't have visibility" → `observability-gap` family
* "It was flagged but dismissed" → prioritization problem
* "Workaround was needed for an adjacent incident, never followed up" → cross-PM learning gap

Cross-reference the `related-incidents` field: if a warning sign appeared in a previous PM
and was not converted into an action item, **flag it explicitly**.

### Step 7 — In-control vs out-of-control analysis

* **In control:** internal decisions, process gaps, tooling choices. → Prevention.
* **Out of control:** vendor outages, upstream regressions, hardware issues. → Resilience.

For every out-of-control factor, ask: "What specific change would have reduced our exposure?"
That question usually reveals an in-control decision that was made implicitly.

### Step 8 — Identify what went well

Not decorative. Identifies which controls actually worked — the runbook that was followed, the
diagnostic command that surfaced the cause, the rollback that succeeded — so those behaviors
are reinforced and not accidentally removed in a future architecture change.

### Step 9 — Surface systemic lessons and convert them to controls

A systemic lesson is a structural condition that will produce similar failures until addressed.
**Every systemic lesson must map to a concrete artifact** in the "From Lesson to Control" table:

| Artifact type    | When to use                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| ADR              | A design decision or principle is involved (`docs/decisions/`)           |
| OPA rule         | The lesson can be expressed as a manifest validation (`catalog/opa/`)    |
| Runbook step     | The lesson is procedural (`docs/procedures/`)                            |
| Alert rule       | A signal could have surfaced the precursor                               |
| CI test          | Lesson can be encoded as a build-time check                              |
| Pre-deploy check | Lesson belongs in the upgrade/deploy procedure                           |
| Comment in code  | Lesson is hyper-localized to one file (last resort)                      |
| Knowledge file   | Lesson is operational knowledge for future agents (`.agents/knowledge/`) |

If no artifact type fits, document why explicitly. Lessons without controls are theatre.

### Step 10 — Build the Change Register (parseable format)

Every action item must be parseable by `.github/workflows/schedule.postmortem-followup.yaml`. Format:

```markdown
- [ ] [due:: YYYY-MM-DD] [priority:: high|medium|low] [size:: S|M|L] [owner:: Name] Action
  - **Verification:** Observable outcome of the system
  - **If not done:** Concrete consequence
```

**Priority semantics (homelab):**

* `high`   — without this, the same class of incident recurs likely within 1 month
* `medium` — mitigation or hardening; recurrence possible but not immediate
* `low`    — improvement, cleanup, or nice-to-have

**Size:** S = <2h · M = half-day to 1 day · L = multi-day or requires research

**Verification = observable system behavior, not a git output.**

| Bad                             | Good                                                                      |
| ------------------------------- | ------------------------------------------------------------------------- |
| "Config present in Helm values" | "Next 2 Talos upgrades complete without manual `apply-config` rerun"      |
| "Comments added to file"        | "Pre-upgrade dry-run output covers all `extraArgs` and feature gates"     |
| "Runbook section exists"        | "Next emergency Zot maintenance completes without ArgoCD self-heal fight" |

### Step 11 — Distill Agent Knowledge

In the "Agent Knowledge" section, distill 1–5 declarative bullets that future AI agents (or you
in 6 months) need to know before touching the components involved.

* Format: standalone facts, not narrative.
* Each bullet readable without the surrounding PM context.
* These bullets get **extracted to `.agents/knowledge/<topic>.md`** so that skills touching
  that topic can load them automatically.

### Step 12 — Set the verification schedule

Pick a concrete date, a specific observable, and a forum. For homelab solo work, "Solo review"
is the forum — the date matters more than the audience. The followup GA opens GitHub issues
automatically; the verification schedule is the human checkpoint.

## Saving the output

Save the completed post-mortem in `docs/incidents/`, named:

```
docs/incidents/YYYY-MM-DD-<short-description>.md
```

Examples:

* `docs/incidents/2026-05-25-zot-disk-full-imagepullbackoff.md`
* `docs/incidents/2026-05-26-amiya-kyverno-zot-circular-imagepullbackoff.md`

Commit with the `@` type: `@[docs]: Post-mortem for <event>` — read
`.agents/skills/git-commit/SKILL.md` for the full commit format and signing requirements.

## Automation surface

Three pieces of automation operate on post-mortems. Be aware of them when authoring:

| Automation                                            | Trigger                          | What it does                                                                                                     |
| ----------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/schedule.postmortem-followup.yaml` | Daily cron                       | Parses `[due:: …]` items in `status: Open` PMs; opens GitHub issues for items past due without an existing issue |
| `.github/scripts/postmortem-index.py`                 | On PR touching `docs/incidents/` | Regenerates `docs/incidents/INDEX.md` grouped by `root-cause-family`                                             |
| `.github/scripts/postmortem-extract-knowledge.py`     | On PR touching `docs/incidents/` | Aggregates "Agent Knowledge" sections into `.agents/knowledge/<topic>.md` *(not yet implemented)*                |

For these to work:

* Frontmatter `status:` must be one of the four documented values.
* Frontmatter `root-cause-family:` must be a list (even if a single value).
* Change Register items must follow the exact `- [ ] [due:: YYYY-MM-DD] …` format.
* "Agent Knowledge" bullets must start with `[Component]:` for topic extraction.

## Good vs bad output

**Good — precise event definition:**

> kube-apiserver v1.35.0 exited immediately with `unrecognized feature gate:
> UserNamespacesPodSecurityStandards` at \~09:30 UTC on lungmen.akn during planned upgrade.
> Cluster API unavailable for \~45min; no user workload impacted (maintenance window).

**Bad — vague event definition:**

> The Kubernetes upgrade didn't go smoothly.

***

**Good — root cause that names a structural condition:**

> The pre-upgrade check covers Talos-native flags only. Feature gates injected through the
> user's machine config patch (`extraArgs`, `feature-gates`) are never validated against the
> target Kubernetes version's deprecation list.

**Bad — root cause that's actually a symptom:**

> The feature gate was outdated.

***

**Good — actionable Change Register entry:**

```markdown
- [ ] [due:: 2026-06-02] [priority:: high] [size:: S] [owner:: Alexandre]
      Add pre-upgrade check: cross-reference all `extraArgs` and `feature-gates`
      against the K8s changelog for the target version
  - **Verification:** Next minor-version K8s upgrade completes without `unrecognized flag` crash
  - **If not done:** Same incident shape on next K8s minor bump (likely within 2 months)
```

**Bad — vague entry:**

```markdown
| 1 | P1 | Improve upgrade process | Alex | TBD | — |
```

## Guardrails

* **Don't write the facts yourself.** You don't know what happened; the user does. An invented
  timeline looks credible but misleads future readers.
* **Don't invent timestamps.** Generating "+5 min" intervals to fill gaps is the #1 AI failure
  mode in post-mortems. Every timestamp needs a source (log, shell history, commit, pod age,
  human recall) — see §"Timestamp sourcing — non-negotiable" in Step 3. If no source exists,
  omit the time or mark it `±? — unsourced`. Honest gaps beat fake precision.
* **Don't stop at the first "why."** Keep drilling until you reach the structural condition.
  If you can't, **escalate to another technique** — don't write "no root cause".
* **Don't write vague action items.** Without owner, due date, observable verification, and
  consequence-if-skipped, the Change Register is theatre.
* **Don't claim verification with git outputs.** "Commit present" is not verification. The
  system's behavior is.
* **Don't sanitize blame into vagueness.** "The deployment process had no required gate" is
  honest and blame-free. "There were some process gaps" is vague.
* **Don't write a post-mortem for trivial events.** Reserve for incidents that pass the
  severity grid threshold (Medium or above, or any data/security exposure).
* **Don't skip Agent Knowledge.** If the incident taught you a non-obvious operational truth,
  it must be distilled — otherwise future agents will rediscover it the same way you did.
* **Don't skip From Lesson to Control.** Every systemic lesson must point to a concrete
  artifact. If it can't, document why.

## Tone

The post-mortem reads like an engineering incident report, not a performance review.
"The pre-upgrade check covered only Talos-native flags, so user-supplied feature gates were
never validated" is understanding. "I forgot to remove the old feature gate" is blame.
Both may be true — but only the first prevents recurrence.

## References and related skills

* Root-cause reference files: `references/` (five-whys, ishikawa, swiss-cheese-model,
  pareto-analysis, fault-tree-analysis)
* Output templates: `templates/postmortem.md` (full) · `templates/postmortem-lite.md` (lite)
* Committing the output: `.agents/skills/git-commit/SKILL.md`
* Documenting structural lessons as ADRs: `.agents/skills/adr-authoring/SKILL.md`
* Cross-PM index (auto-generated): `docs/incidents/INDEX.md`
* Knowledge extraction target: `.agents/knowledge/<topic>.md`
