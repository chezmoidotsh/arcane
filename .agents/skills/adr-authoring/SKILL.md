---
name: adr-authoring
description: >
  Writes and updates Architecture Decision Records (ADR) following the standard project
  template in docs/decisions/. Use this skill whenever the user wants to document an
  architectural choice, record why a technology was selected, capture a design decision,
  update the status of an existing ADR, or whenever phrases like "write an ADR",
  "document this decision", "record why we chose X", "create an architectural decision
  record", "update ADR-00N", "this should be an ADR", "let's write up this choice",
  or "how did we decide X" appear. Also trigger this skill when the user has just made
  a significant design decision during a task and it would be worth preserving for future
  reference — even if they didn't ask for an ADR explicitly.
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

4. **Draft:** Use the template at the bottom of this skill. The `>` blockquote blocks are
   *authoring instructions*, not content — remove them entirely when filling in the sections.
   Then read the draft with fresh eyes: does the context explain *why now*? Does each option
   have enough substance? Is the rationale argued, not just stated?

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

### Optional sections — include when they add value

| Section                                  | Include when                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
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

***

## ADR Template

The authoritative template is at `references/adr-template.md` (relative to this skill).
Read that file and copy its content verbatim as the starting point for a new ADR, then
remove all `>` blockquote authoring instructions before saving.
