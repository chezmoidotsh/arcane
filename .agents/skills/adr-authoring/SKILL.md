---
name: adr-authoring
description: >
  Writes and updates Architecture Decision Records (ADR) in docs/decisions/. Use it to
  document an architectural choice or record why a technology was selected ("write an ADR",
  "document this decision", "update ADR-00N", "this should be an ADR"), or right after a
  significant design decision worth preserving — even if an ADR wasn't explicitly requested.
---

# Architecture Decision Record (ADR) Authoring Skill

## Why we write ADRs

An ADR is not documentation — it is institutional memory. Its purpose is to let a future
reader (including the author, six months later) understand not just *what* was decided but
*why*, *what forces were in play*, and *what alternatives were ruled out and why*. A reader
who disagrees with the decision should be able to learn from the ADR whether their objection
was already considered.

The difference between a mediocre ADR and a great one is the depth of the context. Describing
the current state is not enough — you must explain what is broken or missing, why the problem
surfaced now, and what the cost of inaction would be. Options should be described with enough
substance to stand on their own, not just as a list of bullets. The rationale for the chosen
option must be argued, not merely stated.

## When NOT to write an ADR

Not every decision needs an ADR. Skip it for:

* **Reversible, low-cost decisions**: configuration tweaks, minor naming choices, tool
  version bumps that carry no architectural implications.
* **Decisions already captured elsewhere**: if the choice is fully explained in a GitHub
  issue, PR description, or an existing ADR, add a reference there instead of creating a
  new document.
* **Decisions in flux**: if the investigation is not complete and the chosen option may
  still change significantly, wait until the decision stabilizes.

When in doubt, write a short draft and let the user decide whether it deserves a file.

## Workflow

### Creating a new ADR

1. **Explore:** Scan `docs/decisions/` to understand:
   * The highest existing ADR number (increment by 1 for the new file — never fill gaps).
   * Which existing ADRs are related and should be referenced or are affected.
   * The writing style and depth of recent ADRs to match tone and quality.

2. **Gather:** Collect from the user what is needed to populate each section. Be specific:
   * What broke, what is missing, or what constraint emerged that triggered this decision?
   * What is the core **strategic question** this ADR answers?
   * What options were seriously considered?
   * What clinched the choice?
     If information is missing, ask targeted questions rather than inventing plausible answers.

3. **Research:** Where relevant, look up authoritative external references — official docs,
   RFCs, NIST guidelines, project-specific best practices — to anchor the reasoning in
   something a reader can follow up on independently. The existing ADRs set a high bar here.

4. **Draft:** Use the template at the bottom of this skill. Two things get removed when
   authoring: the `<!-- ADR TEMPLATE … -->` HTML comment (right after the frontmatter), and
   every `>` blockquote block (those are *authoring instructions*, not content). Keep the
   `template-version` frontmatter field — it records which template revision produced the
   ADR. Then read the
   draft with fresh eyes against "Anti-patterns to avoid" below: is every claim either
   validated or explicitly marked as expected? Is the core argument stated once, not four
   times? Does the title name the *same single* decision as the strategic question?

5. **Cross-reference:** Link related ADRs in "References and Related Decisions". Scan
   existing files to find candidates — the chain of decisions (001 → 002 → 003) in this
   repo is a model.

6. **Write:** Save the file and present it to the user for review.

### Updating an existing ADR

When the user wants to change status, record a pivot, or add a changelog entry:

1. Read the target ADR fully before touching it.
2. Make the minimal targeted update:
   * Status change → update `status` in frontmatter + add to `Decision Evolution` if the
     decision itself changed, + add a `Changelog` entry.
   * Implementation progress → update `Implementation Details / Status` + `Changelog`.
   * Post-implementation deprecation → update `status`, add `> [!CAUTION]` callout on
     deprecated content, update `date`, add `Changelog` entry.
3. Update `date` in frontmatter to today's date.
4. If the change is significant, show the user a before/after of the key sections.

## Writing standards

### Frontmatter

```yaml
---
status: "proposed"           # proposed | accepted | implemented | rejected | deprecated | superseded by ADR-NNNN
date: YYYY-MM-DD             # today's date; update whenever the ADR is materially revised
implementation-completed: YYYY-MM-DD   # optional, add only once implemented
decision-makers: ["Alexandre"]         # the human(s) who own this decision
assisted-by: ["claude-sonnet-4.6"]    # AI models that contributed; format: <model-name>
informed: []
---
```

The `assisted-by` field records which AI models contributed to the analysis or drafting
during this session. Use the model identifier from the system prompt. `decision-makers`
should always include the human responsible — in this repo, that is "Alexandre" unless
stated otherwise.

### Naming and location

Files live in `docs/decisions/`. Names are lowercase kebab-case with a 3-digit zero-padded
prefix, e.g. `010-migrate-to-postgresql.md`. Determine the next number by finding the
highest existing number and incrementing — do not fill sequence gaps.

### Context and Problem Statement — the most important section

This section fails most often. A strong context does three things:

1. **Explains the current architecture** so a reader unfamiliar with the system understands
   the starting point.
2. **Identifies what is broken, limiting, or missing** — not just "we want to improve X"
   but "X causes Y failure mode in Z situation, and this has happened N times".
3. **States the strategic question** — one sentence that crystallizes what the ADR decides.
   Examples from this repo: "How do we implement a modern, centralized secret management
   solution that eliminates single points of failure…" (ADR-001), "How can we reduce
   resource overhead and operational complexity of PostgreSQL instances while maintaining
   security and performance…" (ADR-009).

### Considered options — give them substance

Each option should have a paragraph describing *how it works architecturally and what its
impact would be*. Pros/cons bullets alone are not enough — a reader should be able to
understand the option without any prior knowledge. Mark the status of each option using a
bold text marker on the first line:

```markdown
### Option N: Title

> **Status: ACCEPTED**   (or REJECTED, or PROPOSED)

Paragraph describing the option...

* `+` pro
* `-` con
```

When several options were rejected with strong reasoning, consider adding an "Alternatives
Considered and Rejected" subsection (see ADR-002 for an example) that dedicates a paragraph
to *why* each rejected option was ruled out — not just that it was.

### Decision Outcome — argue, don't just state

"We chose X because it is better" is not a rationale. Explain specifically how the chosen
option addresses each decision driver, what trade-offs were accepted and why they are
acceptable given the context, and what would need to change for a different option to win.

### Non-Goals — say what you are NOT deciding

State explicitly what the ADR does *not* decide. This is not padding — it is the cheapest
way to prevent three failure modes:

1. **A settled premise misread as an open option.** If a prior decision (a POC result, an
   earlier ADR) fixes part of the design, name it as a non-goal so a reader does not think
   the options reopen it. If one of your "options" is really the already-settled question,
   you have the wrong options — the real decision is narrower than you framed it.
2. **A tempting adjacent area silently excluded.** If the decision deliberately leaves
   something out (a system that stays manual, a capability not migrated), say so *and why*.
   Otherwise a future reader re-proposes exactly what you already rejected.
3. **A capability of the old approach knowingly dropped.** Naming it as a non-goal turns a
   silent regression into a documented, deliberate trade-off.

Put non-goals in their own section right after Context (the template has it). Do not bury
them in a "Neutral" consequence — a deliberate scope boundary deserves to be visible.

### Anti-patterns to avoid

These are the recurring ways ADRs go wrong. Named anti-patterns follow Olaf Zimmermann's
[ADR creation guide](https://ozimmer.ch/practices/2023/04/03/ADRCreation.html); the rest
come from reviews in this repo.

* **Unsupported claim / pseudo-accuracy** — the most damaging, because it looks rigorous.
  Do not present a benefit as established when it was only asserted. If a POC *expected* a
  smaller footprint but never measured it, write exactly that and keep it out of the
  load-bearing rationale. A driver the reader cannot verify is worse than no driver: it
  invites a rebuttal that collapses the whole argument. Distinguish *validated* from
  *expected* explicitly, and cite where each came from.
* **Fairy tale** — only pros, no cons; truisms as justification. Every option (including the
  chosen one) must list what it costs. An option with no `-` bullets is under-analyzed.
* **Dummy alternative** — a straw-man option that exists only to be knocked down. If your
  decisive drivers eliminate an option *the moment they are stated*, that option is not
  really discriminating the decision. Prefer options that all pass the hard constraints, so
  the rationale has to argue the *real* trade-off (e.g. two viable designs separated by blast
  radius, not by a constraint one of them fails outright).
* **Restating instead of arguing (repetition)** — the same argument appearing in Context,
  every option's cons, the Decision Outcome, and Consequences reads as length without
  information. State the core argument *once*, sharply, in the Decision Outcome; elsewhere
  refer to it, don't re-derive it. Density of reasoning per line matters more than word count.
* **Mega-ADR / more than one decision** — one ADR decides one thing. If the title says one
  decision but the options quietly bundle several (tool choice *and* execution model *and*
  operational policy), split them or narrow the framing. The title and the strategic
  question must name the *same* decision.
* **Free lunch coupon** — ignoring hard or long-term consequences. Negative consequences,
  especially operational ones a future operator will hit, must be spelled out, not softened.

### Optional sections — include when they add value

| Section                                  | Include when                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Non-Goals**                            | A settled premise, a deliberately excluded adjacent area, or a knowingly dropped capability could be misread as an oversight (see "Non-Goals" above)       |
| **Consequences**                         | The decision has non-obvious downstream effects worth calling out explicitly                                                                               |
| **Implementation Details / Status**      | A high-level architecture diagram or current rollout status is useful; avoid runbooks and low-level configs (those belong in Git or `docs/procedures/`)    |
| **Decision Evolution**                   | The decision pivoted during implementation — document *why* with the specific technical discovery that caused the pivot (ADR-001 is the canonical example) |
| **Alternatives Considered and Rejected** | Multiple options were seriously considered and rejected with non-obvious reasons (ADR-002)                                                                 |
| **Future Considerations**                | Specific, concrete future evolution paths are worth capturing (ADR-002)                                                                                    |
| **References and Related Decisions**     | Always — link upstream ADRs, relevant RFCs, official docs, security frameworks                                                                             |

Never include a section just to have it. An omitted section is better than a section with
placeholder text.

### Diagrams

Use ASCII or Mermaid diagrams in "Implementation Details / Status" when a visual helps
understand the resulting architecture. ADR-001 and ADR-002 have good examples. The template
supports Mermaid code blocks natively.

### Callout syntax

Use GitHub Markdown callouts for important asides:

```markdown
> [!NOTE]
> Informational note a reader should be aware of.

> [!CAUTION]
> Something that must be done carefully or could cause problems.

> [!WARNING]
> Deprecated content or a risk that was discovered during implementation.

> [!IMPORTANT]
> A critical constraint or migration note.
```

### External references

Anchor reasoning in authoritative sources. Examples from existing ADRs:

* HashiCorp/OpenBao official docs for secret topology decisions
* NIST publications (Zero Trust Architecture, Cybersecurity Framework)
* IETF RFCs for protocol-level decisions
* Kubernetes official docs for Kubernetes-specific patterns
* OWASP guidelines for security decisions

A reader who wants to go deeper should be able to follow the references independently.

### Changelog

Every material change to an ADR after its creation gets a changelog entry:

```markdown
## Changelog

* **YYYY-MM-DD**: **PREFIX**: Description of what changed and why.
```

Prefixes: `FEATURE`, `FIX`, `SECURITY`, `DEPRECATION`, `CLARIFICATION`, `CHORE`.

## Examples

**Good — strategic question in context:**

> The strategic question this ADR answers is: how can we reduce resource overhead and
> operational complexity of PostgreSQL instances while maintaining security and performance
> in a growing homelab infrastructure?

**Good — option with status marker and substance:**

```markdown
### Option 2: Multiple KV Mounts per Project + Shared Mount

> **Status: ACCEPTED**

Dedicated KV v2 mount per project plus a centralized shared mount. Each project's mount
acts as a policy boundary, enabling fine-grained RBAC without the administrative overhead
of full namespace isolation. Secrets that cross project boundaries (shared certificates,
third-party credentials) live in a dedicated `shared/` mount with their own governance.

* `+` Complete policy isolation prevents accidental cross-project access
* `+` Linear growth model through standardized mount creation
* `-` Requires Infrastructure-as-Code for mount lifecycle management
```

**Bad — option with no substance:**

```markdown
### Option 2: Multiple KV Mounts
* `+` Better isolation
* `-` More complex
```

**Good — decision evolution capturing a real pivot:**

```markdown
## Decision Evolution

* **2025-01-20**: Initial Decision — Infisical, chosen for its modern UI and apparent
  OIDC support in the open-source version.
* **2025-01-23**: Revised Decision — HashiCorp Vault, because OIDC SSO was discovered
  to be Enterprise-only in Infisical, fundamentally breaking the Authelia integration.
* **2025-01-24**: Revised Decision — OpenBao, because PKCS#11 auto-unseal (required
  to avoid storing unseal keys in the cluster) is Enterprise-only in HashiCorp Vault.
  OpenBao includes this capability in its open-source release.
```

## References

* Existing ADRs: `docs/decisions/` — read them before drafting for style, numbering,
  and cross-references. ADR-001 and ADR-002 set the quality bar.
* Kubernetes Enhancement Proposals (KEP) — exemplary design documents for infrastructure
  decisions:
  * [KEP template](https://github.com/kubernetes/enhancements/blob/master/keps/NNNN-kep-template/README.md) —
    the Goals/Non-Goals/Risks structure is worth internalizing
  * [KEP-2340: Consistent Reads from Cache](https://github.com/kubernetes/enhancements/tree/master/keps/sig-api-machinery/2340-Consistent-reads-from-cache) —
    strong motivation and trade-off analysis
  * [KEP-1287: In-Place Update of Pod Resources](https://github.com/kubernetes/enhancements/tree/master/keps/sig-node/1287-in-place-update-pod-resources) —
    exemplary alternatives and risks sections
* ADR quality and anti-patterns:
  * [Olaf Zimmermann — ADR creation, and how not to](https://ozimmer.ch/practices/2023/04/03/ADRCreation.html) —
    the named anti-pattern catalogue (fairy tale, dummy alternative, mega-ADR, …).
  * [adr.github.io — AD practices](https://adr.github.io/ad-practices/)
  * [AWS — ADR best practices](https://aws.amazon.com/blogs/architecture/master-architecture-decision-records-adrs-best-practices-for-effective-decision-making/) —
    one decision per ADR; keep it short.

***

## Template Versioning

The ADR template (`references/adr-template.md`) is versioned so that changes to the
*structure* of ADRs are themselves tracked, and so each ADR records the template revision
it was born from (via the `template-version` frontmatter field).

* **Scheme:** semantic-ish `MAJOR.MINOR.PATCH`.
  * `MAJOR` — a change that would make old ADRs look structurally wrong (a required
    section added/removed/renamed).
  * `MINOR` — a new optional section, or non-breaking authoring-guidance changes carried
    into the template.
  * `PATCH` — wording/typo fixes in the template's instructions.
* **When you change the template**, bump the version in *three* places in sync: the
  `<!-- ADR TEMPLATE vX.Y.Z -->` comment, the `template-version` frontmatter default, and
  the changelog below. Existing ADRs are **not** back-migrated — their `template-version`
  records the revision they were written under, which is the point.

### Template changelog

* **1.1.0** (2026-07-05): Added the **Non-Goals** optional section; introduced
  `template-version` provenance in frontmatter; expanded authoring guidance with the
  "Anti-patterns to avoid" and "Non-Goals" standards (unsupported/unmeasured claims,
  repetition, one-decision scope, dummy alternatives). Prompted by the ADR-015 review.
* **1.0.0**: Initial template extracted from `docs/decisions/000-adr-template.md` into
  this skill as the single source of truth.

***

## ADR Template

The authoritative template is at `references/adr-template.md` (relative to this skill).
Read that file and copy its content verbatim as the starting point for a new ADR, then,
before saving: delete the `<!-- ADR TEMPLATE … -->` HTML comment (it sits just after the
frontmatter), remove all `>` blockquote authoring instructions, and keep the
`template-version` frontmatter field.
