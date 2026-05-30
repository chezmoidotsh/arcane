#!/usr/bin/env bash
# backup-cnpg.sh — Create an on-demand plugin backup for a CNPG cluster.
#
# Usage: backup-cnpg.sh <cluster_name> <namespace> <context>
# Prints the created Backup name on stdout on success.
#
# Always uses the kubectl apply + manifest approach so the backup name is
# known before submission and the applied resource is human-readable.
# The barman-cloud plugin must already be confirmed enabled (run
# validate-cnpg.sh first).
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

backup_name="${cluster_name}-on-demand-$(date +%s)"

kubectl apply --context "${context}" -f - <<EOF
apiVersion: postgresql.cnpg.io/v1
kind: Backup
metadata:
  name: ${backup_name}
  namespace: ${namespace}
spec:
  cluster:
    name: ${cluster_name}
  method: plugin
  pluginConfiguration:
    name: barman-cloud.cloudnative-pg.io
EOF

echo "${backup_name}"
