---
status: "{proposed | accepted | implemented | rejected | deprecated | superseded by ADR-0123}"
date: {YYYY-MM-DD when the decision was last updated}
implementation-completed: {YYYY-MM-DD when the implementation was finalized (optional)}
decision-makers: ["Name 1", "Name 2", ...]
consulted: ["Name 1", "ai/claude-4-sonnet", ...]
informed: ["Name 1", "Name 2", ...]
---

# {Short title, representative of solved problem and found solution}

## Table of Contents

* [Context and Problem Statement](#context-and-problem-statement)
* [Decision Drivers](#decision-drivers)
* [Considered Options](#considered-options)
  * [Option 1: {title of option 1}](#option-1-title-of-option-1)
  * [Option 2: {title of option 2}](#option-2-title-of-option-2)
* [Decision Outcome](#decision-outcome)
* [Consequences \[Optional\]](#consequences-optional)
  * [Positive](#positive)
  * [Negative](#negative)
  * [Neutral](#neutral)
* [Implementation Details / Status \[Optional\]](#implementation-details--status-optional)
* [Decision Evolution \[Optional\]](#decision-evolution-optional)
* [References and Related Decisions \[Optional\]](#references-and-related-decisions-optional)
* [Changelog](#changelog)

## Context and Problem Statement

> Describe the context and problem statement using clear, complete paragraphs. Do not rely solely on bullet points. Explain exactly why this decision is needed now and omit no technical details.
>
> Ensure you explicitly cover:
>
> * **Current Architecture Overview**: How things work today.
> * **Critical Problems Identified**: What is broken, limiting, or missing with the current approach.
> * **Strategic Question**: The core question this ADR aims to answer.

{Write comprehensive context here...}

## Decision Drivers

> List the forces, concerns, and requirements that shape the decision. Categorize them to ensure no details are omitted:
>
> * **Functional Requirements**: What the solution must do.
> * **Non-Functional Requirements**: Qualities the solution must have (Reliability, Security, Maintainability, etc.).
> * **Constraints**: Limitations we must work within (Ecosystem, existing infrastructure, budget, etc.).

* {decision driver 1}
* {decision driver 2}

## Considered Options

> Detail the options considered. For complex decisions, you can group them by category.
> Provide a substantial, detailed paragraph describing each option before listing its pros and cons.

### Option 1: {title of option 1}

> Write a complete, concise description of how this option works, its architectural impact, and how it addresses the drivers.

* `+` {pro 1}
* `+` {pro 2}
* `-` {con 1}

### Option 2: {title of option 2}

> Write a complete, concise description of how this option works, its architectural impact, and how it addresses the drivers.

* `+` {pro 1}
* `-` {con 1}

## Decision Outcome

**Chosen option: "{title of chosen option}"**, because {Provide a detailed, complete justification in paragraph form. Explain how it uniquely meets the critical decision drivers, resolves the forces at play, or mitigates the primary constraints. Do not skimp on the rationale}.

***

## Consequences \[Optional]

> Detail the cascading effects of this decision. Be explicit about required mitigations.

### Positive

* ✅ {Good consequence, e.g., improvement of one or more desired qualities, …}

### Negative

* ⚠️ {Bad consequence, e.g., compromising one or more desired qualities, …}

### Neutral

* ⚖️ {Neutral consequence or required mitigation.}

***

## Implementation Details / Status \[Optional]

> Document the high-level architecture resulting from this decision (e.g., using Mermaid or ASCII diagrams).
>
> ⚠️ **ANTI-PATTERN WARNING**: DO NOT include step-by-step migration plans, tutorials, runbooks, or low-level technical configurations (like specific Helm values, RBAC account names, or exact file paths) in this document.
>
> * **Migration plans and runbooks** belong in GitHub Issues, PRs, or `docs/procedures/`.
> * **Low-level configurations** belong in the code itself, which is the only source of truth.
>
> Keep this section focused on the *conceptual* architecture and the *status* of the implementation.

* **Completed Components**: {What has been successfully rolled out conceptually}
* **Pending Components**: {What remains to be done conceptually}
* **Architecture**: {Diagrams (e.g., Mermaid) or high-level technical breakdown}
* **Standards Specification**: {Any new conventions, labels, or naming rules introduced by this ADR}

***

## Decision Evolution \[Optional]

> If the decision changes during implementation or over time, document the history and the exact technical reasons for the pivot.

* **YYYY-MM-DD**: Initial Decision - {Option}
* **YYYY-MM-DD**: Revised Decision - {Option} because {Detailed Reason}

***

## References and Related Decisions \[Optional]

> Provide links to other decisions, technical specifications, or external references that are crucial for understanding this ADR.

* **Related ADRs**: {Provide links, e.g., `[ADR-001: Centralized Secret Management](./001-centralized-secret-management.md)`}
* **Architecture Documentation**: {Links to internal or external architecture guides}
* **Security Guidelines**: {Links to security best practices}
* **Implementation References**: {Links to tool documentation}

***

## Changelog

> Document any significant updates made to this ADR after its initial creation. Use semantic prefixes if possible (e.g., FEATURE, FIX, SECURITY, DEPRECATION, CLARIFICATION).

* **YYYY-MM-DD**: **PREFIX**: {Complete description of the change and its impact}
