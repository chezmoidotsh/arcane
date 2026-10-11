---
name: wiki-docs
description: >
  Writes, rewrites and reviews pages of the Arcane documentation under wiki/ (published to the GitHub Wiki), and
  migrates documents there from docs/, projects/*/docs/ or the repository root. Use it whenever you create or edit
  anything in wiki/, when asked to "document X", "write a guide", "write a reference page", "move this doc to the wiki"
  or "fix the docs", and before writing an ADR, a procedure or a post-mortem (their skills defer to this one for style,
  naming and navigation). Do not use it for code comments, component READMEs that describe a directory, OPA rule
  sheets under catalog/opa/, or agent files (AGENTS.md, .agents/).
---

# Wiki documentation skill

The documentation of this repository lives in `wiki/` and is mirrored to the GitHub Wiki on every push to `main`
(`.github/workflows/push,workflow_dispatch.wiki.yaml`). The wiki has no pull requests, so `wiki/` in the repository is
the source of truth: changes are reviewed like code and nobody edits the wiki in the web UI.

This skill is the single place that says how a page is written. `adr-authoring`, `sop-authoring` and `postmortem` add
the structure of their own page type on top of it.

## What goes where

| Content                                                                  | Where it lives                     |
| ------------------------------------------------------------------------ | ---------------------------------- |
| Guides, references, procedures, ADRs, post-mortems, experiments          | `wiki/`                            |
| A README that describes a directory (what it contains, how to change it) | Next to the code, as a `README.md` |
| OPA policies and their rule sheets                                       | `catalog/opa/`, never in the wiki  |
| Agent instructions, skills and knowledge                                 | `AGENTS.md`, `.agents/`            |
| Output of a generator (`projects/chezmoi.sh/docs/*.md`)                  | Where its generator writes it      |
| Diagrams and icons used by READMEs                                       | `docs/assets/`                     |

A README section that is really a guide moves to the wiki, and the README links to it.

## Workflow

1. **Pick the page type** in [page-templates.md](references/page-templates.md) and copy its skeleton.
2. **Read the code and the cluster first.** Every statement is checked against the repository, and against the running
   cluster when it describes live state. A page that cannot be verified says so.
3. **Write to the rules** in [style-guide.md](references/style-guide.md). The short version: one topic per page, answer
   first, example before explanation, tables for anything enumerable, one fact in one place, present tense, no filler.
4. **Wire it in.** Add the page to `_Sidebar.md` under the right heading, link it from the pages that mention it, and end
   it with `## Where to go next`.
5. **Run `scripts/wiki:lint`** and fix every finding. The same check runs on every pull request touching `wiki/`.
6. **Moving a document? Use `git mv`** so the history stays traceable, then rewrite in the same pull request. Update
   every reference to the old path (`grep -rn "<old path>" --include='*.md' --include='*.yaml' --include='*.py' --include='*.sh' .`).

## Moving records (ADR, post-mortem)

Keep the number, the title, the decision, the timeline and the front matter exactly as written. Only the structure and
the wording around them change. A status changes only when the repository proves it changed. See the "Records" section
of the style guide.

## Common mistakes

- Copying a CIDR, a version or a command from another page instead of linking to it.
- Writing `[x](Page.md)` instead of `[x](Page)`: the wiki resolves page names and the publication does not rewrite links.
- Creating `wiki/some/sub/dir/Page.md`: the wiki is flat.
- Describing the planned state as if it were deployed.
- Adding a page and forgetting `_Sidebar.md`.
