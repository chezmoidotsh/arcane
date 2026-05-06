---
name: cnpg-backup
description: Use this skill whenever the user wants an on-demand CloudNative-PG or CNPG backup in this Arcane repository, mentions backing up a PostgreSQL app or cluster such as pocket-id, openbao, jellyseerr, apps, or apps-secured, or needs help figuring out which CNPG cluster owns a logical database like atuin or paperless. Discover the matching cluster from `projects/`, map it to the right kubectl context, require explicit confirmation, then create and verify a plugin-based backup.
compatibility: Requires `kubectl` with the CloudNativePG plugin (`kubectl cnpg`) and `yq`.
---

# CNPG Backup Skill

Use this skill for ad-hoc backup requests against the CNPG clusters declared in this repository.

The repository currently contains two CNPG layouts you must handle:

1. **Dedicated clusters** declared as `postgresql.cnpg.io/v1` `Cluster` manifests, such as `pocket-id-database`, `openbao`, and `jellyseerr-database`.
2. **Mutualized clusters** rendered from the `mutualized-cnpg-databases` Helm chart, such as `apps-20260329` and `apps-secured-20260329` under `projects/lungmen.akn/src/apps/databases/`.

Work from repository declarations first, then live-cluster validation, then backup creation.

## High-level workflow

1. Discover candidate CNPG clusters from `projects/`.
2. Filter and rank the candidates from the user's wording.
3. Resolve the Kubernetes context for each surviving candidate.
4. Ask for explicit confirmation with `ask_user` before any write action.
5. Validate the live cluster and confirm plugin-based backup capability.
6. Create one on-demand backup per confirmed cluster.
7. Verify the resulting `Backup` object and report the status.

## Discovery rules

Prefer repository-aware search tools such as `rg`, `glob`, and `view` for file discovery. Use shell commands only when you need `kubectl`, `yq`, or compact shell pipelines.

Never guess from memory when the repository can answer the question.

### 1. Dedicated CNPG `Cluster` manifests

Search under `projects/` for YAML files that are actual CNPG `Cluster` resources. Ignore unrelated `ClusterRole`, `ClusterSecretStore`, `ScheduledBackup`, and `ObjectStore` manifests.

One reliable shell pattern is:

```bash
rg -l 'apiVersion:\s*postgresql\.cnpg\.io/v1' projects -g '*.yaml' -g '*.yml' | while read -r file; do
  yq 'select(.kind == "Cluster") | .metadata.name' "$file" >/dev/null 2>&1 && printf '%s\n' "$file"
done
```

For each matching manifest, record:

* `cluster_name`: `yq 'select(.kind == "Cluster") | .metadata.name' <file>`
* `project`: first path component after `projects/`
* `app_dir`: directory containing the manifest, for example `pocket-id`, `vault`, or `jellyseerr`
* `namespace`: `yq '.namespace // ""' <same-dir>/kustomization.yaml`
  * If the kustomization namespace is empty, fall back to the app directory name and clearly say that the namespace is inferred.
* `plugin_enabled`: whether the cluster spec declares an enabled plugin named `barman-cloud.cloudnative-pg.io`
* `scheduled_backup_method`: if a sibling backup manifest exists, read the `ScheduledBackup` method and plugin configuration
* `source`: `direct`

In this repository, likely direct matches include:

* `projects/amiya.akn/src/apps/pocket-id/pocket-id.postgresql.yaml`
* `projects/amiya.akn/src/apps/vault/openbao.postgresql.yaml`
* `projects/lungmen.akn/src/apps/jellyseerr/jellyseerr.postgresql.yaml`

### 2. Mutualized Helm-rendered clusters

Search for `kustomization.yaml` files whose `helmCharts[]` entries reference `mutualized-cnpg-databases`.

For each matching `helmCharts[]` entry:

* `project`: derive from the path
* `app_dir`: directory containing the kustomization, currently `databases`
* `namespace`: `helmCharts[i].namespace // .namespace`
* `values_file`: `helmCharts[i].valuesFile`
* `values_path`: resolve relative to the kustomization directory
* `prefix`: `yq '.metadata.name' <values_path>`
* `suffix`: `yq '.spec.cluster.name' <values_path>`
* `cluster_name`: `prefix + "-" + suffix`
* `logical_databases`: `yq '.spec.databases[].name' <values_path>`
* `plugin_enabled`: whether the values file contains an enabled plugin named `barman-cloud.cloudnative-pg.io`
* `source`: `mutualized`

In this repository, the important mutualized values files are:

* `projects/lungmen.akn/src/apps/databases/postgres-apps.helmvalues.yaml` -> `apps-20260329`
* `projects/lungmen.akn/src/apps/databases/postgres-apps-secured.helmvalues.yaml` -> `apps-secured-20260329`

Use the logical database list to answer app-level requests such as `atuin`, `paperless`, `immich`, or `open-webui`.

### 3. Candidate list shape

Build a candidate list with enough detail to make a safe decision:

| Field              | Meaning                                                     |
| ------------------ | ----------------------------------------------------------- |
| cluster\_name      | Live CNPG cluster name                                      |
| project            | Arcane project such as `amiya.akn` or `lungmen.akn`         |
| namespace          | Kubernetes namespace where the cluster lives                |
| app\_dir           | Source application directory                                |
| source             | `direct` or `mutualized`                                    |
| logical\_databases | Only for mutualized clusters                                |
| plugin\_enabled    | Whether plugin-based backups are declared in repo manifests |
| context            | Resolved kubectl context, once known                        |
| notes              | Anything inferred or ambiguous                              |

## Filtering and ranking

Normalize the user's wording to lowercase and ignore superficial punctuation differences.

Match against all of these signals:

* project names such as `amiya`, `amiya.akn`, `lungmen`, `lungmen.akn`
* app directories such as `pocket-id`, `vault`, `jellyseerr`, `databases`
* cluster names such as `pocket-id-database`, `openbao`, `jellyseerr-database`, `apps-20260329`, `apps-secured-20260329`
* logical database names from the mutualized chart such as `atuin`, `n8n`, `paperless`, `immich`, and `linkding`
* namespace names when relevant

Rank candidates in this order:

1. Exact cluster name match or exact logical database match
2. Exact app directory or exact project match
3. Partial substring match

If the user says `all`, `everything`, or clearly requests all CNPG backups for one project, keep every candidate in that project.

If nothing matches, say so plainly and show the closest candidates instead of attempting a backup.

## Resolve Kubernetes contexts

List contexts with:

```bash
kubectl config get-contexts -o name
```

Prefer matches in this order:

1. `admin@project-name`
2. exact `project-name`
3. a single partial match containing the project name

If multiple plausible contexts remain, ask the user to choose from that short list.

If no context matches the project, stop and explain which project lacks a usable kube context.

## Mandatory confirmation

You must use the `ask_user` tool before creating any backup. Do not ask for confirmation in plain text only.

Confirmation prompts must include the exact targets you intend to touch. For example:

Single candidate:

```text
I found CNPG cluster `pocket-id-database` in namespace `pocket-id` with context `admin@amiya.akn`.
Create an on-demand plugin backup for it?
```

Multiple candidates:

```text
I found these CNPG clusters:

1. apps-20260329          namespace=databases   context=admin@lungmen.akn   databases=atuin,n8n,linkding,mealie,jellyseerr
2. apps-secured-20260329  namespace=databases   context=admin@lungmen.akn   databases=immich,litellm,open-webui,paperless
3. jellyseerr-database    namespace=jellyseerr  context=admin@lungmen.akn   source=direct

Which should I back up?
```

If the request is ambiguous, show the ranked matches and ask instead of picking one silently.

## Live validation before backup

For each confirmed cluster:

1. Verify the live cluster exists:

   ```bash
   kubectl get cluster.postgresql.cnpg.io <cluster_name> \
     --namespace <namespace> \
     --context <context> \
     -o yaml
   ```

2. Check cluster health:

   ```bash
   kubectl cnpg status <cluster_name> \
     --namespace <namespace> \
     --context <context>
   ```

3. Confirm plugin-based backup capability from the live cluster YAML when possible, otherwise from the repository manifest data you already collected.

Proceed only when at least one of these is true:

* the cluster spec declares an enabled plugin named `barman-cloud.cloudnative-pg.io`
* a repository `ScheduledBackup` for that cluster already uses `method: plugin` with `pluginConfiguration.name: barman-cloud.cloudnative-pg.io`

If the cluster is unhealthy, missing, or plugin backup capability cannot be confirmed, stop for that target and explain why. This skill is intentionally plugin-only.

Do not fall back to the deprecated `barmanObjectStore` backup method.

## Create the backup

Prefer the CNPG plugin command first:

```bash
kubectl cnpg backup <cluster_name> \
  --namespace <namespace> \
  --context <context> \
  --method plugin
```

Capture stdout so you can reuse the created backup name if the command prints it.

If the command fails because the local plugin version does not support `--method plugin`, create the `Backup` object explicitly instead:

```bash
backup_name="<cluster_name>-on-demand-$(date +%s)"
kubectl apply --context <context> -f - <<EOF
apiVersion: postgresql.cnpg.io/v1
kind: Backup
metadata:
  name: ${backup_name}
  namespace: <namespace>
spec:
  cluster:
    name: <cluster_name>
  method: plugin
  pluginConfiguration:
    name: barman-cloud.cloudnative-pg.io
EOF
```

Only use this fallback after plugin capability has already been confirmed.

## Verify the created backup

Wait a few seconds, then determine the exact `Backup` name.

Preferred order:

1. Use the name returned by the command if available.
2. Otherwise, resolve the newest `Backup` for the cluster:

   ```bash
   kubectl get backup -n <namespace> --context <context> -o json | yq '.items[] | select(.spec.cluster.name == "<cluster_name>") | .metadata.creationTimestamp + " " + .metadata.name' | tail -1
   ```

Then inspect the specific backup:

```bash
kubectl get backup <backup_name> \
  --namespace <namespace> \
  --context <context> \
  -o yaml
```

Report one of these outcomes:

* `running` or `pending`: backup started successfully; include a watch command
* `completed`: backup succeeded
* `failed`: report the failure and run `kubectl describe backup <backup_name> ...`

Useful watch command:

```bash
kubectl get backup <backup_name> \
  --namespace <namespace> \
  --context <context> \
  -w
```

## Output expectations

When you finish, summarize the result per target in a compact table or bullet list with:

* cluster name
* namespace
* context
* backup name
* status
* next useful command if the backup is still running

If some targets succeeded and others failed, make that explicit instead of giving a blanket success message.

## Guardrails

* Never execute any action without explicit user confirmation, even when the target appears unambiguous.
* Never confuse `ScheduledBackup` manifests with live `Backup` resources; always treat them as distinct object types with different purposes.
* Never infer the namespace from filenames when `kustomization.yaml` provides one; always prioritize the declared configuration.
* Never perform backups across all CNPG clusters in a repository unless the user has explicitly requested a global operation.
* Never proceed when context resolution is ambiguous (e.g., multiple clusters, namespaces, or targets); always request clarification first.
* Never use the deprecated `barmanObjectStore` method; rely only on supported backup mechanisms.
* Never generate backups using scripts or multi-step automation; always produce a single explicit command that the user can review and validate.

## Example requests

* `backup pocket-id database`
* `backup openbao in amiya`
* `backup atuin in lungmen`
* `backup all CNPG databases in lungmen.akn`
