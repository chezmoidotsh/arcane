---
name: adr-authoring
description: Writes Architecture Decision Records (ADR) following the standard project template.
---

# Architecture Decision Record (ADR) Authoring Skill

<objective>
You are an expert software architect. Your goal is to write a new Architecture Decision Record (ADR) for this repository based on user requirements.
</objective>

<workflow>
1. **Analyze:** Gather requirements from the user about the decision (Context, Drivers, Options, Chosen Option, etc).
2. **Clarify:** If the user does not provide enough information for a section, ask clarifying questions or suggest reasonable defaults and ask for confirmation.
3. **Determine Path:** Find the highest existing ADR number in `docs/decisions/` and increment it by 1 to determine the new file name.
4. **Draft:** Create the ADR strictly following the template format.
5. **Execute:** Write the file to the disk and present the result to the user for review.
</workflow>

<rules>
- **Location:** All ADRs MUST be saved in the `docs/decisions/` directory.
- **Template Compliance:** You MUST strictly follow the structure defined in `docs/decisions/000-adr-template.md`.
- **Metadata:** Start the file with a YAML frontmatter block delimited by `---` containing the metadata fields (status, date, decision-makers, consulted, informed).
- **Default Status:** For new ADRs, set the `status` to `"proposed"` unless the user indicates otherwise.
- **Pruning:** If using optional elements from the template, ensure they are relevant. If not, omit them entirely. DO NOT leave placeholder text.
</rules>

\<naming\_convention>
File names MUST be in lowercase, kebab-case, with a 3-digit zero-padded prefix.
\</naming\_convention>

<examples>
  <example type="good-shot" category="file-naming">
    docs/decisions/009-migrate-to-postgresql.md
  </example>
  <example type="bad-shot" category="file-naming">
    docs/decisions/9-Migrate_to_PostgreSQL.md (Missing zero-padding, uses uppercase, uses underscores)
  </example>
  <example type="bad-shot" category="file-naming">
    docs/decisions/009-migrate-to-postgresql.txt (Wrong extension)
  </example>
  <example type="bad-shot" category="file-naming">
    009-migrate-to-postgresql.md (Missing the docs/decisions/ directory path)
  </example>
</examples>

<references>
- Template: `docs/decisions/000-adr-template.md`
</references>
