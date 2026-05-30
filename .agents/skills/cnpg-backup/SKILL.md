---
name: cnpg-backup
description: Use this skill whenever the user wants an on-demand CloudNative-PG (CNPG) backup in this Arcane repository — phrases like "backup pocket-id", "backup openbao", "backup atuin", "backup paperless", "backup the apps database", or "backup all postgres in lungmen". Also use it when the user names a logical database (atuin, n8n, immich, paperless, forgejo, linkding, …) without knowing which CNPG cluster owns it. Discover the matching cluster from `projects/` via the bundled discovery script, map it to a kubectl context, require explicit confirmation, then create and verify a plugin-based Backup.
compatibility: Requires `kubectl`, plus `yq` (v4+), `jq`, and `rg` for discovery. `yq` is installed via `mise` in this repo — run the discovery script with `mise exec --` if `yq` is not on the system PATH. The `kubectl cnpg` plugin is optional; the manifest fallback works without it.
---

# CNPG Backup

This skill produces an **ad-hoc, plugin-based `Backup`** against the CNPG clusters declared
in this repository. It is intentionally narrow: backup creation only, plugin method only.

## When to use this skill

Trigger on user requests like:

* "back up pocket-id", "backup openbao", "snapshot the vault database"
* "back up atuin / paperless / immich / forgejo / linkding" (logical DBs in mutualized clusters)
* "back up all CNPG databases in lungmen.akn"
* "I need a backup before this migration" when the target is a Postgres workload here

## When NOT to use this skill

These look adjacent but need a different flow — say so and stop:

* **MongoDB / Percona** (e.g. some Immich deployments use it) → Percona Operator backup, not CNPG.
* **Velero / namespace snapshots** → Velero CLI, not CNPG.
* **Restore from a backup** → restore is a distinct workflow (bootstrap a new cluster from an `ObjectStore`); do not improvise it here.
* **Scheduling or modifying retention** → that lives in the `ScheduledBackup` and `ObjectStore` manifests in Git; route through a PR, not an ad-hoc command.
* **Application-level dumps** (`pg_dump` for a single table or schema) → use `kubectl exec` + `pg_dump`; this skill creates physical backups.

## Workflow

1. **Discover** candidates by running the bundled script.
2. **Filter** candidates from the user's wording (cluster, app, logical DB, project, namespace).
3. **Resolve** the kubectl context for each surviving candidate.
4. **Confirm** the exact targets with `ask_user` before any write action.
5. **Validate** the live cluster (exists, healthy, plugin-capable).
6. **Create** one on-demand plugin backup per confirmed target.
7. **Verify** the resulting `Backup` and report status per target.

## Step 0 — Target resolution order

**Run discovery before asking the user anything.** The order matters:

1. Run the discovery script (Step 1).
2. If the user already named a target in their message, apply Step 2 filtering immediately.
3. If no target was stated, present the discovered clusters/apps as `ask_user` choices and
   wait for the user to pick. Do **not** ask a free-form "which database?" question — the
   user cannot be expected to know internal cluster names like `pocket-id-20260530`.

Example `ask_user` when no target is given:

```text
Which cluster or app would you like to back up?

Choices derived from discovery:
  - pocket-id  (amiya.akn / pocket-id)
  - openbao    (amiya.akn / vault)
  - atuin      (lungmen.akn / databases — mutualized with n8n, linkding, forgejo)
  - n8n        (lungmen.akn / databases — mutualized with atuin, linkding, forgejo)
  - …
```

Surface **app-level names** (logical databases and app\_dir values) as choices, not raw
cluster names — the user thinks in terms of "pocket-id", not "pocket-id-20260530".

## Step 1 — Discover

Run the bundled discovery script from the repository root. It scans only `dist/`
directories (the rendered, ArgoCD-applied state), producing one entry per unique cluster
with no duplicates. Logical databases are derived from `Database` objects in the same
`dist/` directory.

```bash
# yq is installed via mise — use mise exec if yq is not on the system PATH
mise exec -- .agents/skills/cnpg-backup/scripts/discover-cnpg.sh                # all candidates
mise exec -- .agents/skills/cnpg-backup/scripts/discover-cnpg.sh lungmen.akn    # scope to one project
```

Each entry has this shape:

```json
{
  "cluster_name": "apps-20260329",
  "project": "lungmen.akn",
  "namespace": "databases",
  "namespace_source": "kustomization",
  "app_dir": "databases",
  "source": "mutualized",
  "plugin_enabled": true,
  "logical_databases": ["atuin", "n8n", "linkding", "forgejo"],
  "manifest_path": "projects/lungmen.akn/dist/apps/databases/postgresql.cnpg.io.v1.Cluster.apps-20260329.yaml",
  "context_hint": "admin@lungmen.akn"
}
```

**Why a script and not hand-rolled `rg`/`yq` each time:** cluster names embed a generation
suffix (e.g. `apps-20260329`) that changes when the cluster is rebuilt, and the
logical-database list drifts as apps are added or moved between mutualized cluster tiers.
Hardcoding any of these names in the skill would rot silently. The script is the source of
truth — never paste cluster names from memory or from old transcripts.

If discovery returns nothing, stop and surface that to the user. Do not fall back to
guessing.

## Step 2 — Filter and rank

Normalize the user's wording to lowercase. Match against the script's fields in this
priority order:

1. Exact `cluster_name` match
2. Exact `logical_databases[]` member match (resolves "backup atuin" to the right cluster)
3. Exact `app_dir` or `project` match
4. **Prefix or substring of `cluster_name`** — this is the common case: users say
   "pocket-id" when the actual cluster is "pocket-id-20260530". Match any candidate whose
   `cluster_name` or `app_dir` starts with or contains the user's term.

Example: user says "pocket-id" → matches `cluster_name: pocket-id-20260530` via prefix.
Example: user says "openbao" → matches `app_dir: vault` via `logical_databases` or
`cluster_name: openbao-database` via substring.

Tie-breaking: if multiple candidates remain after exact matching, surface them all in the
confirmation step. If the user says "all" or "everything" for a project, keep every
candidate for that project. If nothing matches, present the closest candidates and ask
instead of guessing.

## Step 3 — Resolve the kubectl context

The `context_hint` (`admin@<project>`) is a hint, not a guarantee. Validate against the
actual contexts on the machine:

```bash
kubectl config get-contexts -o name
```

Prefer in this order: exact `context_hint`, then exact project name, then a single context
whose name contains the project. If several plausible contexts remain, ask the user to
pick one. If none match, stop and report which project lacks a usable context — do not
try to create the backup against a wrong context.

## Step 4 — Confirm with `ask_user`

Confirmation is mandatory and must list the exact targets. A plain-text "OK to proceed?"
is not enough — the `ask_user` tool gives the user a deliberate yes/no surface and creates
a clean record of consent.

Single target:

```text
I found CNPG cluster `pocket-id-database` in namespace `pocket-id` on context
`admin@amiya.akn`. Create an on-demand plugin backup for it?
```

Multiple targets — always enumerate:

```text
I found these CNPG clusters in lungmen.akn:

1. apps-20260329          ns=databases  ctx=admin@lungmen.akn  dbs=atuin,n8n,linkding,forgejo
2. apps-secured-20260329  ns=databases  ctx=admin@lungmen.akn  dbs=immich,paperless

Which should I back up? (one, several, or "all")
```

If the request is ambiguous, present the ranked candidates and ask. Picking one silently
is the failure mode this skill exists to prevent.

## Step 5 — Validate the live cluster

For each confirmed target, run the bundled validation script:

```bash
.agents/skills/cnpg-backup/scripts/validate-cnpg.sh <cluster_name> <namespace> <context>
```

The script checks that the cluster exists, is in healthy state, and has the
`barman-cloud.cloudnative-pg.io` plugin enabled. It exits non-zero with a clear error
message if any check fails — stop for that target and surface the reason to the user.

Proceed only after the script exits 0. This skill is plugin-only on purpose: the
deprecated `barmanObjectStore` method is out of scope and must not be used as a fallback.

## Step 6 — Create the backup

Run the bundled backup script. It applies a plugin `Backup` manifest with a
timestamp-based name, prints the created `Backup` name on stdout, and exits non-zero on
failure.

```bash
backup_name="$(.agents/skills/cnpg-backup/scripts/backup-cnpg.sh \
  <cluster_name> <namespace> <context>)"
```

Capture the printed name — it is required for Step 7.

## Step 7 — Verify

Wait a few seconds, then run the bundled verification script with the name printed by
Step 6:

```bash
sleep 5
.agents/skills/cnpg-backup/scripts/verify-cnpg.sh <backup_name> <namespace> <context>
```

The script reports `COMPLETED`, `RUNNING` (with a watch command), or `FAILED` (with a
describe command), and exits non-zero on failure.

## Storage, retention, and lifecycle

A backup created by this skill lands in the S3 bucket referenced by the cluster's
`ObjectStore` (see `*.objectstore.yaml` next to the cluster manifest). Two things the user
should know once the backup is running:

* **On-demand backups are not garbage-collected by `ScheduledBackup` retention.** The
  `ScheduledBackup`'s `retentionPolicy` applies to its own scheduled backups, not to
  ad-hoc ones. If this backup was created for a one-shot purpose (pre-migration, etc.),
  the user is responsible for deleting the `Backup` object once it's no longer needed:
  `kubectl delete backup.postgresql.cnpg.io <backup_name> -n <namespace> --context <context>`.
* **Deleting the `Backup` object does not always delete the bucket data** — that depends
  on the plugin's `retentionPolicy` and the `ObjectStore` config. Mention this when the
  user explicitly asks about cleanup.

## Output expectations

When the work is done, summarize per target in a compact list:

* cluster name
* namespace
* context
* backup name
* status (`running` / `completed` / `failed`)
* one follow-up command if still in progress

If some targets succeeded and others failed, say so explicitly. A blanket "all good" when
one target failed is the worst possible outcome.

## Guardrails — and why they matter

These aren't bureaucratic checkboxes; each one prevents a specific concrete failure:

* **Always confirm with `ask_user` before writing.** Even when only one candidate matches,
  the confirmation gives the user a clean way to abort if they realize they meant a
  different cluster — and it creates a record. Backups are cheap; surprise backups against
  the wrong cluster waste an admin's time chasing phantom artifacts.
* **Never edit a `ScheduledBackup` to create an ad-hoc backup.** `ScheduledBackup` is
  rendered from a Helm chart and managed by ArgoCD; manual edits create a drift the next
  reconciliation will revert, which is confusing and noisy. The on-demand `Backup`
  resource is the correct primitive.
* **Don't infer namespaces from filenames when `kustomization.yaml` declares one.** The
  declared namespace is what ArgoCD applies; guessing from a path is how you end up
  creating a `Backup` in the wrong namespace where it sits orphaned.
* **Don't back up "everything" without an explicit global request.** A user saying
  "backup pocket-id" doesn't mean "backup everything in amiya". When in doubt, narrow.
* **Don't fall back to `barmanObjectStore`.** It's deprecated. If the plugin path fails,
  surface the failure to the user — fixing the cluster's plugin config is the right
  remediation, not bypassing it.
* **One backup per explicit target, one command per backup.** Avoid loops or wrappers that
  fire several `kubectl apply`s the user can't easily inspect. The user should be able to
  read each command before it runs.

## Example requests

* `backup pocket-id database`
* `backup openbao in amiya`
* `backup atuin in lungmen` (resolves via mutualized logical-DB lookup)
* `backup paperless` (resolves to the `apps-secured-*` cluster, not `apps-*`)
* `backup all CNPG databases in lungmen.akn`
