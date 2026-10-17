# Arcane documentation style guide

Rules for every page of `docs/` that has been migrated. They are adapted from the `axnic/rtunk` wiki style guide to an
infrastructure repository, where a page is often read during an incident and a wrong sentence costs more than a missing
one.

Rules marked **[lint]** are checked by `scripts/wiki:lint` and fail the pull request. The others are a review checklist.

## Language

1. **Pages are written in French, with accents.** File and directory names stay in ASCII without accents (`Etapes` never
   `Étapes` in a file name), per the naming rules below.
2. **Page names are French when they are a verb or a common noun** (`Initialiser-Lungmen`,
   `Restaurer-CNPG-depuis-le-Stockage-Objet`). Record identifiers do not change (`ADR-014-...`, `DB-20260723-00-...`,
   `Incident-2026-05-30-...`) and the reference suffix stays `-Reference`.
3. **End with `## Pour aller plus loin` [lint].** It is the last section of every page, in French, whatever the page
   type.
4. **The title matches the file name [lint].** Case, accents and hyphens are ignored when comparing `# Title` to the
   file name.
5. **No filler [lint].** Cut _simplement_, _juste_, _facilement_, _évidemment_, _bien sûr_, _il suffit de_, _veuillez
   noter_, _tout simplement_.
6. **Keep the English term when it is a proper name or the established term** (Pod, Gateway, commit, rollback); write
   commands and code as they are; otherwise prefer the French word.
7. **Wording.** Infinitive or imperative for steps, present tense for facts, active voice, never "nous", no informal or
   formal direct address (no _tu_, no _vous_) in statements of fact.

## Structure

1. **One topic per page.** If the title needs "and", split the page. Link instead of copying.
2. **One `# Title` per page [lint].** The title matches the file name: `Initialiser-Lungmen.md` is titled
   `# Initialiser Lungmen`. Hyphens in the file name become spaces; case and accents are ignored.
3. **Short version first.** The first paragraph says what the page is for and what the reader will have done or learned
   at the end. A reader who stops after the first screen still gets the answer.
4. **Motivation before mechanics.** Say why before how: one or two sentences, then the steps or the facts.
5. **Example before explanation.** Show the command, the manifest or the output first, then comment on it.
6. **End with `## Pour aller plus loin` [lint].** Two to five links, each with a one-line lead. No page is a dead end.
   `Home`, `_Sidebar` and `_Footer` are exempt.
7. **Shallow headings [lint].** Use `##` and `###` only. A page that needs `####` is two pages.

## Naming and navigation

1. **A page lives in the directory of its type.** `docs/` is organised in directories so the documentation is browsable
   and ordered in Git; the same paths become the page paths of the wiki. Directory names are `lower-case-with-hyphens`
   [lint]; a type may add sub-directories (`procedures/backups/`).

   | Page type        | Directory      | File name                             |
   | ---------------- | -------------- | ------------------------------------- |
   | Guide            | `guides/`      | `Verb-Phrase.md`                      |
   | Reference        | `reference/`   | `Topic-Reference.md`                  |
   | Procedure        | `procedures/`  | `<ID>-Verb-Phrase.md`                 |
   | ADR              | `decisions/`   | `ADR-NNN-Title.md`                    |
   | Post-mortem      | `incidents/`   | `Incident-YYYY-MM-DD-Title.md`        |
   | Experiment       | `experiments/` | `Experimentation-YYYY-MM-DD-Title.md` |
   | Project overview | `projects/`    | `Projet-<name>.md`                    |

   Everything else (a diagram, an image) goes in `docs/assets/`. `Home.md`, `_Sidebar.md` and `_Footer.md` stay at the
   root of `docs/`.

2. **File names use `Title-Case-With-Hyphens.md` [lint].** Letters, digits and hyphens only: no dots, spaces,
   underscores or non-ASCII characters. Function words (articles, prepositions, conjunctions: _le_, _la_, _les_, _un_,
   _une_, _de_, _du_, _des_, _d_, _depuis_, _sous_, _avec_, _par_, _pour_, _sur_, _dans_, _vers_, _et_, _ou_, _au_,
   _en_, _que_, _qu_) stay lowercase; verbs, nouns, adjectives, acronyms and proper names keep their capital, and so
   does the first word of the title (`Restaurer-CNPG-depuis-le-Stockage-Objet`). The directory already says the page is
   a procedure, a decision or a guide: no prefix like `Procedure-`.
3. **Page names are unique across the whole tree [lint].** Two pages with the same name (case ignored) in different
   directories are rejected, so a page can always be found by its name and moved without a collision.
4. **The name signals the page type.** Guides start with a verb (`Initialiser-Lungmen`, `Restaurer-OpenBao`), references
   end with `-Reference` (`IPAM-Reference`). Records keep their identifier: `ADR-014-Network-Topology`,
   `Procedure-DB-20260723-00-Restore-CNPG-From-Object-Store`, `Incident-2026-05-30-CNPG-WAL-Disk-Full`.
5. **Every page is reachable from `_Sidebar.md` [lint].** The sidebar is curated by what the reader is trying to do (get
   started, operate, recover, reference, internals), not by file type. Records (ADR, incidents) are grouped under their
   own heading and listed in order.
6. **Links are relative and point to the `.md` file [lint].** Write `[IPAM](../reference/IPAM-Reference.md)`, never
   `IPAM-Reference` or an absolute path: relative links work when browsing Git, and the link must resolve to an existing
   file. A link to a section is `[x](Page.md#section)`. A link to code outside `docs/` is relative too
   (`../projects/rhodes.akn/README.md`). `scripts/wiki:publish` rewrites them for the wiki when publishing.
7. **Not migrated yet? List it in `docs/.wiki-legacy`.** A path listed there is neither linted nor published. Delete the
   line when its category has migrated; the file disappears when the migration is complete.
8. **A link to a skill says so.** A skill is an instruction for an agent, not a page for a human. Its link text starts
   with `Skill :` (`[Skill : écrire la documentation](…/SKILL.md)`), so a reader can tell it from a documentation page.
   Link texts for documentation pages keep Title Case for proper names such as `Décisions d'Architecture`.

## Content

1. **One fact, one place.** Guides link to the reference instead of copying a value. If two pages state the same CIDR,
   one of them is wrong the next time it changes.
2. **State verified, current behaviour.** Describe what the repository and the clusters do today. Planned work is a
   single-line pointer to an issue or an ADR, not a paragraph.
3. **Say which cluster, and when it was verified.** A statement about live state names the cluster (`rhodes.akn`) and,
   when it can drift, the date: "Verified on `rhodes.akn`, 2026-10-11."
4. **Real commands, real output.** Procedures are copy-pasteable: no placeholder that is not explained, no `...` in the
   middle of a command. Show the expected output after any step whose result decides the next one.
5. **Tables for anything enumerable.** Components, flags, ports, CIDRs, roles: a table, not a bullet list of sentences.
6. **Diagrams as Mermaid.** A flow or a topology is a fenced `mermaid` block, not three paragraphs. Keep the source in
   the page; commit an SVG only when the diagram cannot be expressed in Mermaid (the D2 architecture diagrams).
7. **Admonitions are for exceptions.** At most three per page (`> [!NOTE]`, `> [!WARNING]`). A page full of warnings has
   none.
8. **Never put a secret in a page.** Name the OpenBao path or the SOPS file, never the value.
9. **Markdown only, no HTML.** Links, images and tables are Markdown. `scripts/wiki:lint` and `scripts/wiki:publish`
   read Markdown links only: an `<a href>` or `<img src>` is neither checked nor rewritten for the wiki.

## Voice

1. **Plain, present tense, active voice.** "Le script génère `dist/`", not "`dist/` sera généré par le script".
2. **No filler [lint].** Cut the banned words listed in the Language section (_simplement_, _juste_, _facilement_,
   _évidemment_, _bien sûr_, _il suffit de_, _veuillez noter_, _tout simplement_). If a step is easy, the reader will
   notice.
3. **No emoji [lint].** Status goes in words or in a table column.
4. **Name things as the code does.** Use the exact resource, file and command names, in backticks. Use `Pocket-Id`,
   `OpenBao`, `Talos`, `Cilium`, `CloudNative-PG` as the projects write them.
5. **Dates are ISO 8601.** `2026-10-11`, never "last Tuesday" or "recently".
6. **History is newest first.** Every dated log of a document (`Historique`, `Historique des modifications`, the
   changelog of a template) lists the most recent entry first.
7. **Kubernetes resources are code.** `PersistentVolumeClaim`, `StatefulSet`, `Pod`, `Application`: the kind of a
   resource is always in backticks.
8. **Format before committing.** Prettier wraps prose at 120 columns (`proseWrap: always`, `.prettierrc.json`); run
   `mise run lint:fix` so no paragraph stays on one long line.

## Records (ADR, post-mortem)

ADRs and post-mortems are history. When they move to the wiki:

- keep the number, the title, the decision, the timeline and the front matter exactly as written;
- fix structure and wording only: headings, links, the `Pour aller plus loin` section;
- change a status only when the repository proves it changed, and say why in the changelog section of the record;
- never rewrite a past decision to match the present: write a new ADR that supersedes it.

## Review checklist

Before opening a pull request that touches `docs/`:

- [ ] `scripts/wiki:lint` passes.
- [ ] The first paragraph answers "what is this page for?".
- [ ] Every command was run, or the page says it was not.
- [ ] Every statement about live state names the cluster and the date.
- [ ] No fact is copied from another page: a link replaces it.
- [ ] The page is written in French, with accents.
- [ ] The page is in `_Sidebar.md` and ends with `Pour aller plus loin`.
