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

Procedures are the operational counterpart to ADRs: an ADR (`docs/decisions/`, see
`.agents/skills/documentation-writer/references/adr.md`) records _why_ a decision was made; a procedure records _how_ to
execute the recurring operational task that decision created. If you find yourself justifying a tool choice or an
architectural trade-off while writing a procedure, that content belongs in an ADR instead — link to it and move on.

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
   - Any failure modes hit along the way (these become "Vérifications rapides", "Retour arrière", or "Problèmes
     connus").
   - Whether this procedure is the resolution to a specific incident in `docs/incidents/` — if so, it needs a
     cross-reference both ways (see "Registering the procedure").

   Use `AskUserQuestion` for anything that blocks writing a correct procedure. Prefer asking over inventing a
   plausible-sounding step — an invented step in a runbook that gets followed literally during an incident is worse than
   a gap the user has to fill in.

3. **Draft:** Use the template at `references/procedure-template.md`. It is written in French: the page is too, with
   accents, following the "Language" section of `style-guide.md`. Read it, copy its structure, then strip the
   `<!-- GABARIT DE PROCÉDURE … -->` HTML comment, every `>` blockquote authoring instruction, and the `[Facultatif …]`
   labels on whichever optional sections you keep — see "Writing standards" below for which sections are worth including
   for a given procedure's size and complexity.

4. **Verify with fresh eyes:** Read the draft back against "Anti-patterns to avoid" below — does every step have an
   expected-output line? Are placeholders used consistently (never a hardcoded example value in the generic steps)?
   Could someone unfamiliar with this exact incident follow it end to end?

5. **Register:** Save the file at the correct path, add it to `docs/_Sidebar.md` (every page must be reachable from it),
   and run `scripts/wiki:lint`. If this procedure resolves a documented incident, add the cross-reference in both
   directions (see "Registering the procedure").

### Updating an existing procedure

When a procedure needs a correction, a step revised after a re-run surfaced something new, or an added edge case:

1. Read the full procedure before touching it — a partial read risks a change that contradicts an earlier step.
2. Make the minimal targeted update:
   - A step's command changed (tool upgrade, corrected typo, better approach discovered) → update the step in place.
   - A new failure mode was hit → add it to "Vérifications rapides", "Problèmes connus", or "Retour arrière" as
     appropriate.
   - The procedure was re-run successfully on a new concrete case → consider whether the "Exemple complet" section
     should be refreshed to the more recent case, or left as-is if the original is still representative.
3. Always add an `Historique` entry — every material change gets a dated log line, mirroring an ADR's `Changelog`.
4. If the change is significant, show the user a before/after of the affected steps.

## Writing standards

### Naming and location

The page is written in French. Files live in `docs/procedures/<category>/` and are named `<ID>-<Verbes-en-Francais>.md`
(Title-Case with hyphens, function words in lowercase, ASCII only, no accents, no dots, no `Procedure-` prefix since the
directory says it — e.g. `DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md`), where `<ID>` is
`<PREFIX>-<YYYYMMDD>-<NN>`. The identifier never changes, only the verb phrase is French:

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

The single `#` heading at the top of the file is `# <ID> <Titre>`: it matches the file name (hyphens become spaces, case
and accents are ignored). Sections use `##` and `###` only. Links to other pages are relative and point to the `.md`
file.

### Section structure

The template (`references/procedure-template.md`) lays out the full skeleton, in this order. Not every section belongs
in every procedure — match the set to the procedure's actual complexity:

- **Always include:** the opening paragraph(s), `## Prérequis`, `## Entrées requises`, the numbered
  `## Étape N — <Titre>` sections, `## Vérifications rapides`, `## Historique`, and `## Pour aller plus loin`.
- **Include when relevant:** `## Cadre technique et conventions` (only if the procedure enforces naming/path rules a
  reader must know upfront), `## Exemple complet : <cas>` (strongly recommended whenever the steps use placeholders —
  this is what makes a generic procedure trustworthy), `## Retour arrière` (whenever a step is not naturally
  reversible), `## Problèmes connus` (only for complex, multi-stage procedures where the same edge cases recur across
  runs).
- **Reserve for genuinely large procedures:** an overview, contextual information, a validation checklist — these appear
  in the Omni cluster bring-up procedure because it spans provisioning through GitOps registration across multiple
  systems. Adding them to a five-step procedure is padding, not rigor.
- **`## Pour aller plus loin` is always the last `##` section** (enforced by `scripts/wiki:lint`), so `## Historique`
  comes right before it. Two to five relative `.md` links, each with a one-line lead; official docs, the related ADR and
  the originating incident go there.

### Step-writing rules

- **One command block per logical action**, not a paragraph describing what to click. The audience for this repo's
  procedures is an operator or agent with a terminal, not someone reading a printed manual — write for that.
- **Annotate expected output inline** with a `# → ...` comment after the command, or a short prose line right after the
  block. This is the single most load-bearing convention in this repo's procedures: it lets the executor confirm success
  before proceeding, instead of finding out three steps later that something silently failed.
- **Use ALL_CAPS placeholder variables** (`APP_DIR`, `CLUSTER`, `HOSTNAME`) declared in "Entrées requises" and reused
  throughout, with a `# À adapter` comment on lines the reader must edit. Never hardcode a real cluster or app name into
  the generic steps — that value belongs only in the "Exemple complet" section.
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

- **History, not a changelog field.** Every procedure has a `## Historique` section, placed just before
  `## Pour aller plus loin`: a dated bullet log of what changed in the procedure itself (not in the system it operates
  on) — `- _AAAA-MM-JJ_ : Description`.

### Registering the procedure

Writing the file is not the last step. After saving it:

1. Add the page to `docs/_Sidebar.md` under the matching heading — a page missing from the sidebar fails
   `scripts/wiki:lint`.
2. If this procedure is the resolution to a documented incident, add the procedure's path to that incident's
   `procedures:` frontmatter field in `docs/incidents/<file>.md`, and link the incident from the procedure's
   `## Pour aller plus loin` section — the link must work in both directions (see how DB-20260530-00 and its originating
   incident cross-reference each other, and how the `cnpg-troubleshoot` skill routes between the two).
3. If an existing troubleshooting skill (e.g. `cnpg-troubleshoot`) maintains a "known error patterns" routing table that
   this procedure now answers, ask the user whether that table should be updated too — don't update another skill's file
   without confirming.

## Anti-patterns to avoid

- **Prose masquerading as steps** — a narrative paragraph where a numbered command block belongs. An operator mid
  incident should never have to parse a sentence to extract the command they need to run.
- **Missing expected output** — a step with no way to verify success before moving on. This is the most common way a
  procedure silently rots: the command still runs, but nothing tells the reader whether it worked.
- **Hardcoded example values in the generic steps** — real cluster/app names baked into "Step 3" instead of the declared
  placeholders. This is what makes a procedure unusable for the next real case; save concrete values for the "Exemple
  complet" section only.
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
## Étape 2 — Vérifier l'usage des PVC WAL et les agrandir

​```bash

# Vérifier la taille et l'usage des PVC

kubectl get pvc -n ${NAMESPACE} | grep ${CLUSTER_NAME}

# → repérer <CLUSTER_NAME>-1-wal et <CLUSTER_NAME>-2-wal à 100 %

# Agrandir les deux PVC WAL (doubler la taille actuelle ; à adapter)

kubectl patch pvc ${CLUSTER_NAME}-1-wal -n ${NAMESPACE} -p '{"spec":{"resources":{"requests":{"storage":"20Gi"}}}}' ​```
````

**Bad — same step without a way to self-verify:**

```markdown
## Étape 2 — Vérifier l'usage des PVC WAL et les agrandir

Vérifier l'usage des PVC et les agrandir si besoin avec kubectl patch.
```

**Good — concrete "Exemple complet" section grounding the generic steps:**

```markdown
## Exemple complet : application `home-dashboard`

### 1. Générer le JSON du client OIDC

​`bash APP_DIR="projects/amiya.akn/src/apps/home-dashboard" CLUSTER="amiya.akn" APP="home-dashboard" HOSTNAME="home.chezmoi.sh" ​`
```

## References

- Existing procedures: `docs/procedures/` — read the category-relevant ones before drafting, for style, numbering, and
  cross-referencing. `SEC-20250808-00` and `DB-20260530-00` are strong models for a medium-sized procedure;
  `OMNI-20260721-00` is the model for a large, multi-system one.
- `docs/_Sidebar.md` — the navigation every new page must be added to.
- `.agents/skills/documentation-writer/references/style-guide.md` — language, naming and lint rules shared by every
  page.
- `docs/incidents/README.md` and `.agents/skills/cnpg-troubleshoot/SKILL.md` — how incidents and procedures
  cross-reference each other, and how a troubleshooting skill routes from a live error to a procedure.
- `.agents/skills/documentation-writer/references/adr.md` — the sibling skill for decisions; a procedure documents the
  "how" of a choice an ADR already argued for.
- `.agents/skills/documentation-writer/references/postmortem.md` — the "From Lesson to Control" table classifies a
  "Runbook step" as one of the concrete artifacts a post-mortem's systemic lessons should produce; that artifact is a
  procedure written with this skill.

## Template Versioning

The procedure template (`references/procedure-template.md`) is versioned in its own HTML comment so structural changes
to the template are tracked independently of any single procedure. Unlike ADRs, procedures carry no per-file version
frontmatter — the template's provenance lives in this changelog, and each procedure's own provenance lives in its
`Historique` section.

- **Scheme:** semantic-ish `MAJOR.MINOR.PATCH`. `MAJOR` — a required section added/removed/renamed in a way that makes
  old procedures look structurally wrong. `MINOR` — a new optional section or non-breaking authoring guidance. `PATCH` —
  wording fixes in the template's instructions.
- **When you change the template**, bump the version in the `<!-- GABARIT DE PROCÉDURE vX.Y.Z -->` comment and add an
  entry below. Existing procedures are not back-migrated.

### Template changelog

- **2.0.0**: Template translated to French; every section renamed accordingly (`Prérequis`, `Entrées requises`,
  `Étape N`, `Vérifications rapides`, …). `# Title` replaces the level-2 heading and matches the file name, `References`
  is merged into the new mandatory last section `## Pour aller plus loin`, and `Historique` moves just before it.

- **1.0.0**: Initial template, extracted from the recurring structure across `docs/procedures/security/`, `databases/`,
  `omni/`, and `infrastructure/` into this skill as the single source of truth.

## Procedure Template

The authoritative template is at `references/procedure-template.md` (relative to this skill). Read that file and copy
its content verbatim as the starting point for a new procedure, then, before saving: delete the
`<!-- GABARIT DE PROCÉDURE … -->` HTML comment, remove all `>` blockquote authoring instructions, and strip the
`[Facultatif …]` labels from the headings of the optional sections you keep — dropping any optional section you don't
use.
