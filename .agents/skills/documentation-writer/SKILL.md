---
name: documentation-writer
description: >
  Single entry point for writing, rewriting, reviewing and migrating any documentation of this repository: guides,
  references, project overviews, procedures / SOPs / runbooks, Architecture Decision Records (ADR), post-mortems and
  root-cause analyses, experiment write-ups. Routes to the right page type, template and rules. Use it for "document X",
  "write a guide / a reference page", "write a procedure for X", "turn this into a runbook", "add an SOP", "write an
  ADR", "document this decision", "update ADR-00N", "write a post-mortem", "what went wrong", "why did this fail",
  "lessons learned", "move this doc to the wiki", "fix the docs", and right after a significant design decision, a
  multi-step manual operation or an incident worth preserving, even if nobody asked. Do not use it for code comments,
  component READMEs that describe a directory, OPA rule sheets under catalog/opa/, or agent files (AGENTS.md, .agents/).
---

# Documentation writer

The documentation of this repository lives in `docs/`, organised in directories by page type, and is mirrored to the
GitHub Wiki on every push to `main` (`.github/workflows/push,workflow_dispatch.wiki.yaml`, which runs
`scripts/wiki:publish`). The wiki has no pull requests, so `docs/` in the repository is the source of truth: changes are
reviewed like code, pages link to each other with relative `.md` links so they read well in Git, and nobody edits the
wiki in the web UI.

This skill is the only place that says how a page is written. It routes to the page type you need, and every page type
shares the same rules.

## 1. Pick the page type

Match the intent to one row, then read the files in the last column **in that order**. Always read the
[style guide](references/style-guide.md) too: it holds the rules shared by every type.

| The reader needs to...                                             | Page type        | Read                                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Get from a starting point to a result (bootstrap, set up, operate) | Guide            | [guide-template.md](references/guide-template.md)                                                                                                        |
| Look up a value, a list or a contract                              | Reference        | [reference-template.md](references/reference-template.md)                                                                                                |
| Execute a repeatable operation under pressure, command by command  | Procedure (SOP)  | [procedure.md](references/procedure.md), then [procedure-template.md](references/procedure-template.md)                                                  |
| Understand _why_ a technical choice was made                       | ADR              | [adr.md](references/adr.md), then [adr-template.md](references/adr-template.md)                                                                          |
| Learn from a failure, an outage or a missed target                 | Post-mortem      | [postmortem.md](references/postmortem.md), then [templates/postmortem.md](templates/postmortem.md) or [postmortem-lite.md](templates/postmortem-lite.md) |
| Know what was tried, what was concluded, and where the code lives  | Experiment       | [experiment-template.md](references/experiment-template.md)                                                                                              |
| Keep the trace of a finished or obsolete document                  | Archive          | [archive-template.md](references/archive-template.md)                                                                                                    |
| Get the overview of a project under `projects/`                    | Project overview | [project-template.md](references/project-template.md)                                                                                                    |

Tell-apart rules when two rows seem to fit:

- **ADR or procedure?** If you are justifying a choice or comparing options, it is an ADR. If you are listing commands
  to run, it is a procedure. A procedure links to the ADR; it never argues the choice.
- **Post-mortem or procedure?** The post-mortem tells what happened and why. The fix steps that will be needed again
  become a procedure that the post-mortem links to.
- **Guide or procedure?** A guide teaches and can be read start to finish at leisure. A procedure is followed literally,
  possibly at 2 a.m., and carries expected output and rollback.
- **Nothing fits?** The content is probably two pages. Split it.

## 2. What goes where

| Content                                                                  | Where it lives                     |
| ------------------------------------------------------------------------ | ---------------------------------- |
| Guides, references, procedures, ADRs, post-mortems, experiments          | `docs/`, in its type directory     |
| A README that describes a directory (what it contains, how to change it) | Next to the code, as a `README.md` |
| OPA policies and their rule sheets                                       | `catalog/opa/`, never in `docs/`   |
| Agent instructions, skills and knowledge                                 | `AGENTS.md`, `.agents/`            |
| Output of a generator (`projects/chezmoi.sh/docs/*.md`)                  | Where its generator writes it      |
| Diagrams and icons used by READMEs                                       | `docs/assets/`                     |

A README section that is really a guide moves to `docs/`, and the README links to it.

> [!NOTE]\
> The documentation is being migrated to the standard below category by category (issue #1257). `docs/.wiki-legacy`
> lists what is not migrated yet: those pages are neither linted nor published. Until a category has migrated, new
> procedures go in `docs/procedures/`, ADRs in `docs/decisions/` and post-mortems in `docs/incidents/`, with the
> numbering and front matter their reference file describes. A new page of any other type, or a migrated category,
> follows the naming and directory rules of the style guide.
>
> Pages are written in French. A document is translated when it is migrated, not before: a page still listed in
> `.wiki-legacy` keeps its current language.

## 3. Workflow

1. **Pick the page type** with the table above and read its files.
2. **Read the code and the cluster first.** Every statement is checked against the repository, and against the running
   cluster when it describes live state. A page that cannot be verified says so.
3. **Write to the rules** in the [style guide](references/style-guide.md). The short version: one topic per page, answer
   first, example before explanation, tables for anything enumerable, one fact in one place, present tense, no filler.
4. **Wire it in.** Add the page to `_Sidebar.md` under the right heading, link it from the pages that mention it, and
   end it with `## Pour aller plus loin`.
5. **Run `mise run lint:fix`** (Prettier wraps at 120 columns), then **`scripts/wiki:lint`** and fix every finding. It
   also runs in `rtunk check` (linter `wiki-lint`), so it runs on every pull request.
6. **Moving a document? Use `git mv`** so the history stays traceable, then rewrite in the same pull request. Update
   every reference to the old path
   (`grep -rn "<old path>" --include='*.md' --include='*.yaml' --include='*.py' --include='*.sh' .`).
7. **Commit** with the `@` type, per `.agents/skills/git-commit/SKILL.md`.

## 4. Moving records (ADR, post-mortem)

Keep the number, the title, the decision, the timeline and the front matter exactly as written. Only the structure and
the wording around them change. A status changes only when the repository proves it changed. See the "Records" section
of the style guide.

## 5. Common mistakes

- Copying a CIDR, a version or a command from another page instead of linking to it.
- Writing `[x](Page)` or an absolute `/wiki/...` link instead of a relative link to the `.md` file: it breaks in Git.
- Giving a page the same name as one in another directory: page names are unique across `docs/`.
- Putting a page outside the directory of its type, or inventing a new top-level directory.
- Describing the planned state as if it were deployed.
- Putting the reasoning of a decision in a procedure, or the fix steps in a post-mortem.
- Adding a page and forgetting `_Sidebar.md`.
- Writing a page in English, or ending it with a section other than `## Pour aller plus loin`.

## Files

| File                                                                                                              | Content                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [references/style-guide.md](references/style-guide.md)                                                            | Rules shared by every page, `[lint]` rules marked                             |
| [references/page-templates.md](references/page-templates.md)                                                      | Skeletons: guide, reference, experiment, project, and the frame of the others |
| [references/procedure.md](references/procedure.md)                                                                | How to write a procedure (SOP)                                                |
| [references/procedure-template.md](references/procedure-template.md)                                              | Procedure skeleton                                                            |
| [references/adr.md](references/adr.md)                                                                            | How to write an ADR                                                           |
| [references/adr-template.md](references/adr-template.md)                                                          | ADR skeleton                                                                  |
| [references/postmortem.md](references/postmortem.md)                                                              | How to run a blameless post-mortem                                            |
| `references/five-whys.md`, `ishikawa.md`, `swiss-cheese-model.md`, `pareto-analysis.md`, `fault-tree-analysis.md` | Root-cause analysis methods used by the post-mortem                           |
| [templates/postmortem.md](templates/postmortem.md), [templates/postmortem-lite.md](templates/postmortem-lite.md)  | Post-mortem skeletons (full and lite)                                         |
