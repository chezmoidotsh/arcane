# PBS Documentation Generator

## Purpose

This module auto-generates `projects/chezmoi.sh/docs/PROXMOX_BACKUP_SERVER.md` — an up-to-date, human-readable reference
document for `pbs.pve.chezmoi.sh` that captures operational details without hand-maintenance burden. It mirrors
[`../truenas-docs/`](../truenas-docs/) — same architecture, same safety properties — scaled down to what `stack/pbs/`
actually manages: no live topology/dataset-tree fetch, since Proxmox Backup Server has no ZFS-pool equivalent to walk.

The core idea: the doc is **derived from the deployed Pulumi stack's own state**, not from hand-picked imports across
sibling modules. Adding a new resource (a `pbs.PruneJob`, a notification target, an ACL binding, …) anywhere under
`../../stack/pbs/` is enough — the next regeneration picks it up automatically, grouped by its Pulumi type token, with
no import list to maintain here.

Generation runs standalone (`mise run pbs:docs:generate`, chained onto `pulumi:apply`), **not** as part of
`pulumi up`/`preview` itself — it reads the stack's last-applied state via `pulumi stack export`, so it always reflects
what's actually deployed, not what's about to change.

## How it works

1. **Read the deployed state**: `stack-export.ts` shells out to `pulumi stack export` (never `--show-secrets` — every
   secret output, e.g. a `pbs.ApiToken`'s one-time `value`, stays opaque ciphertext) and
   `pulumi config get pbs:endpoint` (for the overview section's "reachable at" line — not a secret, unlike
   `pbs:apiToken`, which this generator never reads).

2. **Extract plain data**: `extract.ts` groups the exported resource list by Pulumi type token
   (`pbs:index/datastore:Datastore`, `pbs:index/namespace:Namespace`, `pbs:index/pruneJob:PruneJob`, …) and turns each
   group into the exact plain shape `template.hbs`/`partials/*.hbs` expect. `generate.ts` then joins
   `extractNamespaces()`'s output onto each datastore by `store` name, since a namespace belongs to exactly one
   datastore and the template renders them nested underneath it.

3. **Render**: `render.ts` compiles `template.hbs` (with partials from `./partials/`) via Handlebars — byte-identical
   logic to `../truenas-docs/render.ts`.

4. **Write**: `generate.ts` writes the rendered Markdown straight to `projects/chezmoi.sh/docs/PROXMOX_BACKUP_SERVER.md`
   via `fs.writeFileSync` — no Pulumi resource involved.

Every list-returning `extract*` function sorts its output (alphabetically, by name/ID/path) — `pulumi stack export`'s
own resource order reflects incidental state-file order, not a curated one, so without sorting the doc would reshuffle
on every regeneration even with no actual config change.

## A secret this provider doesn't mark as secret

`pbs.WebhookNotification`'s `url` field (a Slack incoming-webhook URL, sensitive in practice — anyone holding it can
post to the channel) is **not** in the `yavasura/pbs` provider's own `additionalSecretOutputs` list (only
`WebhookNotification`'s `secret` field, the HMAC signing key, is — see `../../stack/pbs/notifications.ts`'s constructor
call and `catalog/pulumi/sdks/pbs/webhookNotification.ts`). That means `pulumi stack export` returns it in
**plaintext**, unlike a `pbs.ApiToken`'s `value`.

`extractNotificationTargets` (`extract.ts`) is written defensively around this: it never reads `outputs.url` (or the
equivalent field on `gotifyNotification`/`smtpNotification`/`sendmailNotification`, in case one of those is added later)
at all. The generated doc names _that a target exists and what kind it is_, never where it points. `render.test.ts`
asserts the known webhook host never appears in rendered output, as a regression guard.

## File structure

| File                           | Purpose                                                                                                                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate.ts`                  | Entry point (run via `mise run pbs:docs:generate`). Reads stack state, extracts data, joins namespaces onto their owning datastore, renders, writes the doc.                                                                                 |
| `stack-export.ts`              | Thin `pulumi` CLI wrapper: `readStackExport()` (`pulumi stack export`, never `--show-secrets`), `readConfig()`, `readOptionalConfig()`.                                                                                                      |
| `extract.ts`                   | Pure functions turning the exported resource list into the plain-data shapes the templates expect, grouped by type token. Each extractor covers exactly one resource type — the datastore/namespace join happens in `generate.ts`, not here. |
| `extract.test.ts`              | Unit tests for every extractor, against a hand-trimmed fixture shaped like a real `pulumi stack export`.                                                                                                                                     |
| `render.ts`                    | `render(context)`: compiles `template.hbs` + `partials/*.hbs` via Handlebars. Shared by `generate.ts` and `render.test.ts`.                                                                                                                  |
| `helpers.ts`                   | Custom Handlebars helpers: `humanList()` (arrays → "a, b and c"), `isSingular()` (singular/plural agreement).                                                                                                                                |
| `helpers.test.ts`              | Unit tests for helpers using mocha/chai.                                                                                                                                                                                                     |
| `template.hbs`                 | Main template structure; includes partials.                                                                                                                                                                                                  |
| `partials/overview.hbs`        | PBS instance overview: what it's for, that it runs as a Proxmox VE VM, and the live datastore count.                                                                                                                                         |
| `partials/glossary.hbs`        | Static "Key terms" primer (datastore, namespace, chunk, prune, GC, verify, notification target/matcher) — not data-driven, read once by anyone unfamiliar with PBS before the data-driven sections below.                                    |
| `partials/datastore.hbs`       | Each datastore's S3 backend, local cache path, GC schedule, notification delivery mode, and its namespaces.                                                                                                                                  |
| `partials/retention.hbs`       | Prune jobs (retention summary per job) and verify jobs (schedule, outdated-after window).                                                                                                                                                    |
| `partials/notifications.hbs`   | Notification targets (name + kind only — see "A secret this provider doesn't mark as secret" above) and their routing matchers.                                                                                                              |
| `partials/access.hbs`          | Users, API tokens (never their one-time secret), and the ACL bindings table.                                                                                                                                                                 |
| `partials/pve-integration.hbs` | Per-datastore, copy-pasteable instructions (UI and `pvesm add` CLI) for adding it as Proxmox VE storage, referencing its namespaces.                                                                                                         |
| `render.test.ts`               | Integration tests for full template rendering against a fixture context. Run via `npx mocha`.                                                                                                                                                |

## Regenerating the doc

```sh
mise run pbs:docs:generate
```

Already chained onto `mise run pulumi:apply` (i.e. `pulumi up`), so a normal apply keeps the doc current automatically.
Run it standalone after any out-of-band state change (e.g. a manual `pulumi refresh`).

**Safety net:** if `pbs:endpoint` is ever unset (see `../../stack/pbs/README.md`, "Bootstrapping"), `generate.ts` logs a
message and exits cleanly instead of failing — `pulumi:apply`'s post-task chain covers the whole shared stack
(`observability`/`omni`/`truenas`/`zot-registry`), not just PBS, so a hard failure here would block applies to all of
them. `docs/PROXMOX_BACKUP_SERVER.md` simply stays as its last-written state until the next successful regeneration.

## Extending the documentation

### Adding a new resource (e.g. a second `pbs.Datastore`, another `pbs.PruneJob`)

Nothing to do here — declare it under `../../stack/pbs/` as usual, apply, then regenerate. `extract.ts` picks it up by
type token automatically.

### Adding a new doc section backed by a new resource type

1. Create a new partial in `./partials/` (e.g., `partials/remotes.hbs`, for `pbs.Remote` sync targets).
2. Add a placeholder in `template.hbs`: `{{> remotes}}`.
3. Add an `extract*` function in `extract.ts` (plus a unit test in `extract.test.ts`) grouping the new resource type
   into the plain shape the partial needs. If the resource carries a field that is sensitive in practice but not marked
   as a Pulumi secret output by the provider, follow `extractNotificationTargets`'s example: never read that field at
   all.
4. Wire it into `generate.ts`'s context object.
5. Add an integration test in `render.test.ts` to verify the section renders correctly.

### Adding a new Handlebars helper

1. Write the helper function in `helpers.ts` (e.g., `export function myHelper(...): string`).
2. Register it in `registerHelpers()`: `handlebars.registerHelper("myHelper", ...)`.
3. Add unit tests in `helpers.test.ts` covering realistic input from the config.
4. Use the helper in a partial via `{{myHelper arg1 arg2}}`. Use triple braces (`{{{myHelper ...}}}`) if the output
   contains characters Handlebars' default HTML-escaping would otherwise mangle (e.g. `=` in `extractPruneJobs`'s
   precomputed `retentionSummary` string — see `partials/retention.hbs`).

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

See `projects/chezmoi.sh/docs/PROXMOX_BACKUP_SERVER.md` for the rendered documentation.
