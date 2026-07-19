# Proxmox VE Documentation Generator

## Purpose

This module auto-generates `projects/chezmoi.sh/docs/PROXMOX-VE.md` — an up-to-date reference for
`pve-01.pve.chezmoi.sh` derived from the deployed Pulumi stack's own state, not from hand-picked imports. It follows the
same architecture as [`../truenas-docs/`](../truenas-docs/) and [`../pbs-docs/`](../pbs-docs/), with two additions those
two don't have: a **derive layer** and a **static host facts file**.

Adding a resource anywhere under `../../stack/proxmox/` is enough — the next regeneration picks it up by Pulumi type
token, with no import list to maintain here.

## The three kinds of content

The thing this generator is built around: a document assembled purely from facts reads like a report, and a document
written by hand rots. Every sentence in the output belongs to exactly one of these tiers.

| Tier          | Example                                               | Lives in                                     | Stays true because           |
| ------------- | ----------------------------------------------------- | -------------------------------------------- | ---------------------------- |
| **Fact**      | the ACL bindings table                                | `extract/` → template                        | it is read from state        |
| **Derived**   | "Three identities authenticate with an API token (…)" | `derive.ts` → helper                         | it is recomputed per run     |
| **Rationale** | "Only the ports every Talos node needs are here …"    | `templates/partials.<section>.<subject>.hbs` | it is guarded on its subject |
| **Framing**   | "Pool membership _is_ the permission"                 | `templates/`                                 | it states an invariant       |

**The rule that keeps the document honest: static prose in `templates/` may state an invariant or a rationale, but never
a count, a name, or a list.** "Three identities" rots the moment a fourth appears, so it is derived. "Pool membership is
the permission" holds regardless of how many pools exist, so it can be written by hand.

Anything conditional follows the same logic: the caution callout about pool membership is emitted only for pools an ACL
actually references, so it disappears on its own if the grant that justified it goes away.

### One line in the stack, a paragraph in a partial

**One line — the resource's `comment`.** `VirtualEnvironmentUser`, `UserToken`, `VirtualEnvironmentPool`,
`VirtualEnvironmentClusterFirewallSecurityGroup` and each of its rules carry a `comment` that flows through state into
this document. It fills the Purpose columns. A resource declared without one renders `—`; that dash is the signal to go
write the comment in the stack, not to hard-code prose here.

**A paragraph — a subject partial.** Longer rationale ("why is this Security Group so minimal?") is too long for a
`comment`, which surfaces in the Proxmox web UI. It lives in a partial named after its subject —
`templates/partials.firewall.talos.hbs` — included from the section partial **inside that resource's loop iteration**,
guarded on the subject:

```hbs
{{#each securityGroups}}
### `{{name}}`
… table …
{{#if (eq name "talos")}}{{> [firewall.talos]}}{{/if}}
{{/each}}
```

The guard is what keeps the prose honest. It renders under the heading it belongs to, and if `talos` is ever renamed or
removed the paragraph stops rendering rather than silently attaching to a sibling it was never written about —
`render.test.ts` asserts both. A partial with no matching subject is a visible orphan.

Rationale is documentation, so it lives with the documentation: editing it is editing a template, with no `pulumi up`
and no round-trip through state.

## How it works

1. **Read deployed state** — `stack-export.ts` shells out to `pulumi stack export` (never `--show-secrets`) and
   `pulumi config get proxmox:endpoint`.
2. **Extract plain data** — one file per resource type under `extract/`, each keyed on a single Pulumi type token.
3. **Derive cross-resource statements** — `derive.ts` answers what no single resource can: which pool is an enforcement
   boundary (pools × ACLs), which identity has no token (users × tokens), how subnets nest under zones.
4. **Render** — `render.ts` compiles `templates/root.hbs` with every `templates/partials.*.hbs`.
5. **Write** — `index.ts` writes the Markdown to `projects/chezmoi.sh/docs/PROXMOX-VE.md`.

Every list-returning extractor sorts its output, so the document does not reshuffle between runs on incidental
state-file ordering. The one exception is firewall rules: their order **is** their evaluation order, so
`extract/security-group.ts` preserves it deliberately.

## Two provider quirks worth knowing

**Empty strings, not `undefined`.** The bridged provider emits `""` for every unset string field (`macro: ""`,
`dport: ""`, …). A plain `??` never falls back — `"" ?? "ACCEPT"` is `""` — which silently renders blank table cells.
Route every optional string from state through `extract/index.ts`'s `text()` helper.

**A credential the provider does not mark secret.** `AcmeDnsPlugin`'s `data` map holds the Cloudflare DNS-01 API token,
and unlike `UserToken.value` or `StoragePbs.password` it is **not** an additional secret output — so
`pulumi stack export` returns it in plaintext. `extract/acme-dns-plugin.ts` never reads that field at all, and
`render.test.ts` asserts a fixture token never reaches rendered output.

## File structure

| Path                                         | Purpose                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `index.ts`                                   | Entry point (`pnpm run proxmox:docs`). Reads state, builds the context, renders, writes.         |
| `stack-export.ts`                            | Thin `pulumi` CLI wrapper: `readStackExport()`, `readConfig()`, `readOptionalConfig()`.          |
| `host.ts`                                    | Facts the provider cannot know: chassis/board/CPU/RAM references and the host bridges.           |
| `derive.ts`                                  | Cross-resource derivations — the layer the prose is built on.                                    |
| `render.ts`                                  | Compiles `templates/root.hbs` + `templates/partials.*.hbs`.                                      |
| `extract/index.ts`                           | Shared plumbing (`out`, `text`, `byKey`, `resourcesOfType`) plus the barrel re-export.           |
| `extract/<resource>.ts`                      | One file per Pulumi resource type; knows its type token and nothing about the others.            |
| `helpers/<helper>.ts`                        | One Handlebars helper per file; `helpers/index.ts` registers them.                               |
| `templates/root.hbs`                         | Document skeleton; includes the partials.                                                        |
| `templates/partials.<section>.hbs`           | One section each. `partials.access.hbs` registers as `{{> access}}`.                             |
| `templates/partials.<section>.<subject>.hbs` | Rationale for one named resource, included under its own heading.                                |
| `fixture.ts`                                 | Shared fixture shaped like a real export, including the provider's empty-string quirk.           |
| `*.test.ts`                                  | Unit tests for extractors, derivations and helpers; `render.test.ts` renders the whole document. |

## Regenerating

```sh
mise run proxmox:docs:generate
```

Already chained onto `mise run pulumi:apply`, so a normal apply keeps the document current. Run it standalone after any
out-of-band state change (e.g. a manual `pulumi refresh`).

**Safety net:** if `proxmox:endpoint` is unset, `index.ts` logs and exits cleanly instead of failing — `pulumi:apply`'s
post-task chain covers the whole shared stack, so a hard failure here would block applies for
observability/omni/truenas/zot-registry too.

## Extending

### Adding a resource of a type already covered

Nothing to do here — declare it under `../../stack/proxmox/`, apply, regenerate. Give it a `comment`.

### Adding a new resource type

1. Add `extract/<resource>.ts` with its type token and plain shape, and re-export it from `extract/index.ts`.
2. If it needs a cross-resource statement, add the derivation to `derive.ts` — never to an extractor.
3. Add `templates/partials.<section>.hbs` and reference it from `root.hbs`.
4. Wire it into `buildContext()` in `index.ts`.
5. Extend `fixture.ts`, then cover it in `extract.test.ts` / `derive.test.ts` / `render.test.ts`.

If the resource carries a field that is sensitive in practice but not marked secret by the provider, follow
`extract/acme-dns-plugin.ts`: never read it, and assert its absence in `render.test.ts`.

### Adding a helper

One file per helper under `helpers/`, registered in `helpers/index.ts`, tested in `helpers.test.ts`. Use triple braces
(`{{{helper …}}}`) for anything whose output contains characters Handlebars would HTML-escape — apostrophes and em
dashes are common in `comment` fields.

### Testing

```sh
npx mocha
```

## Generated output

See [`projects/chezmoi.sh/docs/PROXMOX-VE.md`](../../../../docs/PROXMOX-VE.md).
