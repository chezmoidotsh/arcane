#!/usr/bin/env bash
# Deletes the local kind cluster for the k8up POC and everything in it.
set -euo pipefail

CLUSTER_NAME="${KIND_CLUSTER_NAME:-k8up-poc}"

if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  kind delete cluster --name "${CLUSTER_NAME}"
  echo "[SUCCESS] kind cluster ${CLUSTER_NAME} deleted"
else
  echo "[INFO] kind cluster ${CLUSTER_NAME} does not exist, nothing to do"
fi
