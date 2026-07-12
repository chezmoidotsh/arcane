# TrueNAS Documentation Generator

## Purpose

This module auto-generates `projects/chezmoi.sh/docs/TRUENAS.md` — an up-to-date, human-readable reference document for
`nas.chezmoi.sh` that captures operational details without hand-maintenance burden.

The core idea: the doc is **generated from the same as-code config that provisions the NAS**. It imports configuration
directly from sibling modules (`../truenas/` and `../backups.ts`), compiles it into Markdown via Handlebars templates,
and writes the output via a Pulumi `LocalFile` resource on every `pulumi up`. This structural coupling guarantees the
doc cannot drift out of sync — if the config changes, the doc regenerates automatically.

## How it works

1. **Data sourcing**: Imports the live TrueNAS configuration from:
   - `../truenas/network` — hostname, gateway, nameservers, network interfaces
   - `../truenas/services` — enabled/disabled service list (SSH, CIFS, NFS, …)
   - `../truenas/shares` — NFS and SMB shares with comments, permissions, mapall users
   - `../truenas/acls` and `../truenas/users/*` — NFS4 ACL templates, the service identities they're meant for, and
     which dataset each template should be applied to by hand
   - `../truenas/zpools/zp1cs01` and `../truenas/zpools/zp1hs01` — pool names, topology diagrams, ZFS dataset trees
   - `../backups.ts` — B2 bucket definitions and sync schedules

2. **Template rendering**: Compiles `template.hbs` (the main template) with partials from `./partials/` using
   Handlebars. Custom helpers translate raw TrueNAS data into human-friendly prose (e.g., cron fields → "weekly, Sundays
   at 00:00").

3. **Output**: Writes the rendered Markdown to `projects/chezmoi.sh/docs/TRUENAS.md` via a Pulumi `LocalFile` resource.

## File structure

| File                       | Purpose                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                 | Entry point. Registers helpers, loads template and partials, gathers config data, renders template, writes output via `LocalFile`.                            |
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

## Extending the documentation

### Adding a new section

1. Create a new partial in `./partials/` (e.g., `partials/monitoring.hbs`).
2. Add a placeholder in `template.hbs`: `{{> monitoring}}`.
3. Update `index.ts` to gather and pass any required data.
4. Add an integration test in `render.test.ts` to verify the section renders correctly.

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

Both `helpers.test.ts` and `render.test.ts` use mocha + chai. New helpers or sections should include tests—follow the
existing pattern in each file.

## Generated output

See `projects/chezmoi.sh/docs/TRUENAS.md` for the rendered documentation.
