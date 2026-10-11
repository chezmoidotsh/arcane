# Arcane wiki style guide

Rules for every page under `wiki/`. They are adapted from the `axnic/rtunk` wiki style guide to an infrastructure
repository, where a page is often read during an incident and a wrong sentence costs more than a missing one.

Rules marked **[lint]** are checked by `scripts/wiki:lint` and fail the pull request. The others are a review checklist.

## Structure

1. **One topic per page.** If the title needs "and", split the page. Link instead of copying.
2. **One `# Title` per page [lint].** The title matches the file name: `Bootstrap-Lungmen.md` is titled
   `# Bootstrap Lungmen`. Hyphens in the file name become spaces; case is ignored.
3. **Short version first.** The first paragraph says what the page is for and what the reader will have done or learned
   at the end. A reader who stops after the first screen still gets the answer.
4. **Motivation before mechanics.** Say why before how: one or two sentences, then the steps or the facts.
5. **Example before explanation.** Show the command, the manifest or the output first, then comment on it.
6. **End with `## Where to go next` [lint].** Two to five links, each with a one-line lead. No page is a dead end.
   `Home`, `_Sidebar` and `_Footer` are exempt.
7. **Shallow headings.** Use `##` and `###` only. A page that needs `####` is two pages.

## Naming and navigation

1. **The wiki is flat [lint].** GitHub Wiki addresses pages by file name alone, so a subdirectory only creates name
   collisions. Binary assets go in `wiki/assets/` and nothing else.
2. **File names use `Title-Case-With-Hyphens.md` [lint].** Letters, digits and hyphens only: no dots, spaces,
   underscores or non-ASCII characters. Exceptions are `Home.md`, `_Sidebar.md` and `_Footer.md`.
3. **The name signals the page type.** Guides start with a verb (`Bootstrap-Lungmen`, `Recover-OpenBao`), references end
   with `-Reference` (`IPAM-Reference`). Records keep their identifier: `ADR-014-Network-Topology`,
   `Procedure-BKP-20260723-00-Restore-CNPG-From-Object-Store`, `Incident-2026-05-30-CNPG-WAL-Disk-Full`.
4. **Every page is reachable from `_Sidebar.md` [lint].** The sidebar is curated by what the reader is trying to do
   (get started, operate, recover, reference, internals), not by file type. Records (ADR, incidents) are grouped under
   their own heading and listed in order.
5. **Links use the wiki form [lint].** Write `[IPAM](IPAM-Reference)`, never `IPAM-Reference.md`: the wiki resolves page
   names and the publication workflow does not rewrite links. A link to a section is `[x](Page#section)`. A link to the
   code is an absolute URL on `main` (`https://github.com/chezmoidotsh/arcane/blob/main/<path>`), so it keeps working
   from the wiki.

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
7. **Admonitions are for exceptions.** At most three per page (`> [!NOTE]`, `> [!WARNING]`). A page full of warnings
   has none.
8. **Never put a secret in a page.** Name the OpenBao path or the SOPS file, never the value.

## Voice

1. **Plain, present tense, active voice.** "The script renders `dist/`", not "`dist/` will be rendered by the script".
2. **No filler [lint].** Cut _simply_, _just_, _easily_, _basically_, _obviously_, _of course_, _please note_. If a step
   is easy, the reader will notice.
3. **No emoji [lint].** Status goes in words or in a table column.
4. **Name things as the code does.** Use the exact resource, file and command names, in backticks. Use `Pocket-Id`,
   `OpenBao`, `Talos`, `Cilium`, `CloudNative-PG` as the projects write them.
5. **Dates are ISO 8601.** `2026-10-11`, never "last Tuesday" or "recently".

## Records (ADR, post-mortem)

ADRs and post-mortems are history. When they move to the wiki:

- keep the number, the title, the decision, the timeline and the front matter exactly as written;
- fix structure and wording only: headings, links, the `Where to go next` section;
- change a status only when the repository proves it changed, and say why in the changelog section of the record;
- never rewrite a past decision to match the present: write a new ADR that supersedes it.

## Review checklist

Before opening a pull request that touches `wiki/`:

- [ ] `scripts/wiki:lint` passes.
- [ ] The first paragraph answers "what is this page for?".
- [ ] Every command was run, or the page says it was not.
- [ ] Every statement about live state names the cluster and the date.
- [ ] No fact is copied from another page: a link replaces it.
- [ ] The page is in `_Sidebar.md` and ends with `Where to go next`.
