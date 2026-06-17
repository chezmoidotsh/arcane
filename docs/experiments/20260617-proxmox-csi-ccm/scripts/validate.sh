#!/usr/bin/env bash
set -euo pipefail

NS="kube-system"
DRIVER="csi.proxmox.sinextra.dev"
SC="proxmox-lvmthin-ext4"
STS="test-csi"

pass=0
fail=0

check() {
  local id="$1" desc="$2" cmd="$3"
  if eval "${cmd}" &>/dev/null; then
    echo "PASS [${id}] ${desc}"
    ((pass++))
  else
    echo "FAIL [${id}] ${desc}"
    ((fail++))
  fi
}

echo "=== Proxmox CSI + CCM Validation ==="
echo ""

check "V-001" "CCM pods running" \
  "kubectl -n ${NS} get pods -l app=proxmox-cloud-controller-manager --no-headers 2>/dev/null | grep -q Running"

check "V-002" "Node has topology labels" \
  "kubectl get nodes --no-headers -o custom-columns=':.metadata.labels' 2>/dev/null | grep -q 'topology.kubernetes.io/region'"

check "V-003" "Node has providerID" \
  "[ -n \"\$(kubectl get nodes -o jsonpath='{.items[*].spec.providerID}' 2>/dev/null)\" ]"

check "V-004" "CSIDriver registered" \
  "kubectl get csidriver ${DRIVER} --no-headers 2>/dev/null"

check "V-005" "CSI pods running" \
  "kubectl -n ${NS} get pods --no-headers 2>/dev/null | grep -c 'proxmox-csi' | grep -qE '^[1-9]'"

check "V-006" "StorageClass available" \
  "kubectl get sc ${SC} --no-headers 2>/dev/null"

check "V-007" "StatefulSet PVC bound" \
  "kubectl get pvc data-test-csi-0 --no-headers -o custom-columns=':.status.phase' 2>/dev/null | grep -q Bound"

check "V-008" "PostgreSQL ready" \
  "kubectl get sts ${STS} --no-headers -o custom-columns=':.status.readyReplicas' 2>/dev/null | grep -q 1"

check "V-009" "Volume expansion (resize PVC to 2Gi)" \
  "kubectl patch pvc data-test-csi-0 -p '{\"spec\":{\"resources\":{\"requests\":{\"storage\":\"2Gi\"}}}}' 2>/dev/null && \
   sleep 15 && \
   kubectl get pvc data-test-csi-0 -o jsonpath='{.status.capacity.storage}' 2>/dev/null | grep -q 2Gi"

check "V-010" "Volume survives pod restart" \
  "kubectl delete pod -l app=test-csi --force --grace-period=0 2>/dev/null && \
   sleep 5 && \
   kubectl rollout status sts ${STS} --timeout=60s 2>/dev/null"

echo ""
echo "=== Results: ${pass} passed, ${fail} failed ==="
exit "${fail}"
