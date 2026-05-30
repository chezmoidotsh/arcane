#!/usr/bin/env bash
# verify-cnpg.sh — Report the status of a CNPG Backup object.
#
# Usage: verify-cnpg.sh <backup_name> <namespace> <context>
# Exit 0 = completed or still running (print watch command).
# Exit 1 = failed or backup not found.
#
# Requires: kubectl

set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: $(basename "$0") <backup_name> <namespace> <context>" >&2
  exit 1
fi

backup_name="$1"
namespace="$2"
context="$3"

phase="$(kubectl get backup.postgresql.cnpg.io "${backup_name}" \
  --namespace "${namespace}" --context "${context}" \
  -o jsonpath='{.status.phase}' 2>/dev/null || true)"

case "${phase}" in
completed)
  echo "COMPLETED: ${backup_name}"
  ;;
running | pending | "")
  echo "RUNNING: ${backup_name} (phase: ${phase:-pending})"
  echo "Watch: kubectl get backup.postgresql.cnpg.io ${backup_name}" \
    "-n ${namespace} --context ${context} -w"
  ;;
failed)
  echo "FAILED: ${backup_name}" >&2
  echo "Debug: kubectl describe backup.postgresql.cnpg.io ${backup_name}" \
    "-n ${namespace} --context ${context}" >&2
  exit 1
  ;;
*)
  echo "UNKNOWN phase '${phase}' for backup '${backup_name}'" >&2
  exit 1
  ;;
esac
