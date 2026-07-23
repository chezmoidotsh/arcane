<!--
  PROCEDURE TEMPLATE v1.0.0 — see the "Template Versioning" section of
  .agents/skills/sop-authoring/SKILL.md for the changelog and the rules that govern
  this file. Delete this HTML comment when authoring. Unlike ADRs, procedures carry
  no version frontmatter — provenance lives in git history and the History section.
-->

## Procedure {PREFIX}-{YYYYMMDD}-{NN}: {Title}

> Opening paragraph(s), not bullets: what this procedure does, which components/stack it touches, and why it exists as a
> standalone, reproducible procedure rather than tribal knowledge. Two or three sentences is usually enough — see
> SEC-20250808-00 or INF-20260525-00 for the right length.

{Write the introduction here...}

### Technical framework and conventions [Optional]

> Include this section when the procedure enforces naming rules, path conventions, or a specific technical stack the
> reader must know before following the steps (SEC-20250808-00 is a strong example: Vault path convention,
> SecurityPolicy file naming, Authelia ordering rule). Omit it when the procedure is a straightforward sequence with no
> such conventions (MIGR-20260628-00 skips it).

- **{Convention name}**: {The rule, stated precisely, and why it matters — reviews, conflicts, or reproducibility it
  protects.}

### Prerequisites

> List every tool that must already be installed/configured and every access/permission the reader needs. Be exhaustive
> — an operator mid-incident should never discover a missing prerequisite three steps in.

Before starting, ensure the following tools are installed and configured: `{tool1}`, `{tool2}`, ...

You must also have:

- {Access requirement 1 — e.g. "kubectl access with permissions to manage resources in the target namespace"}
- {Access requirement 2}

### Required inputs

> Name the variables the reader must define before running the steps — these become the placeholders used throughout
> (e.g. `APP_DIR`, `CLUSTER`, `HOSTNAME`). Every step below should reference these variables instead of repeating raw
> values, so the procedure stays copy-pasteable across invocations.

- `{VAR_1}`: {What it is, with an example value, e.g. `projects/<cluster>/src/apps/<app>`}
- `{VAR_2}`: {What it is, with an example value}

---

## Step 1 — {Action title}

{One short paragraph of context if the step needs it: why this step exists, what state it changes. Skip this if the
command is self-explanatory.}

```bash
# {Comment explaining what the command does, not just restating it}
{command using the ${VAR_1} placeholders declared above}
# → {expected output, or how to read the output, so the reader can self-verify before moving on}
```

> [!NOTE] {Anything the reader needs that doesn't fit inline — a design choice made in this step, a non-obvious caveat.}

## Step 2 — {Action title}

...

## Step N — {Action title}

...

> [!IMPORTANT] {Use for a constraint that, if missed, breaks a later step or causes data loss.}

---

## Complete Example: {Concrete real case} [Optional — recommended when the steps above use placeholders]

> Walk through the steps again with one real, concrete case (an actual cluster/app/incident this procedure was run
> against), using real values instead of placeholders. This is what makes the procedure trustworthy and directly
> copy-pasteable for the next real case, instead of something the reader has to mentally re-derive. Omit only when the
> procedure above is already fully concrete with no placeholders to resolve.

### {Sub-step title}

```bash
{Same commands as above, with real values substituted}
```

---

## Quick verifications

> A compact "is this actually done" checklist, distinct from the per-step expected output above. Useful for an operator
> returning later to confirm the fix held, or wanting a fast recap without rereading every step.

- **{Check name}**: `{command}` — {what a healthy result looks like}
- **{Check name}**: `{command}` — {what a healthy result looks like}

## Rollback [Optional — include whenever a step is not naturally reversible]

> PVC resizes, S3 object moves, cluster resets, DNS cutovers, and similar irreversible-by-default operations need an
> explicit escape hatch here. Give the exact reversal commands, not just "restore from backup".

```bash
{Exact commands to undo the procedure's effects}
```

## Known issues [Optional — for complex, multi-stage procedures]

> Include when the same edge cases keep recurring across runs of this procedure (OMNI-20260721-00 is the model: CNI
> auto-apply silently failing, a connectivity blip during Cilium takeover, machine classes erased on reset). Each entry
> names what happens, why, and the workaround — skip this section entirely for short, single-purpose procedures.

### {Issue title}

{What happens, the root cause, and the workaround.}

## References

- {Official docs, RFCs, or vendor guides the steps rely on}
- {Related ADR, if a design decision this procedure implements is documented elsewhere}
- {The incident in `docs/incidents/` that triggered this procedure, if any}

## History

- _{YYYY-MM-DD}_: {What changed in this procedure and why — not what changed in the system it operates on}
