---
name: triage-issues
description: >
  Assigns size::* (effort) and priority::* labels to GitHub issues in the Arcane repo using a calibrated decision
  procedure instead of raw time estimates or gut-feel severity. Use this skill when triaging the backlog, when asked
  "what size/priority should this be", "triage these issues", "how urgent is this", "estimate the effort for X", or
  whenever an issue needs size::*/priority::* set (see also create-issue, which files new issues but defers to this
  skill for sizing). Effort tracks blast radius, apply-time risk, and verification difficulty — not wall-clock time.
  Priority tracks whether there's a stated reason driving the work and whether something is actually broken right now —
  not how dangerous the underlying system is.
compatibility: Requires GitHub CLI (gh)
---

# Arcane Triage-Issues Skill

## Why effort and priority are separate axes

The two labels answer different questions and must never leak into each other:

- **Effort** (`size::*`) answers: _how much can go wrong, and how hard is it to know that before it does?_
- **Priority** (`priority::*`) answers: _is there an actual, current reason to do this now?_

A critical bug with a well-understood one-line fix stays `size::S` — effort doesn't inflate because the priority is
`critical`. A catastrophic-blast-radius change with no stated reason stays `priority::low` — priority doesn't inflate
because the effort is `size::XL`. See references/calibration-examples.md#33 and #34 for the cleanest proof: identical
fix, identical effort, opposite priority, based purely on whether someone is actually affected today.

Both procedures below were calibrated against 40 concrete scenarios rated by the repo maintainer (full data:
`references/calibration-examples.md`). When a rule below feels wrong for a specific issue, check that file for the
closest precedent before overriding it.

## Effort — `size::XS` through `size::XL`

The label definitions (`.github/labels.yaml`) anchor each band to a time estimate — XS under an hour, S under a day, M
one to three days, L three days to a week, XL more than a week or multi-phase. Treat that as a **floor**, not the
primary signal. Walk this procedure in order; stop at the first rung that applies.

1. **Unknown scope defaults to the worst case.** If you can't bound the impact — you don't know the subsystem well
   enough, or the actual scope of "dead code" / "CVE severity" isn't yet known — rate it `XL` even if the visible diff
   is small. Uncertainty itself is the cost (calibration #6, #14, #38).
2. **Anything that gets applied/deployed floors at `S`**, never `XS`, however trivial the diff. A one-line `pulumi up`,
   a merged dependency bump, a new unit test — the act of applying to live state is the risk, not the line count (#13,
   #17, #35). Reserve `XS` for changes with **zero apply step**: docs, comments, renames, pure text (#1, #27, #29).
3. **From there, blast radius outweighs time** — but apply these discounts before picking a band:
   - **A fallback path exists** → discount one band. If breaking it still leaves a working path around it (an admin
     account, a manual override), it's not as expensive as it looks (#8).
   - **The mechanism is trusted and well-supported** ("a button", a vetted upgrade path, fully automated regeneration) →
     discount heavily even at wide/fleet scope. Compare #39 (`S`, Talos upgrade via Omni, fleet-wide but "a button,
     fairly confident") against #9 (`XL`, manual cluster rebuild, same fleet scope).
   - **The change is mechanical and tool-verified**, even across many files or call sites — typecheck/existing tests
     catch every break — → stays low. #7 (SDK regen, ~60 files) and #31 (cascading required-arg change, 8 call sites)
     both stayed `S`/`M` because tooling, not manual verification, catches mistakes.
   - Otherwise, blast radius drives the band directly: contained to one app/component → `S`/`M`; broad (cluster-wide,
     fleet-wide, or a system everything else depends on) with no discount above → `L`/`XL`.

     A same-shaped case (big blast, simple config, easy rollback) has landed differently depending on whether the
     affected system reads as a **trust-root with no fallback of its own** (Omni's own auth, core secret-store auth
     backend, root CA) versus **merely broad** (DNS). Treat "trust-root" as a soft tie-breaker toward the higher band
     when you're already unsure, not as an automatic bump — the one calibration pair testing this directly (#4 vs #12)
     was confirmed as a coin-flip, not a rule.

4. **A verification/iteration loop adds a full band on its own**, independent of danger. Writing something and then
   having to sync-and-observe what actually happens (a NetworkPolicy, an untested DR runbook that needs a test path
   found) costs more than writing the same thing where the outcome is already known (#24 vs #23, #28).
5. **Never adjust effort for urgency.** If priority pulls you toward inflating or shrinking the effort rating, that's
   the tell you're conflating the two axes — stop and re-derive effort from steps 1-4 alone.
6. **Rate against actual current reality, not the abstract worst case.** A scenario's implied blast radius can be void
   in context — e.g. "breaks every collaborator's clone" doesn't apply to a solo-maintainer repo (#10). Check who/what
   is really exposed before applying step 3.

## Priority — `priority::low` through `priority::critical`

1. **No stated reason → `low`, by default — regardless of how dangerous the underlying system is.** This is the single
   sharpest pattern in the calibration data: a catastrophic-blast-radius secrets migration with no rationale (#19) and a
   dangerous, unexplained DNS resolver change (#12) both landed `low`. Effort captures the danger; priority requires a
   reason to act. Pure refactor/cleanup/tech-debt with no concrete payoff defaults `low` too (#14, #18, #30). If the
   same change _did_ have a stated reason (a feature that needs it), it moves to `medium`/`high` — see #21's explicit
   callout.
2. **Something is actually broken, right now, and you depend on it → at least `high`, `critical` if it's something you
   personally rely on today.** Not hypothetical, not "could fail eventually" — currently failing. The same bug on
   something nobody uses lands `low`, with the right move usually being "ticket its removal" rather than a fix (#33 vs
   #34; #37, cert renewal already broken, trending toward failure, `high`).
3. **Security scales multiplicatively with exposure, not additively.** A CVE alone → `medium` (#15). The identical CVE
   on something internet-facing or otherwise on the critical path → `critical`, not "medium plus a bit" (#16, #38). An
   active security _gap_ with nothing exploiting it yet (a missing NetworkPolicy) → `high` (#28).
4. **Expiry / time-to-failure follows an explicit curve** — reusable for any cert, token, or license, not just the root
   CA it was calibrated on (#26): more than ~30 days out → `medium`; ~15 days out → `high`; under 7 days or already
   expired → `critical`.
5. **Dependency-bump priority has three tiers, but the "routine" tier is not a flat floor** (#35, confirmed against
   #39): driven by a feature you actually need → `high`. Driven by a disclosed CVE → `critical`. Routine, no direct
   benefit → floor scales with how critical the thing being bumped is — `low` for a leaf/dev-tooling dependency,
   `medium` for a core secret-store or cluster-runtime component even with no CVE and no feature need.
6. **A "should-have" that recurs and annoys but never fully blocks → `medium`.** No OIDC on ArgoCD but the admin account
   still works; an auth token TTL that's merely inconvenient (#4, #8).
7. **A cosmetic bug jumps `low` → `medium` specifically when it's visibly breaking things for real people other than
   you** (family, not just yourself) — visibility to you alone isn't enough (#3).
8. **DR documentation is a category-level `high`**, whether the underlying procedure is rehearsed or has never been
   exercised. The untested case gets an effort bump (find a way to test it, or add an explicit "not validated" callout)
   instead of a priority bump (#23, #24).

## Board status: Triage vs. Backlog

The Arcane HQ project board (owner `chezmoidotsh`, project number `1`) uses its `Status` field as the triage queue
itself, not just a label mirror:

- **`Triage`** = not yet triaged. No `size::*`/`priority::*` set (or not trusted). This is the pool this skill reads
  from.
- **`Backlog`** = triaged and ready to pick up. Both `size::*` and `priority::*` are set. Nothing else changes — this is
  not "started" (that's `In Progress`) and not "can't proceed" (that's `Blocked`).

Moving an item from `Triage` to `Backlog` is part of finishing a triage pass, not a separate step — an issue with labels
applied but still sitting in `Triage` is a half-done triage.

`gh project` commands need the `project` OAuth scope, which `GITHUB_TOKEN`/`GH_TOKEN` env vars typically don't carry
even when `gh issue`/`gh api` work fine — check `gh auth status` for a second, unused login with `project` in its
scopes, and if one exists, prefix every `gh project`/project-board `gh api graphql` call with
`env -u GITHUB_TOKEN -u GH_TOKEN` so `gh` falls back to it instead of erroring on missing scopes.

### `gh project item-list` is GraphQL-expensive — don't hammer it

`gh project item-list --format json` (no `--field` filter) fetches every field on every item and is heavy enough that a
burst of calls can exhaust the GraphQL quota within a single triage pass — and **a rejected call still spends quota**,
so retrying it in a tight loop drains the budget further instead of recovering. If you hit
`GraphQL: API rate limit exceeded`:

1. Stop retrying immediately — check `gh api rate_limit --jq '.resources.graphql'` once.
2. If `remaining` is near 0, wait for the `reset` timestamp (no calls in the meantime) rather than polling with the same
   expensive query.
3. Once healthy again, prefer `gh project item-list 1 --owner chezmoidotsh --field "<Field Name>" -L 100` (table output,
   not `--format json` — the two are mutually exclusive) for reads that only need one or two field values; it's far
   cheaper than a full JSON dump.
4. When mutating many items with `gh project item-edit`, put a couple of seconds between calls rather than firing them
   back to back.

## AKN Project field

The board also carries an `AKN Project` single-select field (`amiya.akn`, `chezmoi.sh`, `hass`, `kazimierz.akn`,
`lungmen.akn`, `rhodes.akn`, `shodan.akn`, `Global`) — set it alongside `size::*`/`priority::*` as part of the same
triage pass, using the issue body (not just the title):

- **One cluster clearly is the subject** (a `projects/<cluster>/` file path is the actual change location, or the title
  names it) → that cluster, even if other clusters get an incidental mention (used-by context, "found while testing on
  X").
- **Catalog-level or reusable work** (a Pulumi provider, a shared component, a skill, repo-wide tooling) → `Global`,
  regardless of which cluster happens to consume it first.
- **Genuinely spans 3+ clusters as the actual scope of the work** (a fleet-wide template, a cross-cluster
  standardization pass) → `Global`.
- A cluster mentioned only as prior art, an example, or where a bug was _found_ (not where the fix lands) doesn't count
  toward picking that cluster.

```sh
env -u GITHUB_TOKEN -u GH_TOKEN gh project item-edit 1 --owner chezmoidotsh \
  --url "https://github.com/chezmoidotsh/arcane/issues/<number>" --field "AKN Project" --value "lungmen.akn"
```

## Quick reference

| Question                                                                  | Answer →                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Diff has zero apply step (docs/rename/comment only)?                      | Effort floors at `XS`                                                                       |
| Diff gets deployed/applied at all, however small?                         | Effort floors at `S`                                                                        |
| Impact/scope genuinely unknown to you?                                    | Effort → `XL`                                                                               |
| Broad blast radius, but a fallback or trusted/automated mechanism exists? | Discount effort one band+                                                                   |
| Requires a build-verify-adjust loop before you know it works?             | Effort +1 band                                                                              |
| No stated reason this needs doing?                                        | Priority → `low`, regardless of effort                                                      |
| Actively broken and you rely on it today?                                 | Priority → `critical`                                                                       |
| Actively broken, nobody uses it?                                          | Priority → `low` (consider closing/removing instead)                                        |
| CVE, not internet-facing/critical-path?                                   | Priority → `medium`                                                                         |
| CVE, internet-facing or critical-path?                                    | Priority → `critical`                                                                       |
| Cert/token/license expiring?                                              | >30d `medium` · ~15d `high` · <7d or expired `critical`                                     |
| Dependency bump — why?                                                    | Feature need `high` · CVE `critical` · routine → scales with what's bumped (`low`–`medium`) |

## Workflow

1. **Gather candidates from the board, not from labels.** The `Triage` status is the authoritative untriaged queue (see
   "Board status" above):
   ```sh
   env -u GITHUB_TOKEN -u GH_TOKEN gh project item-list 1 --owner chezmoidotsh --format json --limit 300 \
     --jq '.items[] | select(.status == "Triage" and .content.type == "Issue")'
   ```
   Or triage a specific set the user names.
2. **Read each issue's body**, not just the title — the effort/priority signal (blast radius, testability, whether a
   reason is stated, whether something's actually broken) almost always lives in the Context section, not the title.
3. **Apply the two decision procedures independently, and derive the `AKN Project` value.** Draft `size::*` and
   `priority::*` with a one-line rationale for each, in the same terms as `references/calibration-examples.md` ("blast
   radius is X, discounted/not discounted because Y" / "reason stated: Z" or "no reason stated") — then decide
   `AKN Project` per the rules above (one dominant cluster, or `Global`).
4. **Present a table before touching anything** — number, title, current labels, proposed `size::*`, proposed
   `priority::*`, proposed `AKN Project`, one-line rationale each. Bulk-editing labels and board fields on real backlog
   issues is a visible, somewhat tedious-to-reverse action; always get explicit confirmation before applying, same as
   any other bulk mutation on shared state.
5. **On confirmation, apply the labels and move the board fields together** — a triaged issue never sits in `Triage`
   with labels already on it, and never leaves `AKN Project` unset:
   ```sh
   gh issue edit <number> --repo chezmoidotsh/arcane --add-label "size::M" --add-label "priority::high"
   env -u GITHUB_TOKEN -u GH_TOKEN gh project item-edit 1 --owner chezmoidotsh \
     --url "https://github.com/chezmoidotsh/arcane/issues/<number>" --field "Status" --value "Backlog"
   env -u GITHUB_TOKEN -u GH_TOKEN gh project item-edit 1 --owner chezmoidotsh \
     --url "https://github.com/chezmoidotsh/arcane/issues/<number>" --field "AKN Project" --value "lungmen.akn"
   ```
   When applying to many items in a batch, space these calls out (see the GraphQL cost note above) and verify the result
   afterward with the lightweight `--field` table read — don't trust a batch's echoed output alone; a shell
   quoting/splitting bug can silently no-op a `gh issue edit` call with multiple `--add-label`/`--remove-label` flags,
   so re-check actual label state before moving on.
6. **When a case doesn't cleanly match a rule**, don't force it — check `references/calibration-examples.md` for the
   nearest precedent, and if none fits, ask the user rather than guessing. Add the resolved case back to that file so
   the next triage pass has one more data point.

## References

- `.github/labels.yaml` — canonical label list and the time-band anchors for `size::*`
- `references/calibration-examples.md` — full 40-scenario calibration data these rules were derived from, plus the two
  confirmed soft-vs-hard-rule notes (#4/#12, #35/#39)
- `.agents/skills/create-issue/SKILL.md` — issue title/body/label conventions for filing new issues; this skill covers
  sizing specifically, for both new and existing issues
