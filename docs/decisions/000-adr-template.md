<!--
status: "{proposed | accepted | implemented | rejected | deprecated | superseded by ADR-0123}"
date: {YYYY-MM-DD when the decision was last updated}
implementation-completed: {YYYY-MM-DD when the implementation was finalized (optional)}
decision-makers: {list everyone involved in the decision, e.g., ["Alexandre"]}
consulted: {list everyone whose opinions are sought (typically subject-matter experts), e.g., ["ai/claude-4-sonnet"]}
informed: {list everyone who is kept up-to-date on progress}
-->

# {Short title, representative of solved problem and found solution}

## Context and Problem Statement

{Describe the context and problem statement. Explain why this decision is needed now.
Consider including the following subsections if relevant:

* **Current Architecture Overview**: How things work today.
* **Critical Problems Identified**: What is broken, limiting, or missing with the current approach.
* **Strategic Question**: The core question this ADR aims to answer.}

## Decision Drivers

{List the forces, concerns, and requirements that shape the decision. Consider categorizing them:

* **Functional Requirements**: What the solution must do.
* **Non-Functional Requirements**: Qualities the solution must have (Reliability, Security, Maintainability, etc.).
* **Constraints**: Limitations we must work within (Ecosystem, existing infrastructure, budget, etc.).}

- {decision driver 1}
- {decision driver 2}

## Considered Options

{List the options considered. For complex decisions, you can group them by category (e.g., Option 1.x, Option 2.x). Include the pros and cons directly here or in a dedicated section below.}

### Option 1: {title of option 1}

{Brief description of this option.}

* **Pros:**
  * {pro 1}
* **Cons:**
  * {con 1}

### Option 2: {title of option 2}

{Brief description of this option.}

* **Pros:**
  * {pro 1}
* **Cons:**
  * {con 1}

## Decision Outcome

**Chosen option:** "{title of option 1}", because {justification. e.g., only option, which meets k.o. criterion decision driver | which resolves force {force} | comes out best}.

<!-- This is an optional element, particularly useful for MADR (Markdown Any Decision Records) when tracking decision history. -->

### Decision Evolution

{If the decision changes during implementation or over time, document the history here:

* Initial Decision (YYYY-MM-DD): \[Option] - \[Reason]
* Revised Decision (YYYY-MM-DD): \[Option] - \[Reason] }

<!-- This is an optional element. -->

### Consequences

#### Positive Consequences

* ✅ {Good consequence, e.g., improvement of one or more desired qualities, …}

#### Negative Consequences

* ⚠️ {Bad consequence, e.g., compromising one or more desired qualities, …}

#### Neutral Consequences

* 📝 {Neutral consequence or required mitigation.}

<!-- This is an optional element for implemented ADRs to track real-world rollout status. -->

### Implementation Details / Status

{Document the progress or specific details of implementing this decision:

* **Completed Components**: What has been successfully rolled out.
* **Pending Configuration**: What remains to be done.
* **Architecture**: Diagrams (e.g., Mermaid) or detailed technical breakdown.
* **Standards Specification**: Any new conventions, labels, or naming rules introduced by this ADR.}

## Related Decisions

* {Provide links to other decisions that form the basis for this one, or that this one supersedes. e.g., `[ADR-001: Centralized Secret Management](./001-centralized-secret-management.md)`}

## References and Further Reading

{Provide additional details, technical specifications, or references. Consider categorizing them:

* **Architecture Documentation**: Links to internal or external architecture guides.
* **Security Guidelines**: Links to security best practices.
* **Implementation References**: Links to tool documentation (e.g., HashiCorp Vault, Kubernetes).}

## Changelog

{Document any significant updates made to this ADR after its initial creation. Use semantic prefixes if possible (e.g., FEATURE, FIX, SECURITY, DEPRECATION, CLARIFICATION).

* **YYYY-MM-DD**: **PREFIX**: {Description of change}
  }
