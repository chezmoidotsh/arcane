#!/usr/bin/env bash
# validate-cnpg.sh — Validate a CNPG cluster is healthy and plugin-ready.
#
# Usage: validate-cnpg.sh <cluster_name> <namespace> <context>
# Exit 0 = ready to back up.
# Exit 1 = cluster not found or unreachable.
# Exit 2 = cluster not healthy.
# Exit 3 = barman-cloud plugin not enabled.
#
# Requires: kubectl

set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: $(basename "$0") <cluster_name> <namespace> <context>" >&2
  exit 1
fi

cluster_name="$1"
namespace="$2"
context="$3"

# --- Existence & health ----------------------------------------------------

phase="$(kubectl get cluster.postgresql.cnpg.io "${cluster_name}" \
  --namespace "${namespace}" --context "${context}" \
  -o jsonpath='{.status.phase}' 2>&1)" || {
  echo "ERROR: cluster '${cluster_name}' not found in namespace '${namespace}'" \
    "(context: ${context})" >&2
  exit 1
}

if [[ ${phase} != "Cluster in healthy state" ]]; then
  echo "ERROR: cluster '${cluster_name}' is not healthy (phase: ${phase})" >&2
  exit 2
fi

# --- Plugin check ----------------------------------------------------------

plugins="$(kubectl get cluster.postgresql.cnpg.io "${cluster_name}" \
  --namespace "${namespace}" --context "${context}" \
  -o jsonpath='{.spec.plugins[*].name}' 2>/dev/null || true)"

if ! printf '%s' "${plugins}" | grep -q 'barman-cloud.cloudnative-pg.io'; then
  echo "ERROR: cluster '${cluster_name}' does not have the" \
    "barman-cloud.cloudnative-pg.io plugin enabled" >&2
  exit 3
fi

echo "OK: '${cluster_name}' is healthy and barman-cloud plugin is enabled"
