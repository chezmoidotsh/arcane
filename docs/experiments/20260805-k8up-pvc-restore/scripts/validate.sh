#!/usr/bin/env bash
# =============================================================================
# Backup/restore/prune validation for the k8up local POC (issue #1208)
# =============================================================================
# Round-trips real Postgres data through k8up twice, deliberately in this order:
#
#   write marker1 -> backup-1 -> write marker2 -> backup-2 -> simulate data loss
#   -> restore EXPLICITLY from backup-1's snapshot (not the latest one) -> verify
#   marker1 came back and marker2 did NOT -> prune down to 1 snapshot
#
# Restoring an older snapshot on purpose, then checking the *newer* marker is
# absent, is what actually tests k8up-io/k8up#1062 ("restore can take the latest
# backup regardless of which snapshot was requested") rather than just assuming
# explicit spec.snapshot targeting works because the docs say so.
#
# The PVC is never deleted and recreated by k8up itself — it can't be, k8up
# doesn't own/create the target PVC (README "Known gap"). Data loss is simulated
# by deleting the StatefulSet's pod + PVC and letting the StatefulSet controller
# recreate both (fresh, empty) from its volumeClaimTemplate, then restoring into
# that pre-existing PVC — the same "PVC already exists, declaratively owned by
# something else" shape as a real ArgoCD-managed StatefulSet on lungmen.akn.
#
# Every Backup/Restore CR below sets spec.podSecurityContext.runAsUser/runAsGroup: 70
# to match Postgres's PGDATA ownership (uid 70, mode 0700). Without it, the backup
# Job runs as k8up's own default uid (65532), can't read into PGDATA, and — this is
# the actual headline finding of this POC — the Backup CR still reports
# `Completed`/`Succeeded` anyway. restic logs "errors": 2 and "new files": 0 in the
# Job pod's own log, but nothing on the CR's status surfaces that. Found by running
# this script and getting a restore that silently came back empty (V-007 failing
# with the target relation not existing at all), not by reading k8up's docs — see
# README §3.3.
#
# Usage:
#   mise run poc:validate
#   ./scripts/validate.sh
# =============================================================================

set -euo pipefail

NS="k8up-poc-app"
POD="test-app-0"
PVC="data-test-app-0"
MARKER1="k8up-poc-$(date +%s)-1"
MARKER2="k8up-poc-$(date +%s)-2"

pass=0
fail=0

check() {
  local id="$1" desc="$2" cmd="$3"
  if eval "${cmd}" &>/dev/null; then
    echo "PASS [${id}] ${desc}"
    pass=$((pass + 1))
  else
    echo "FAIL [${id}] ${desc}"
    fail=$((fail + 1))
  fi
}

psql_exec() {
  kubectl -n "${NS}" exec "${POD}" -- psql -U test -d testdb -tAc "$1"
}

write_marker() {
  local marker="$1"
  psql_exec "CREATE TABLE IF NOT EXISTS k8up_poc_marker (value text);"
  psql_exec "TRUNCATE k8up_poc_marker;"
  psql_exec "INSERT INTO k8up_poc_marker (value) VALUES ('${marker}');"
}

# shellcheck disable=SC2329 # invoked indirectly, inside `check`'s eval'd strings below
# shellcheck disable=SC2310 # `|| true` here is intentional: the query legitimately
# fails ("relation does not exist") right after the simulated data-loss step, and
# that must read back as an empty string, not abort the script under set -e.
read_marker() {
  psql_exec "SELECT value FROM k8up_poc_marker;" 2>/dev/null || true
}

list_snapshot_ids() {
  kubectl -n "${NS}" get snapshots.k8up.io -o jsonpath='{range .items[*]}{.spec.id}{"\n"}{end}' 2>/dev/null
}

# k8up jobs report success via a "Completed" condition whose *reason* is
# "Succeeded" (any other reason, e.g. "Failed", also sets Completed=True — see
# k8up-io/k8up's api/v1/status.go HasSucceeded()). `kubectl wait --for=condition=`
# only checks the type/status pair, so the reason needs a separate check.
run_k8up_job() {
  local kind="$1" name="$2"
  kubectl apply -f -
  kubectl -n "${NS}" wait --for=condition=Completed "${kind}.k8up.io/${name}" --timeout=180s
}

# shellcheck disable=SC2329 # invoked indirectly, inside `check`'s eval'd strings below
k8up_job_succeeded() {
  local kind="$1" name="$2"
  local reason
  reason="$(kubectl -n "${NS}" get "${kind}.k8up.io" "${name}" -o jsonpath='{.status.conditions[?(@.type=="Completed")].reason}')"
  [[ ${reason} == "Succeeded" ]]
}

echo "=== k8up Local POC — Backup/Restore/Prune Validation ==="
echo ""

echo "--- Writing marker1 (${MARKER1}) and taking backup-1 ---"
write_marker "${MARKER1}"
IDS_BEFORE_1="$(list_snapshot_ids)"
run_k8up_job backup backup-1 <<EOF
apiVersion: k8up.io/v1
kind: Backup
metadata:
  name: backup-1
  namespace: ${NS}
spec:
  podSecurityContext:
    runAsUser: 70
    runAsGroup: 70
EOF

check "V-001" "backup-1 completed successfully" "k8up_job_succeeded backup backup-1"

# shellcheck disable=SC2312 # exit codes of comm/sort/head deliberately unchecked —
# an empty SNAPSHOT1_ID surfaces on its own via the "<none>" fallback below and
# fails downstream at V-004 (the Restore CR would be rejected with an empty snapshot).
SNAPSHOT1_ID="$(comm -13 <(echo "${IDS_BEFORE_1}" | sort) <(list_snapshot_ids | sort) | head -1)"
echo "backup-1 snapshot: ${SNAPSHOT1_ID:-<none>}"

echo "--- Writing marker2 (${MARKER2}) and taking backup-2 ---"
write_marker "${MARKER2}"
IDS_BEFORE_2="$(list_snapshot_ids)"
run_k8up_job backup backup-2 <<EOF
apiVersion: k8up.io/v1
kind: Backup
metadata:
  name: backup-2
  namespace: ${NS}
spec:
  podSecurityContext:
    runAsUser: 70
    runAsGroup: 70
EOF

check "V-002" "backup-2 completed successfully" "k8up_job_succeeded backup backup-2"

# shellcheck disable=SC2312 # same reasoning as SNAPSHOT1_ID above
SNAPSHOT2_ID="$(comm -13 <(echo "${IDS_BEFORE_2}" | sort) <(list_snapshot_ids | sort) | head -1)"
echo "backup-2 snapshot: ${SNAPSHOT2_ID:-<none>}"

echo "--- Simulating data loss (scale to 0, delete PVC, scale back up to a fresh one) ---"
# Scale to 0 *before* deleting the PVC: deleting the pod alone isn't enough —
# with replicas unchanged at 1, the StatefulSet controller immediately
# recreates the pod and remounts the still-existing PVC before the delete
# below can complete, which makes `kubectl delete pvc --wait` hang until its
# timeout (found by actually running this script, not assumed).
kubectl -n "${NS}" scale statefulset/test-app --replicas=0
kubectl -n "${NS}" wait --for=delete "pod/${POD}" --timeout=60s
# Completed k8up backup Jobs leave their (terminal, non-garbage-collected) pods
# around with the PVC still listed under their spec.volumes — pvc-protection
# blocks PVC deletion on *any* referencing pod, running or not. Also found by
# running this, not documented anywhere obvious. Deleting the Jobs (which own
# and cascade to their pods) is enough; the Backup CRs/snapshots are unaffected
# (k8up names each backup Job "backup-<Backup CR name>-0").
kubectl -n "${NS}" delete job backup-backup-1-0 backup-backup-2-0 --ignore-not-found
kubectl -n "${NS}" delete pvc "${PVC}" --wait --timeout=60s
kubectl -n "${NS}" scale statefulset/test-app --replicas=1
kubectl -n "${NS}" rollout status statefulset/test-app --timeout=180s

check "V-003" "PVC recreated empty (marker gone after data loss)" \
  "[ \"\$(read_marker)\" != \"${MARKER1}\" ] && [ \"\$(read_marker)\" != \"${MARKER2}\" ]"

echo "--- Scaling down so the restore Job can mount ${PVC} exclusively ---"
kubectl -n "${NS}" scale statefulset/test-app --replicas=0
kubectl -n "${NS}" wait --for=delete "pod/${POD}" --timeout=60s

echo "--- Restoring EXPLICITLY from backup-1's snapshot (${SNAPSHOT1_ID}), not the latest ---"
run_k8up_job restore restore-1 <<EOF
apiVersion: k8up.io/v1
kind: Restore
metadata:
  name: restore-1
  namespace: ${NS}
spec:
  snapshot: ${SNAPSHOT1_ID}
  restoreMethod:
    folder:
      claimName: ${PVC}
  podSecurityContext:
    runAsUser: 70
    runAsGroup: 70
EOF

check "V-004" "restore-1 completed successfully" "k8up_job_succeeded restore restore-1"

check "V-005" "PVC restored and Bound" \
  "[ \"\$(kubectl -n ${NS} get pvc ${PVC} -o jsonpath='{.status.phase}')\" = Bound ]"

echo "--- Scaling back up ---"
kubectl -n "${NS}" scale statefulset/test-app --replicas=1
kubectl -n "${NS}" rollout status statefulset/test-app --timeout=180s

check "V-006" "Postgres ready after restore" \
  "kubectl -n ${NS} exec ${POD} -- pg_isready -U test"

check "V-007" "marker1 (targeted snapshot) came back" \
  "[ \"\$(read_marker)\" = \"${MARKER1}\" ]"

check "V-008" "marker2 (newer snapshot) did NOT come back — guards against k8up#1062" \
  "[ \"\$(read_marker)\" != \"${MARKER2}\" ]"

echo "--- Pruning down to the last snapshot ---"
# keepDaily is set explicitly here, not left to default — k8up's prune executor
# (operator/prunecontroller/executor.go, its own comment: "FIXME(mw): this is
# ugly") hardcodes KEEP_DAILY=14 whenever spec.retention.keepDaily is 0/unset,
# there is no way to express "don't also keep one per day" by omission. Found by
# running with only keepLast:1 set and getting 2 snapshots back instead of 1 —
# restic's real "keep 1 latest, 14 daily" policy correctly kept both, since both
# snapshots landed on the same UTC day. See README §3.4.
run_k8up_job prune prune-1 <<EOF
apiVersion: k8up.io/v1
kind: Prune
metadata:
  name: prune-1
  namespace: ${NS}
spec:
  retention:
    keepLast: 1
    keepDaily: 1
EOF

check "V-009" "prune-1 completed successfully" "k8up_job_succeeded prune prune-1"

# shellcheck disable=SC2016 # single-quoted on purpose: expands inside eval, not here
check "V-010" "exactly 1 snapshot remains after pruning" \
  '[ "$(list_snapshot_ids | grep -c .)" = 1 ]'

echo ""
echo "=== Results: ${pass} passed, ${fail} failed ==="
exit "${fail}"
