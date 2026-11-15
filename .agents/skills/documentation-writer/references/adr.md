# Architecture Decision Record (ADR) Authoring Skill

## Why we write ADRs

An ADR is not documentation — it is institutional memory. Its purpose is to let a future reader (including the author,
six months later) understand _what_ was decided and _why this and not something else_. A reader who disagrees with the
decision should be able to learn from the ADR whether their objection was already considered.

An ADR does three things, in this order, and nothing else:

1. **It gives the context around the problem**: how things work today, what is broken or missing, why it surfaces now.
2. **It gives the answer**: the decision, or the vision when the decision is a change of direction rather than a tool
   choice. Stated plainly, before any justification.
3. **It explains why this answer and not another**: the reasoning that clinched it, the trade-offs accepted, and the
   alternatives that were _really_ on the table.

It is not a comparison grid. The earlier template forced a numbered list of options with a status each; in practice the
decision was already made and the options were invented afterwards to make it look like the outcome of a contest. That
is the "dummy alternative" anti-pattern built into the structure. From template 3.0.0, an alternative appears only if it
was genuinely considered, and it appears as part of the argument, not as a peer of the decision.

It is not a plan either. How to get there (migration steps, paths to update, commands) lives in a separate, living page
that the ADR links to: a migration under `docs/migrations/` (see `migration-template.md`), or a procedure or an issue
for smaller work. The ADR is a dated record; the plan changes every week.

## When NOT to write an ADR

Not every decision needs an ADR. Skip it for:

- **Reversible, low-cost decisions**: configuration tweaks, minor naming choices, tool version bumps that carry no
  architectural implications.
- **Decisions already captured elsewhere**: if the choice is fully explained in a GitHub issue, PR description, or an
  existing ADR, add a reference there instead of creating a new document.
- **Decisions in flux**: if the investigation is not complete and the chosen option may still change significantly, wait
  until the decision stabilizes.

When in doubt, write a short draft and let the user decide whether it deserves a file.

## Workflow

### Creating a new ADR

1. **Explore:** Scan `docs/decisions/` to understand:
   - The highest existing ADR number (increment by 1 for the new file — never fill gaps).
   - Which existing ADRs are related and should be referenced or are affected.
   - The writing style and depth of recent ADRs to match tone and quality.

2. **Gather:** Collect from the user what is needed to populate each section. Be specific:
   - What broke, what is missing, or what constraint emerged that triggered this decision?
   - What is the core **strategic question** this ADR answers?
   - What is the answer, in one or two sentences?
   - What clinched the choice? Which alternatives were _really_ considered, if any, and what ruled each out? Do not
     invent alternatives to fill the page: if the user never weighed another path, the ADR says why this answer fits the
     problem and stops there. If information is missing, ask targeted questions rather than inventing plausible answers.

3. **Research:** Where relevant, look up authoritative external references — official docs, RFCs, NIST guidelines,
   project-specific best practices — to anchor the reasoning in something a reader can follow up on independently. The
   existing ADRs set a high bar here.

4. **Draft:** Use `references/adr-template.md` (see "ADR Template" below). The ADR is written in French. Strip the
   template's authoring scaffolding (the `<!-- GABARIT D'ADR … -->` comment, every `>` blockquote block, and the
   `[Facultatif]` labels on any optional sections you keep), but keep the `template-version` frontmatter field — it
   records which template revision produced the ADR. Then read the draft with fresh eyes against "Anti-patterns to
   avoid" below: is every claim either validated or explicitly marked as expected? Is the core argument stated once, not
   four times? Does the title name the _same single_ decision as the strategic question?

5. **Cross-reference:** Link related ADRs in `## Pour aller plus loin` (relative `.md` links). Scan existing files to
   find candidates — the chain of decisions (001 → 002 → 003) in this repo is a model.

6. **Write:** Save the file and present it to the user for review.

### Updating an existing ADR

When the user wants to change status, record a pivot, or add a changelog entry:

1. Read the target ADR fully before touching it.
2. Make the minimal targeted update:
   - Status change → update `status` in frontmatter + add to `Évolution de la décision` if the decision itself changed,
     and add an `Historique des modifications` entry.
   - Implementation progress → it is tracked in the living page the ADR links to (guide, procedure, issue), not in the
     ADR. The ADR only changes when the work is done: `status: implemented`, `implementation-completed`, and an
     `Historique des modifications` entry.
   - Post-implementation deprecation → update `status`, add `> [!CAUTION]` callout on deprecated content, update `date`,
     add `Historique des modifications` entry.
3. Update `date` in frontmatter to today's date.
4. If the change is significant, show the user a before/after of the key sections.

## Writing standards

### Frontmatter

```yaml
---
status: "proposed" # proposed | accepted | implemented | rejected | deprecated | superseded by ADR-NNNN
date: YYYY-MM-DD # today's date; update whenever the ADR is materially revised
implementation-completed: YYYY-MM-DD # optional, add only once implemented
decision-makers: ["Alexandre"] # the human(s) who own this decision
assisted-by: ["claude-sonnet-4.6"] # AI models that contributed; format: <model-name>
informed: []
template-version: "3.0.0" # ADR template revision this file was created from
---
```

The keys and the `status` values stay in English: scripts and the ADR convention read them.

The `assisted-by` field records which AI models contributed to the analysis or drafting during this session. Use the
model identifier from the system prompt. `decision-makers` should always include the human responsible — in this repo,
that is "Alexandre" unless stated otherwise.

### Naming and location

Files live in `docs/decisions/`. Names are `ADR-NNN-Titre-En-Francais.md`: a 3-digit zero-padded number, then the French
title in `Title-Case-With-Hyphens` (ASCII, no accents), e.g. `ADR-010-Migrer-Vers-PostgreSQL.md`. The single `#` title
matches the file name: `# ADR-010 Migrer vers PostgreSQL`. Determine the next number by finding the highest existing
number and incrementing — do not fill sequence gaps.

The ADR is written in French (see the "Language" section of the [style guide](style-guide.md)). When an existing ADR is
migrated to this format, it keeps its number, its decision, its chronology and its frontmatter. Its `status` changes
only if the repository proves the change (code, manifests, a later ADR), and that change gets an
`Historique des modifications` entry.

### Section names

The sections of the template, in order. A `##` heading is never skipped or renamed; optional ones are dropped when
empty.

1. `## Contexte et problème` (Context and Problem Statement)
2. `## Hors périmètre` (Non-Goals, optional)
3. `## Décision` (the answer)
4. `## Pourquoi ce choix` (the rationale, with an optional `### Alternatives écartées`)
5. `## Conséquences` (optional, with `### Positives`, `### Négatives`, `### Neutres`)
6. `## Questions ouvertes` (optional, only while `proposed`)
7. `## Évolution de la décision` (Decision Evolution, optional)
8. `## Historique des modifications` (Changelog)
9. `## Pour aller plus loin` (references and related decisions, always last)

The sections below use these French names. ADRs written on template 2.0.0 or earlier keep their sections
(`Facteurs de décision`, `Options envisagées`, `Décision retenue`, `Détails de mise en œuvre et état`): they are not
back-migrated.

### Contexte et problème — the most important section

This section fails most often. A strong context does three things:

1. **Explains the current architecture** so a reader unfamiliar with the system understands the starting point.
2. **Identifies what is broken, limiting, or missing** — not just "we want to improve X" but "X causes Y failure mode in
   Z situation, and this has happened N times".
3. **States the strategic question** — one sentence that crystallizes what the ADR decides. Examples from this repo:
   "How do we implement a modern, centralized secret management solution that eliminates single points of failure…"
   (ADR-001), "How can we reduce resource overhead and operational complexity of PostgreSQL instances while maintaining
   security and performance…" (ADR-009).

The context is also where the status quo is dealt with. If it explains why the current state no longer holds, "keep
things as they are" does not need to come back later as an alternative.

### Décision — the answer, stated plainly

Say what is decided, in the present tense, before justifying anything. A reader who stops after this section knows the
answer. Two shapes are fine:

- **A choice**: "PostgreSQL instances are consolidated into two shared CloudNative-PG clusters."
- **A vision**: when the decision is a change of direction (how the repository is organised, how secrets are laid out),
  describe the target model in a few paragraphs: its principles and its rules, not its inventory.

Keep it short. The durable, detailed description of the result (full conventions, inventories, target trees) belongs in
a reference page that stays up to date; the steps to get there belong in a guide or a procedure. The ADR links to both
and does not repeat them. A diagram is welcome here when it shows the resulting architecture.

### Pourquoi ce choix — argue, don't just state

"We chose X because it is better" is not a rationale. Explain what the answer had to satisfy (the requirements and
constraints that actually weighed, not an exhaustive list), how it satisfies them, what trade-offs were accepted and why
they are acceptable given the context, and what would have to change for the answer to be different.

`### Alternatives écartées` is optional. Use it only for alternatives that were genuinely considered: something the user
hesitated over, tried, or that a reasonable reader would propose. Give each one a short paragraph: what it is, and the
specific reason it lost. No status labels, no numbering, no symmetric pros and cons. One real alternative is better than
three decorative ones, and zero is a legitimate number.

### Hors périmètre — say what you are NOT deciding

State explicitly what the ADR does _not_ decide. This is not padding — it is the cheapest way to prevent three failure
modes:

1. **A settled premise misread as an open question.** If a prior decision (a POC result, an earlier ADR) fixes part of
   the design, name it as a non-goal so a reader does not think this ADR reopens it.
2. **A tempting adjacent area silently excluded.** If the decision deliberately leaves something out (a system that
   stays manual, a capability not migrated), say so _and why_. Otherwise a future reader re-proposes exactly what you
   already rejected.
3. **A capability of the old approach knowingly dropped.** Naming it as a non-goal turns a silent regression into a
   documented, deliberate trade-off.

Put non-goals in their own section right after Context (the template has it). Do not bury them in a "Neutral"
consequence — a deliberate scope boundary deserves to be visible.

### Anti-patterns to avoid

These are the recurring ways ADRs go wrong. Named anti-patterns follow Olaf Zimmermann's
[ADR creation guide](https://ozimmer.ch/practices/2023/04/03/ADRCreation.html); the rest come from reviews in this repo.

- **Unsupported claim / pseudo-accuracy** — the most damaging, because it looks rigorous. Do not present a benefit as
  established when it was only asserted. If a POC _expected_ a smaller footprint but never measured it, write exactly
  that and keep it out of the load-bearing rationale. A driver the reader cannot verify is worse than no driver: it
  invites a rebuttal that collapses the whole argument. Distinguish _validated_ from _expected_ explicitly, and cite
  where each came from.
- **Fairy tale** — only pros, no cons; truisms as justification. The decision must say what it costs, in
  `Pourquoi ce choix` (trade-offs accepted) and in `Conséquences` (negatives).
- **Dummy alternative** — an alternative that exists only to be knocked down, written after the decision to make it look
  contested. This was the most common flaw of the ADRs of this repo. If the reasoning eliminates an alternative _the
  moment it is stated_, or if nobody ever considered it, leave it out. "Statu quo" is the usual offender: the context
  already explains why it fails.
- **Restating instead of arguing (repetition)** — the same argument appearing in Contexte et problème, every
  alternative, Pourquoi ce choix, and Conséquences reads as length without information. State the core argument _once_,
  sharply, in Pourquoi ce choix; elsewhere refer to it, don't re-derive it. Density of reasoning per line matters more
  than word count.
- **Mega-ADR / more than one decision** — one ADR decides one thing. If the title says one decision but the text quietly
  bundles several (tool choice _and_ execution model _and_ operational policy), split them or narrow the framing. The
  title and the strategic question must name the _same_ decision. A vision counts as one decision as long as its rules
  follow from the same idea.
- **Plan in disguise** — migration steps, lists of paths to update, commands, rollout status. They age within days and
  bury the reasoning. Put them in a migration page (`docs/migrations/`), a procedure or an issue, and link to it.
- **Free lunch coupon** — ignoring hard or long-term consequences. Negative consequences, especially operational ones a
  future operator will hit, must be spelled out, not softened.

### Optional sections — include when they add value

| Section                                 | Include when                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hors périmètre**                      | A settled premise, a deliberately excluded adjacent area, or a knowingly dropped capability could be misread as an oversight (see "Hors périmètre" above)  |
| **Alternatives écartées** (sub-section) | An alternative was genuinely considered and the reason it lost is not obvious                                                                              |
| **Conséquences**                        | The decision has non-obvious downstream effects worth calling out explicitly                                                                               |
| **Questions ouvertes**                  | The ADR is `proposed` and a question still blocks the _decision_. Implementation questions go to the plan; a question already out of scope is not open     |
| **Évolution de la décision**            | The decision pivoted during implementation — document _why_ with the specific technical discovery that caused the pivot (ADR-001 is the canonical example) |
| **Pour aller plus loin**                | Always, and always last — link the living pages (reference, guide), upstream ADRs (relative `.md` links), relevant RFCs, official docs                     |

Never include a section just to have it. An omitted section is better than a section with placeholder text.

### Diagrams

Use ASCII or Mermaid diagrams in `Décision` when a visual helps understand the resulting architecture. ADR-001 and
ADR-002 have good examples. The template supports Mermaid code blocks natively.

### Callout syntax

Use GitHub Markdown callouts for important asides. The marker sits alone on its line and ends with a backslash, or
Prettier joins it to the text and GitHub stops rendering the alert:

```markdown
> [!NOTE]\
> Informational note a reader should be aware of.

> [!CAUTION]\
> Something that must be done carefully or could cause problems.

> [!WARNING]\
> Deprecated content or a risk that was discovered during implementation.

> [!IMPORTANT]\
> A critical constraint or migration note.
```

### External references

Anchor reasoning in authoritative sources. Examples from existing ADRs:

- HashiCorp/OpenBao official docs for secret topology decisions
- NIST publications (Zero Trust Architecture, Cybersecurity Framework)
- IETF RFCs for protocol-level decisions
- Kubernetes official docs for Kubernetes-specific patterns
- OWASP guidelines for security decisions

A reader who wants to go deeper should be able to follow the references independently.

### Historique des modifications

Every material change to an ADR after its creation gets an entry, and so does every `status` change:

```markdown
## Historique des modifications

- **AAAA-MM-JJ** : **PRÉFIXE** : Description de ce qui a changé et pourquoi.
```

Entries run from the most recent to the oldest.

Prefixes: `FEATURE`, `FIX`, `SECURITY`, `DEPRECATION`, `CLARIFICATION`, `CHORE`.

## Examples

**Good — strategic question in context:**

> The strategic question this ADR answers is: how can we reduce resource overhead and operational complexity of
> PostgreSQL instances while maintaining security and performance in a growing homelab infrastructure?

**Good — a real alternative, with the specific reason it lost:**

```markdown
### Alternatives écartées

**Un seul montage KV avec des chemins par projet.** C'est le plus simple à déclarer, et c'est ce qui a été essayé en
premier. Une politique y porte sur un préfixe de chemin : une faute de frappe dans un préfixe ouvre les secrets d'un
autre projet, et rien ne le signale. Un montage par projet fait de la frontière une ressource déclarée.
```

**Bad — a decorative alternative nobody considered:**

```markdown
### Option 1 : statu quo

> **Statut : REJETÉE**

- `+` Aucun travail
- `-` Ne résout pas le problème
```

**Good — decision evolution capturing a real pivot:**

```markdown
## Évolution de la décision

- **2025-01-20** : Décision initiale — Infisical, choisi pour son interface moderne et son support OIDC apparent dans la
  version open source.
- **2025-01-23** : Décision révisée — HashiCorp Vault, parce que le SSO OIDC s'est révélé réservé à l'édition Enterprise
  d'Infisical, ce qui cassait l'intégration avec Authelia.
- **2025-01-24** : Décision révisée — OpenBao, parce que le déverrouillage automatique PKCS#11 (nécessaire pour ne pas
  stocker les clés de déverrouillage dans le cluster) est réservé à l'édition Enterprise de HashiCorp Vault. OpenBao
  l'inclut dans sa version open source.
```

## References

- Existing ADRs: `docs/decisions/` — read them before drafting for style, numbering, and cross-references. ADR-001 and
  ADR-002 set the quality bar.
- Kubernetes Enhancement Proposals (KEP) — exemplary design documents for infrastructure decisions:
  - [KEP template](https://github.com/kubernetes/enhancements/blob/master/keps/NNNN-kep-template/README.md) — the
    Goals/Non-Goals/Risks structure is worth internalizing
  - [KEP-2340: Consistent Reads from Cache](https://github.com/kubernetes/enhancements/tree/master/keps/sig-api-machinery/2340-Consistent-reads-from-cache)
    — strong motivation and trade-off analysis
  - [KEP-1287: In-Place Update of Pod Resources](https://github.com/kubernetes/enhancements/tree/master/keps/sig-node/1287-in-place-update-pod-resources)
    — exemplary alternatives and risks sections
- ADR quality and anti-patterns:
  - [Olaf Zimmermann — ADR creation, and how not to](https://ozimmer.ch/practices/2023/04/03/ADRCreation.html) — the
    named anti-pattern catalogue (fairy tale, dummy alternative, mega-ADR, …).
  - [adr.github.io — AD practices](https://adr.github.io/ad-practices/)
  - [AWS — ADR best practices](https://aws.amazon.com/blogs/architecture/master-architecture-decision-records-adrs-best-practices-for-effective-decision-making/)
    — one decision per ADR; keep it short.

---

## Template Versioning

The ADR template (`references/adr-template.md`) is versioned so that changes to the _structure_ of ADRs are themselves
tracked, and so each ADR records the template revision it was born from (via the `template-version` frontmatter field).

- **Scheme:** semantic-ish `MAJOR.MINOR.PATCH`.
  - `MAJOR` — a change that would make old ADRs look structurally wrong (a required section added/removed/renamed).
  - `MINOR` — a new optional section, or non-breaking authoring-guidance changes carried into the template.
  - `PATCH` — wording/typo fixes in the template's instructions.
- **When you change the template**, bump the version in _four_ places in sync: the `<!-- GABARIT D'ADR vX.Y.Z -->`
  comment, the `template-version` frontmatter default, the example in "Frontmatter" above, and the changelog below.
  Existing ADRs are **not** back-migrated by a template change alone — their `template-version` records the revision
  they were written under, which is the point. An ADR translated during the documentation migration is the exception: it
  is rewritten on the current template and takes its version.

### Template changelog

- **3.0.0** (2026-11-15): The ADR stops being a comparison grid. `Facteurs de décision`, `Options envisagées` (numbered
  options with a status) and `Décision retenue` are replaced by `Décision` (the answer, stated first) and
  `Pourquoi ce choix` (the rationale, with an optional `Alternatives écartées` for alternatives genuinely considered).
  `Détails de mise en œuvre et état` is removed: the detailed result lives in a reference page, the plan in a guide, a
  procedure or an issue. `Questions ouvertes` is added as an optional section. Prompted by the ADR-021 review: options
  were being invented after the fact to justify a decision already made.
- **2.0.0** (2026-10-11): Template translated into French; sections renamed (`Contexte et problème`, `Hors périmètre`,
  `Facteurs de décision`, `Options envisagées`, `Décision retenue`, `Conséquences`, `Détails de mise en œuvre et état`,
  `Évolution de la décision`, `Historique des modifications`, `Pour aller plus loin`). The manual table of contents is
  removed, `References and Related Decisions` becomes the final `Pour aller plus loin` section (relative `.md` links),
  and the `#` title takes the form `# ADR-NNN Titre` to match the file name `ADR-NNN-Titre-En-Francais.md`. Frontmatter
  keys and `status` values are unchanged.
- **1.1.0** (2026-07-05): Added the **Non-Goals** optional section; introduced `template-version` provenance in
  frontmatter; expanded authoring guidance with the "Anti-patterns to avoid" and "Non-Goals" standards
  (unsupported/unmeasured claims, repetition, one-decision scope, dummy alternatives). Prompted by the ADR-015 review.
- **1.0.0**: Initial template, kept in this skill as the single source of truth.

---

## ADR Template

The authoritative template is at `references/adr-template.md` (relative to this skill). Read that file and copy its
content verbatim as the starting point for a new ADR, then, before saving: delete the `<!-- GABARIT D'ADR … -->` HTML
comment (it sits just after the frontmatter), remove all `>` blockquote authoring instructions, strip the `[Facultatif]`
labels from the headings of the optional sections you keep — dropping any optional section you don't use — and keep the
`template-version` frontmatter field. The page keeps a single `#` title, no `####`, and ends with
`## Pour aller plus loin`.
