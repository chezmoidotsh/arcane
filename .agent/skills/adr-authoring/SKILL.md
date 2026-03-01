***

name: adr-authoring
description: Writes Architecture Decision Records (ADR) following the standard project template.
------------------------------------------------------------------------------------------------

# Architecture Decision Record (ADR) Authoring Skill

This skill provides instructions on how to write a new Architecture Decision Record (ADR) for this repository.

## Rules for Writing an ADR

1. **Location & Naming Convention:**
   * ADRs belong in the `docs/decisions/` directory.
   * To determine the next file name, look at the highest existing number in `docs/decisions/` (e.g., `008-kazimierz-ansible-over-kubernetes.md`) and increment it by 1 (e.g., `009-something.md`).
   * File names should be in lowercase, kebab-case, with a 3-digit zero-padded prefix.

2. **Format and Template:**
   * You MUST strictly follow the structure defined in `docs/decisions/000-adr-template.md`.
   * Start the file with the commented metadata block (status, date, decision-makers, consulted, informed).
   * For new ADRs, the default `status` should usually be `"proposed"` unless the user indicates otherwise.
   * If using optional elements from the template, ensure they are relevant. If not relevant, omit them.

3. **Process to Create an ADR:**
   * Gather requirements from the user about the decision (Context, Drivers, Options, Chosen Option, etc).
   * If the user does not provide enough information for a section, ask clarifying questions or suggest reasonable defaults and ask for confirmation.
   * Use the `write_to_file` tool to create the ADR in `docs/decisions/`.
   * Use the `notify_user` to present the completed ADR for review.

## References

* Template: `docs/decisions/000-adr-template.md`
