# TrueNAS Documentation Generator

## Purpose

This module auto-generates `projects/chezmoi.sh/docs/TRUENAS.md` — an up-to-date, human-readable reference document for
`nas.chezmoi.sh` that captures operational details without hand-maintenance burden.

The core idea: the doc is **derived from the deployed Pulumi stack's own state**, not from hand-picked imports across
sibling modules. Adding a new resource (a `truenas.User`, an NFS share, a CloudSync job, …) anywhere under `../truenas/`
is enough — the next regeneration picks it up automatically, grouped by its Pulumi type token, with no import list to
maintain here. The one exception is the NFS4-ACL-template-to-dataset assignment guide (`../truenas/acls.ts`): this
provider can't apply NFS4 ACLs itself, so that pairing has no infrastructure resource of its own and travels as a
**Pulumi stack output** (`nfs4AclAssignments`, see `../truenas/index.ts`) instead — read the same generic way as every
other section, still with no import of `acls.ts`.

Generation runs standalone (`mise run truenas:docs:generate`, chained onto `pulumi:apply`), **not** as part of
`pulumi up`/`preview` itself — it reads the stack's last-applied state via `pulumi stack export`, so it always reflects
what's actually deployed, not what's about to change.

## How it works

1. **Read the deployed state**: `stack-export.ts` shells out to `pulumi stack export` (never `--show-secrets` — every
   secret output, e.g. a `truenas.User`'s `password`, stays opaque ciphertext) and `pulumi config get` (for
   `truenas:url`/`truenas:apiKey`, needed only for the live topology/dataset-tree fetch below).

2. **Extract plain data**: `extract.ts` groups the exported resource list by Pulumi type token
   (`truenas:index/user:User`, `truenas:index/shareNfs:ShareNfs`, `b2:index/bucket:Bucket`, …) and turns each group into
   the exact plain shape `template.hbs`/`partials/*.hbs` expect. URN helpers (`logicalName()`, `typeChain()`,
   `hasAncestorType()`) recover a resource's own name and pool/dataset ownership straight from its URN — the same trick
   the old `resourceName()` helper used, generalized. `extractAclAssignments()` reads the `nfs4AclAssignments` stack
   output directly.

3. **Fetch live topology/dataset state**: `generate.ts` calls `fetchTopology()`/`fetchDatasets()` from
   `@chezmoi.sh/pulumi-truenas-pool` directly (the same live, read-only JSON-RPC fetch `TrueNASPool.topology()`/
   `datasetsTree()` always used — never round-tripped through managed resource state), filtered to just the datasets
   this stack manages (`truenas:index/dataset:Dataset` resources' own `mountPoint` output), matching what the doc
   already showed before this rewrite.

4. **Render**: `render.ts` compiles `template.hbs` (with partials from `./partials/`) via Handlebars, exactly as before.
   Helpers (`helpers.ts`) are unchanged.

5. **Write**: `generate.ts` writes the rendered Markdown straight to `projects/chezmoi.sh/docs/TRUENAS.md` via
   `fs.writeFileSync` — no Pulumi resource involved.

Every list-returning `extract*` function sorts its output (alphabetically, by name/username/source) —
`pulumi stack export`'s own resource order reflects incidental state-file order, not a curated one, so without sorting
the doc would reshuffle on every regeneration even with no actual config change.

## File structure

| File                       | Purpose                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate.ts`              | Entry point (run via `mise run truenas:docs:generate`). Reads stack state, extracts data, renders, writes the doc.                                            |
| `stack-export.ts`          | Thin `pulumi` CLI wrapper: `readStackExport()` (`pulumi stack export`, never `--show-secrets`) and `readConfig()`.                                            |
| `extract.ts`               | Pure functions turning the exported resource list into the plain-data shapes the templates expect, grouped by type token.                                     |
| `extract.test.ts`          | Unit tests for every extractor + URN helper, against a hand-trimmed fixture shaped like a real `pulumi stack export`.                                         |
| `render.ts`                | `render(context)`: compiles `template.hbs` + `partials/*.hbs` via Handlebars. Shared by `generate.ts` and `render.test.ts`.                                   |
| `helpers.ts`               | Custom Handlebars helpers: `cronToHuman()` (cron fields → prose schedule), `humanList()` (arrays → "a, b and c"), `isSingular()` (singular/plural agreement). |
| `helpers.test.ts`          | Unit tests for helpers using mocha/chai. Run via `npx mocha` from the pulumi project root.                                                                    |
| `template.hbs`             | Main template structure; includes partials.                                                                                                                   |
| `partials/overview.hbs`    | TrueNAS instance overview.                                                                                                                                    |
| `partials/network.hbs`     | Network configuration (hostname, gateway, DNS, interfaces) and enabled/disabled services.                                                                     |
| `partials/pools.hbs`       | Pool topology diagrams and ZFS dataset trees.                                                                                                                 |
| `partials/shares.hbs`      | NFS and SMB shares with mount options, permissions, and purpose labels.                                                                                       |
| `partials/permissions.hbs` | Service identities, the 4 NFS4 ACL templates this stack manages, and the dataset -> template guide for manually applying them.                                |
| `partials/backups.hbs`     | B2 sync buckets, schedules, and which pools are/aren't backed up.                                                                                             |
| `partials/security.hbs`    | Security notes (e.g., share IP restrictions managed on the NAS).                                                                                              |
| `render.test.ts`           | Integration tests for full template rendering against a fixture context. Run via `npx mocha`.                                                                 |

## Regenerating the doc

```sh
mise run truenas:docs:generate
```

Already chained onto `mise run pulumi:apply` (i.e. `pulumi up`), so a normal apply keeps the doc current automatically.
Run it standalone after any out-of-band state change (e.g. a manual `pulumi refresh`).

## Extending the documentation

### Adding a new resource (e.g. a `truenas.User`, a share, a CloudSync job)

Nothing to do here — declare it under `../truenas/` as usual, apply, then regenerate. `extract.ts` picks it up by type
token automatically. The one exception: a new NFS4-ACL-template-to-dataset assignment needs a new entry in the
`allAclAssignments` array in `../truenas/index.ts` (see there), since that pairing has no infrastructure resource of its
own to derive from.

### Adding a new doc section backed by a new resource type

1. Create a new partial in `./partials/` (e.g., `partials/monitoring.hbs`).
2. Add a placeholder in `template.hbs`: `{{> monitoring}}`.
3. Add an `extract*` function in `extract.ts` (plus a unit test in `extract.test.ts`) grouping the new resource type
   into the plain shape the partial needs.
4. Wire it into `generate.ts`'s context object.
5. Add an integration test in `render.test.ts` to verify the section renders correctly.

### Adding a new Handlebars helper

1. Write the helper function in `helpers.ts` (e.g., `export function myHelper(...): string`).
2. Register it in `registerHelpers()`: `handlebars.registerHelper("myHelper", ...)`.
3. Add unit tests in `helpers.test.ts` covering realistic input from the config.
4. Use the helper in a partial via `{{myHelper arg1 arg2}}`.

### Testing

Run tests from the Pulumi project root:

```sh
npx mocha
```

`helpers.test.ts`, `extract.test.ts`, and `render.test.ts` all use mocha + chai. New helpers or sections should include
tests — follow the existing pattern in each file. None of these touch the network or `child_process` — `stack-export.ts`
is deliberately thin (exec + `JSON.parse`) and untested directly; everything it feeds is exercised through
`extract.test.ts`'s fixture instead.

## Generated output

See `projects/chezmoi.sh/docs/TRUENAS.md` for the rendered documentation.
