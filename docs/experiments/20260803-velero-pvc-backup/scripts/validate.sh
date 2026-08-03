#!/usr/bin/env bash
# =============================================================================
# Backup/restore validation for the Velero local POC (issue #1054)
# =============================================================================
# Writes a marker row into the test app's Postgres DB, takes a Kopia backup,
# deletes the whole namespace (simulating data loss), restores from the
# backup, and checks the marker row is back. Proves the round trip preserves
# real application data, not just that some bytes survived on disk.
#
# Usage:
#   mise run poc:validate
#   ./scripts/validate.sh
# =============================================================================

set -euo pipefail

NS="velero-poc-app"
POD="test-app-0"
BACKUP_NAME="test-backup-$(date +%s)"
MARKER="velero-poc-$(date +%s)"

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

echo "=== Velero Local POC — Backup/Restore Validation ==="
echo ""

echo "--- Writing marker data (${MARKER}) ---"
psql_exec "CREATE TABLE IF NOT EXISTS velero_poc_marker (value text);"
psql_exec "INSERT INTO velero_poc_marker (value) VALUES ('${MARKER}');"

echo "--- Creating backup ${BACKUP_NAME} ---"
velero backup create "${BACKUP_NAME}" --include-namespaces "${NS}" --wait

check "V-001" "Backup phase is Completed" \
  "velero backup describe ${BACKUP_NAME} --details 2>/dev/null | grep -q 'Phase:.*Completed'"

echo "--- Deleting namespace ${NS} (simulated data loss) ---"
kubectl delete namespace "${NS}" --wait --timeout=120s

check "V-002" "Namespace is gone after deletion" \
  "! kubectl get namespace ${NS} &>/dev/null"

# The static local PV (manifests/test-app.yaml) has no dynamic provisioner,
# so deleting its PVC leaves it "Released" with a stale claimRef instead of
# being deleted/recreated. Clear the claimRef so it's bindable again — the
# restored PVC (same name, new UID) then binds to it normally.
echo "--- Making the local PV bindable again for restore ---"
kubectl patch pv velero-poc-data --type json -p '[{"op": "remove", "path": "/spec/claimRef"}]' 2>/dev/null || true

echo "--- Restoring from ${BACKUP_NAME} ---"
RESTORE_NAME="${BACKUP_NAME}-restore"
velero restore create "${RESTORE_NAME}" --from-backup "${BACKUP_NAME}" --wait

check "V-003" "Restore phase is Completed" \
  "velero restore describe ${RESTORE_NAME} --details 2>/dev/null | grep -q 'Phase:.*Completed'"

check "V-004" "Namespace restored" \
  "kubectl get namespace ${NS} &>/dev/null"

echo "--- Waiting for restored StatefulSet to become ready ---"
kubectl -n "${NS}" rollout status statefulset/test-app --timeout=180s || true

check "V-005" "PVC restored and Bound" \
  "kubectl -n ${NS} get pvc data-test-app-0 -o jsonpath='{.status.phase}' 2>/dev/null | grep -q Bound"

check "V-006" "Postgres ready after restore" \
  "kubectl -n ${NS} exec ${POD} -- pg_isready -U test"

check "V-007" "Marker row survived backup/restore round trip" \
  "[ \"\$(psql_exec \"SELECT value FROM velero_poc_marker WHERE value = '${MARKER}';\")\" = '${MARKER}' ]"

echo ""
echo "=== Results: ${pass} passed, ${fail} failed ==="
exit "${fail}"
