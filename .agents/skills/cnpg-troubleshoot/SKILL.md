---
name: cnpg-troubleshoot
description: >
  Use this skill whenever a CloudNative-PG cluster is in a broken or degraded state and the cause is not immediately
  known — phrases like "my database is down", "CNPG cluster is broken", "immich can't connect to postgres", "WAL disk
  full", "CrashLoopBackOff on the DB pod", "barman archiving error", or "postgres not starting". Also trigger when the
  user describes symptoms of a CNPG failure (pods restarting, services depending on postgres unavailable, backup not
  completing) without naming the exact cause. This skill diagnoses the cluster, matches the error pattern against known
  incidents in `docs/incidents/`, finds the linked procedure, and executes it.
compatibility:
  Requires `kubectl`, `mise`, `python3`. The `mc` MinIO client is installed on demand via `mise install mc` if needed
  for S3 operations.
---

# CNPG Troubleshoot

This skill diagnoses a broken CloudNative-PG cluster, matches the failure pattern against the incident knowledge base in
`docs/incidents/`, and routes to the appropriate recovery procedure. It is intentionally thin: the fix logic lives in
the procedures, not here.

## When to use this skill

Trigger on:

- "My database is down / not starting / crashing"
- "CNPG cluster is in phase X"
- "immich / paperless / forgejo / atuin can't connect to postgres"
- "WAL disk full", "CrashLoopBackOff on DB pod", "barman archiving error"
- "Not enough disk space", "Expected empty archive", "ContinuousArchivingFailing"
- Any symptom of a CNPG cluster failure where the cause is unknown

## When NOT to use this skill

- **Backup creation** → use `.agents/skills/cnpg-backup/SKILL.md` (healthy cluster, on-demand backup).
- **New cluster provisioning or migration** → use the Helm values and PR workflow.
- **Active cluster that is healthy but needs tuning** → not an incident, handle directly.
- **Non-CNPG databases** (MongoDB / Percona) → different operator, different skill.

## Workflow

1. **Identify** the broken cluster (user-provided or discovered via Step 1).
2. **Diagnose** cluster phase, conditions, and pod states (Step 2).
3. **Match** the error pattern against the incident knowledge base (Step 3).
4. **Confirm** the target and proposed procedure with the user (Step 4).
5. **Execute** the linked procedure (Step 5).
6. **Verify** and report (Step 6).

---

## Step 0 — Target resolution

If the user named a cluster or app, use it. If not, discover broken clusters first:

```sh
# List all CNPG clusters across projects and their phase
kubectl --context admin@lungmen.akn get cluster -A 2>/dev/null
kubectl --context admin@amiya.akn get cluster -A 2>/dev/null
# → look for phase != "Cluster in healthy state"
```

Surface discovered broken clusters to the user using `ask_user` before proceeding. Do not assume which cluster is the
target when multiple are broken simultaneously.

## Step 1 — Diagnose cluster state

Run all diagnostic commands. Capture the output — it drives Step 3.

```sh
CLUSTER_CONTEXT="<context>"
CLUSTER_NAME="<cluster>"
NAMESPACE="<namespace>"

# 1a. Cluster phase and conditions
kubectl --context $CLUSTER_CONTEXT get cluster $CLUSTER_NAME -n $NAMESPACE
kubectl --context $CLUSTER_CONTEXT get cluster $CLUSTER_NAME -n $NAMESPACE \
  -o jsonpath='{.status.conditions}' | python3 -m json.tool

# 1b. Pod states and restart counts
kubectl --context $CLUSTER_CONTEXT get pods -n $NAMESPACE | grep $CLUSTER_NAME

# 1c. PVC usage
kubectl --context $CLUSTER_CONTEXT get pvc -n $NAMESPACE | grep $CLUSTER_NAME

# 1d. Pod logs — primary postgres container (most recent errors)
PRIMARY_POD=$(kubectl --context $CLUSTER_CONTEXT get pods -n $NAMESPACE \
  --selector="cnpg.io/cluster=$CLUSTER_NAME,role=primary" \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$PRIMARY_POD" ]; then
  kubectl --context $CLUSTER_CONTEXT logs -n $NAMESPACE $PRIMARY_POD \
    -c postgres --tail=30 2>/dev/null
fi

# 1e. barman-cloud logs on the primary (JSON — filter retention noise)
if [ -n "$PRIMARY_POD" ]; then
  kubectl --context $CLUSTER_CONTEXT logs -n $NAMESPACE $PRIMARY_POD \
    -c plugin-barman-cloud --since=30m 2>/dev/null \
    | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        msg = d.get('msg', '')
        if 'retention' not in msg.lower():
            print(f'[{d.get(\"level\",\"\")}] {d.get(\"ts\",\"\")[:19]}: {msg[:300]}')
    except:
        pass
" | tail -30
fi
```

Collect:

- Cluster `phase`
- All condition types and messages (especially `ContinuousArchivingFailing`)
- Pod states and restart counts
- PVC sizes and usage percentages
- Key log lines (errors, warnings)

## Step 2 — Match against the incident knowledge base

With the error strings collected in Step 1, search the incident knowledge base for a known pattern.

```sh
# Search by exact error string from logs or conditions
grep -rl "Expected empty archive" docs/incidents/
grep -rl "Not enough disk space" docs/incidents/
grep -rl "ContinuousArchivingFailing" docs/incidents/

# For multiple error strings, chain searches
for sig in "Expected empty archive" "WAL archive check failed" "ContinuousArchivingFailing"; do
  result=$(grep -rl "$sig" docs/incidents/ 2>/dev/null)
  [ -n "$result" ] && echo "MATCH [$sig]: $result"
done
```

For each matched incident file, extract the linked procedures:

```sh
# Read the procedures field from the matched incident's frontmatter
python3 -c "
import sys
lines = open('docs/incidents/<matched-file>.md').readlines()
in_front = False
in_proc = False
for line in lines:
    if line.strip() == '---':
        in_front = not in_front
        continue
    if in_front and line.startswith('procedures:'):
        in_proc = True
        continue
    if in_proc and line.startswith('  - '):
        print(line.strip().lstrip('- '))
    elif in_proc:
        break
"
```

**If a match is found:** surface the matched incident, its summary, and the linked procedure to the user in Step 3.

**If no match is found:** present the raw diagnostic output and the cluster conditions to the user. Do not attempt to
fix an unknown failure pattern. Ask the user for additional context and, after resolution, create a new post-mortem in
`docs/incidents/`.

## Step 3 — Confirm with the user

Before executing any remediation, confirm the target and proposed action using `ask_user`. Show:

- The broken cluster name, namespace, and context
- The matched error pattern and incident
- The procedure you will follow
- Any write operations the procedure will perform (PVC resize, S3 mv, etc.)

A plain "OK to proceed?" in text is not enough — use the interactive question tool to give the user a deliberate
confirmation surface.

Example confirmation block:

<!-- trunk-ignore-begin(markdown-link-check) -->

```text
Broken cluster: apps-secured-20260329 (namespace: databases, context: admin@lungmen.akn)

Matched incident: docs/incidents/2026-05-30-cnpg-wal-disk-full-apps-secured.md
Error: "Not enough disk space" + "Expected empty archive" (ContinuousArchivingFailing)

Procedure: docs/procedures/databases/DB-20260530-00.cnpg-wal-disk-full-recovery.md

This will:
  1. Expand WAL PVCs (apps-secured-20260329-1-wal and -2-wal) from current size to 10Gi
  2. Move S3 folder 01KMWETKMBK0MYNB3X7RH6BT0X/ → 01KMWETKMBK0MYNB3X7RH6BT0X.bak/
  3. Verify WAL archiving restores
  4. Trigger an on-demand backup

Proceed?
```

<!-- trunk-ignore-end(markdown-link-check) -->

## Step 4 — Execute the matched procedure

Read the full procedure file before executing. Follow it step by step. Do not skip steps or merge steps that have
explicit wait conditions between them (e.g., waiting for pods to return to Running after PVC expansion before checking
barman logs).

```sh
# Read the procedure
cat <procedure_path>
```

Key execution rules:

- Use explicit `--context` flags on every `kubectl` command.
- Pause at any step that requires user confirmation (irreversible operations, S3 mutations).
- If a step fails in a way the procedure does not cover, stop and surface the failure to the user — do not improvise a
  fix beyond the procedure's scope.
- When the procedure references the `cnpg-backup` skill (Step 7 of the WAL disk full recovery), invoke that skill
  directly rather than calling its scripts manually.

## Step 5 — Verify and report

After the procedure completes, run the quick verifications defined at its end. Report per target:

- Cluster phase → `Cluster in healthy state` ✓ or still degraded (with details)
- WAL archiving → `ContinuousArchivingSuccess` ✓ or still failing (with condition message)
- Pods → all `2/2 Running` ✓ or remaining issues
- Backup → `Completed` ✓ or status
- Any pending post-merge actions (e.g., PR to merge, ExternalSecrets refresh needed)

If verification fails at any checkpoint, do not declare the incident resolved. Surface the remaining failure to the user
with the exact kubectl output.

---

## Known error patterns

Quick reference for routing without needing to grep first:

| Error / Phase                                                                     | Matched incident                                                                              | Procedure                                                                                 |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Not enough disk space` + `Expected empty archive` + `ContinuousArchivingFailing` | [2026-05-30 cnpg-wal-disk-full](docs/incidents/2026-05-30-cnpg-wal-disk-full-apps-secured.md) | [DB-20260530-00](docs/procedures/databases/DB-20260530-00.cnpg-wal-disk-full-recovery.md) |

This table is a cache for common cases. Always verify against `docs/incidents/` — new incidents and procedures supersede
it.

---

## Guardrails

- **Never run `kubectl apply` or `kubectl patch` without user confirmation.** Cluster mutations during an incident can
  worsen the failure. Step 3 exists for this reason.
- **Never delete S3 objects.** Always move to `.bak`. Deletion during a recovery window destroys the only available
  backup if the new cluster fails to start.
- **Never skip the PVC wait step.** With high restart counts, the CrashLoopBackOff backoff is \~5 minutes. Checking
  barman logs before the pod has restarted returns stale data.
- **Always qualify `kubectl get backup.postgresql.cnpg.io`.** The unqualified `kubectl get backup` returns Longhorn
  backups, not CNPG backups. This is a silent wrong-resource trap.
- **Stop if no incident matches.** An improvised fix based on partial understanding of barman internals risks data loss.
  When the pattern is unknown, gather diagnostics, report to the user, and create a new post-mortem after resolution.
- **Do not run `validate-cnpg.sh` as a blocker when the replica is in streaming recovery.** The validation script
  requires `Cluster in healthy state`. A replica replaying a large WAL backlog will keep the cluster in
  `Waiting for the instances to become active` for 30+ min while the primary is fully healthy. In that case, invoke
  `backup-cnpg.sh` directly without the validation gate, as documented in the WAL disk full procedure.

## Related skills and references

- **Backup a healthy cluster**: `.agents/skills/cnpg-backup/SKILL.md`
- **Incident knowledge base**: `docs/incidents/` — search via `grep -rl "<error>" docs/incidents/`
- **Procedures**: `docs/procedures/databases/`
- **CNPG documentation**: <https://cloudnative-pg.io/documentation/>
