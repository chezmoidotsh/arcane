---
name: sop-authoring
description: >
  Writes and updates technical procedures (Standard Operating Procedures / runbooks) in docs/procedures/. Use it to turn
  a repeatable operational task — a cluster bring-up, an OS/Kubernetes upgrade, an incident recovery, a network
  migration, adding a security control — into a step-by-step, copy-pasteable procedure ("write a procedure for X",
  "document these recovery steps", "turn this into a runbook", "add an SOP", "this should be a procedure"). Also use it
  right after successfully performing a manual multi-step operation worth repeating, even if a procedure wasn't
  explicitly requested — this is how tribal knowledge in this repo gets captured before it's lost.
---

# Standard Operating Procedure (SOP) Authoring Skill

## Why we write procedures

A procedure is not documentation for its own sake — it is the thing that lets a repeatable operational task be executed
correctly by someone (human or agent) who did not do it the first time, without needing the original operator present.
The value is concentrated in two places: **exact commands** (not paraphrased descriptions of what to click) and
**expected output after each step** (so the executor can self-verify before moving forward instead of discovering a
failure three steps later).

This repo's procedures are read under pressure as often as not — a WAL disk full at 2am, a cluster stuck mid-upgrade —
so the bar is "can this be followed literally, in order, by someone who is stressed and unfamiliar with this specific
incident." That is a higher bar than "can this be understood," which is the bar a design document has to clear.

Procedures are the operational counterpart to ADRs: an ADR (`docs/decisions/`, see `.agents/skills/adr-authoring/`)
records _why_ a decision was made; a procedure records _how_ to execute the recurring operational task that decision
created. If you find yourself justifying a tool choice or an architectural trade-off while writing a procedure, that
content belongs in an ADR instead — link to it and move on.

## When NOT to write a procedure

- **One-off tasks with no expectation of repetition** — if this will only ever happen once, a PR description or a
  session note in `.agents/sessions/` is enough.
- **A decision, not an operation** — "why did we pick X" belongs in an ADR (`docs/decisions/`), not here. A procedure
  documents execution of an already-decided approach.
- **Already fully covered by a script or skill** — if `scripts/cnpg:db:migrate` or an existing skill already
  encapsulates the operation end-to-end with no manual steps left, a new procedure would just restate the script's
  `--help` output. Point to the script instead.
- **The process is still unstable** — if you expect the steps to change significantly on the next run (an upgrade path
  not yet proven twice), write it up informally first and let it stabilize before promoting it to `docs/procedures/`.

When in doubt, draft it and let the user decide whether it earns a file — the cost of a short draft is much lower than
the cost of a stale procedure nobody trusts.

## Workflow

### Creating a new procedure

1. **Explore:** Scan `docs/procedures/<category>/` for the relevant category (or the closest one) to understand:
   - The highest existing sequence number for today's date under the matching ID prefix (see "Naming and location"
     below) — increment it, never reuse or fill gaps.
   - Whether a similar procedure already exists that this one should extend, supersede, or cross-reference instead of
     duplicating.
   - The writing style and step granularity of recent procedures in that category, to match tone and depth.

2. **Gather:** Extract from the user's description (or from the conversation history, if this procedure is capturing
   something just performed) what's available, then ask only for what's genuinely missing:
   - The exact process name/title and which cluster(s) or systems it applies to.
   - The precise commands used at each step — do not paraphrase or invent a plausible-looking command; if a step is
     fuzzy, ask.
   - What the expected output or success signal was at each step, and what tools/access are required upfront.
   - Any failure modes hit along the way (these become "Quick verifications", "Rollback", or "Known issues").
   - Whether this procedure is the resolution to a specific incident in `docs/incidents/` — if so, it needs a
     cross-reference both ways (see "Registering the procedure").

   Use `AskUserQuestion` for anything that blocks writing a correct procedure. Prefer asking over inventing a
   plausible-sounding step — an invented step in a runbook that gets followed literally during an incident is worse than
   a gap the user has to fill in.

3. **Draft:** Use the template at `references/procedure-template.md`. Read it, copy its structure, then strip the
   `<!-- PROCEDURE TEMPLATE … -->` HTML comment, every `>` blockquote authoring instruction, and the `[Optional]` labels
   on whichever optional sections you keep — see "Writing standards" below for which sections are worth including for a
   given procedure's size and complexity.

4. **Verify with fresh eyes:** Read the draft back against "Anti-patterns to avoid" below — does every step have an
   expected-output line? Are placeholders used consistently (never a hardcoded example value in the generic steps)?
   Could someone unfamiliar with this exact incident follow it end to end?

5. **Register:** Save the file at the correct path, then update `docs/procedures/README.md` (see "Registering the
   procedure"). If this procedure resolves a documented incident, add the cross-reference in both directions.

### Updating an existing procedure

When a procedure needs a correction, a step revised after a re-run surfaced something new, or an added edge case:

1. Read the full procedure before touching it — a partial read risks a change that contradicts an earlier step.
2. Make the minimal targeted update:
   - A step's command changed (tool upgrade, corrected typo, better approach discovered) → update the step in place.
   - A new failure mode was hit → add it to "Quick verifications", "Known issues", or "Rollback" as appropriate.
   - The procedure was re-run successfully on a new concrete case → consider whether the "Complete Example" section
     should be refreshed to the more recent case, or left as-is if the original is still representative.
3. Always add a `History` entry — every material change gets a dated log line, mirroring an ADR's `Changelog`.
4. If the change is significant, show the user a before/after of the affected steps.

## Writing standards

### Naming and location

Files live in `docs/procedures/<category>/` and are named `<ID>.<kebab-slug>.md`, where `<ID>` is
`<PREFIX>-<YYYYMMDD>-<NN>`:

| Prefix | Category directory | Used for                                                                       |
| ------ | ------------------ | ------------------------------------------------------------------------------ |
| `SEC`  | `security/`        | Authentication, authorization, and network-policy procedures                   |
| `DB`   | `databases/`       | CloudNative-PG / MongoDB operational procedures (recovery, migration)          |
| `OMNI` | `omni/`            | Omni-managed Talos cluster bring-up and template maintenance                   |
| `INF`  | `infrastructure/`  | Infrastructure lifecycle: OS/Kubernetes upgrades, SDN/network provisioning     |
| `MIGR` | `infrastructure/`  | Node or workload migrations between configurations (VLANs, machine classes, …) |

If a new procedure doesn't fit any existing category, introduce a new short, uppercase prefix and a matching category
directory — follow the same pattern rather than overloading an unrelated one.

`YYYYMMDD` is the date the procedure was authored (today's date for a new one). `NN` is a zero-padded two-digit
sequence, incremented per prefix+date pair — check existing files under the category directory for the current max and
increment from there; never reuse or backfill a number.

The heading at the top of the file is `## Procedure <ID>: <Title>` (level 2 — this is the convention across every
existing procedure except the largest end-to-end bring-up, which is the one file worth reading as a model for scale but
not for heading level).

### Section structure

The template (`references/procedure-template.md`) lays out the full skeleton. Not every section belongs in every
procedure — match the set to the procedure's actual complexity:

- **Always include:** the opening paragraph(s), Prerequisites, Required inputs, the numbered Steps, Quick verifications,
  References, History.
- **Include when relevant:** Technical framework and conventions (only if the procedure enforces naming/path rules a
  reader must know upfront), Complete Example (strongly recommended whenever the steps use placeholders — this is what
  makes a generic procedure trustworthy), Rollback (whenever a step is not naturally reversible), Known issues (only for
  complex, multi-stage procedures where the same edge cases recur across runs).
- **Reserve for genuinely large procedures:** Overview, Contextual information, Validation checklist — these appear in
  the Omni cluster bring-up procedure because it spans provisioning through GitOps registration across multiple systems.
  Adding them to a five-step procedure is padding, not rigor.

### Step-writing rules

- **One command block per logical action**, not a paragraph describing what to click. The audience for this repo's
  procedures is an operator or agent with a terminal, not someone reading a printed manual — write for that.
- **Annotate expected output inline** with a `# → ...` comment after the command, or a short prose line right after the
  block. This is the single most load-bearing convention in this repo's procedures: it lets the executor confirm success
  before proceeding, instead of finding out three steps later that something silently failed.
- **Use ALL_CAPS placeholder variables** (`APP_DIR`, `CLUSTER`, `HOSTNAME`) declared in "Required inputs" and reused
  throughout, with a `# To adapt` or `# Adapt according to environment` comment on lines the reader must edit. Never
  hardcode a real cluster or app name into the generic steps — that value belongs only in the "Complete Example"
  section.
- **State the "why" for non-obvious steps.** If a step exists because of a specific constraint (see SEC-20250808-00's
  note on why only the `openid` scope is requested by default, for least privilege), say so inline — a reader who
  understands why is far less likely to "simplify" the step incorrectly on the next run.
- **Never invent a step.** Only document what was actually performed and confirmed. If a step is uncertain, ask the user
  rather than filling the gap with something plausible-looking.
- **Use GitHub callout syntax** for asides, consistent with the rest of the repo's markdown:

  ```markdown
  > [!NOTE] Informational detail worth knowing.

  > [!TIP] A shortcut or optimization, not required for correctness.

  > [!IMPORTANT] A constraint that breaks a later step if missed.

  > [!CAUTION] Something that must be done carefully, or a data-loss risk.

  > [!WARNING] Deprecated content, or a risk discovered during a real run.
  ```

- **History, not a changelog field.** Every procedure ends with a `## History` section: a dated bullet log of what
  changed in the procedure itself (not in the system it operates on) — `- _YYYY-MM-DD_: Description`.

### Registering the procedure

Writing the file is not the last step. After saving it:

1. Add an entry to `docs/procedures/README.md` under the matching category heading, in the same bullet format as the
   existing entries: bold link with ID and title, followed by a one- or two-sentence summary of scope.
2. If this procedure is the resolution to a documented incident, add the procedure's path to that incident's
   `procedures:` frontmatter field in `docs/incidents/<file>.md`, and reference the incident in the procedure's
   `References` section — the link must work in both directions (see how DB-20260530-00 and its originating incident
   cross-reference each other, and how the `cnpg-troubleshoot` skill routes between the two).
3. If an existing troubleshooting skill (e.g. `cnpg-troubleshoot`) maintains a "known error patterns" routing table that
   this procedure now answers, ask the user whether that table should be updated too — don't update another skill's file
   without confirming.

## Anti-patterns to avoid

- **Prose masquerading as steps** — a narrative paragraph where a numbered command block belongs. An operator mid
  incident should never have to parse a sentence to extract the command they need to run.
- **Missing expected output** — a step with no way to verify success before moving on. This is the most common way a
  procedure silently rots: the command still runs, but nothing tells the reader whether it worked.
- **Hardcoded example values in the generic steps** — real cluster/app names baked into "Step 3" instead of the declared
  placeholders. This is what makes a procedure unusable for the next real case; save concrete values for the "Complete
  Example" section only.
- **No rollback for an irreversible step** — a PVC resize, an S3 object move, a cluster reset, or a DNS cutover with no
  documented way back. If the step can't be undone, at least document that explicitly instead of leaving it implicit.
- **Silent scope creep into a decision** — a procedure that also argues for a tool choice or an architectural trade-off
  instead of linking to the ADR that already settled it. If you notice yourself justifying "why we do it this way" at
  length, that paragraph likely belongs in `docs/decisions/`, not here.
- **Stale prerequisites** — tool or access requirements left unrevised after a procedure is updated, so the reader hits
  a missing dependency the procedure no longer mentions.

## Examples

**Good — step with expected output and a placeholder:**

````markdown
## Step 2 — Check WAL PVC usage and expand

​```bash

# Check PVC sizes and usage

kubectl get pvc -n ${NAMESPACE} | grep ${CLUSTER_NAME}

# → look for <CLUSTER_NAME>-1-wal and <CLUSTER_NAME>-2-wal at 100%

# Expand both WAL PVCs (double the current size; adjust if needed)

kubectl patch pvc ${CLUSTER_NAME}-1-wal -n ${NAMESPACE} -p '{"spec":{"resources":{"requests":{"storage":"20Gi"}}}}' ​```
````

**Bad — same step without a way to self-verify:**

```markdown
## Step 2 — Check WAL PVC usage and expand

Check the PVC usage and expand it if needed using kubectl patch.
```

**Good — concrete Complete Example section grounding the generic steps:**

```markdown
## Complete Example: `home-dashboard` Application

### 1. Generate the OIDC client JSON

​`bash APP_DIR="projects/amiya.akn/src/apps/home-dashboard" CLUSTER="amiya.akn" APP="home-dashboard" HOSTNAME="home.chezmoi.sh" ​`
```

## References

- Existing procedures: `docs/procedures/` — read the category-relevant ones before drafting, for style, numbering, and
  cross-referencing. `SEC-20250808-00` and `DB-20260530-00` are strong models for a medium-sized procedure;
  `OMNI-20260721-00` is the model for a large, multi-system one.
- `docs/procedures/README.md` — the index every new procedure must be added to.
- `docs/incidents/README.md` and `.agents/skills/cnpg-troubleshoot/SKILL.md` — how incidents and procedures
  cross-reference each other, and how a troubleshooting skill routes from a live error to a procedure.
- `.agents/skills/adr-authoring/SKILL.md` — the sibling skill for decisions; a procedure documents the "how" of a choice
  an ADR already argued for.
- `.agents/skills/postmortem/SKILL.md` — the "From Lesson to Control" table classifies a "Runbook step" as one of the
  concrete artifacts a post-mortem's systemic lessons should produce; that artifact is a procedure written with this
  skill.

## Template Versioning

The procedure template (`references/procedure-template.md`) is versioned in its own HTML comment so structural changes
to the template are tracked independently of any single procedure. Unlike ADRs, procedures carry no per-file version
frontmatter — the template's provenance lives in this changelog, and each procedure's own provenance lives in its
`History` section.

- **Scheme:** semantic-ish `MAJOR.MINOR.PATCH`. `MAJOR` — a required section added/removed/renamed in a way that makes
  old procedures look structurally wrong. `MINOR` — a new optional section or non-breaking authoring guidance. `PATCH` —
  wording fixes in the template's instructions.
- **When you change the template**, bump the version in the `<!-- PROCEDURE TEMPLATE vX.Y.Z -->` comment and add an
  entry below. Existing procedures are not back-migrated.

### Template changelog

- **1.0.0**: Initial template, extracted from the recurring structure across `docs/procedures/security/`, `databases/`,
  `omni/`, and `infrastructure/` into this skill as the single source of truth.

## Procedure Template

The authoritative template is at `references/procedure-template.md` (relative to this skill). Read that file and copy
its content verbatim as the starting point for a new procedure, then, before saving: delete the
`<!-- PROCEDURE TEMPLATE … -->` HTML comment, remove all `>` blockquote authoring instructions, and strip the
`[Optional]` labels from the headings of the optional sections you keep — dropping any optional section you don't use.
