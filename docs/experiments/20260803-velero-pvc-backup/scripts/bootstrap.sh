#!/usr/bin/env bash
# =============================================================================
# Bootstrap for the Velero local POC (issue #1054)
# =============================================================================
# Creates a disposable kind cluster, deploys MinIO as the S3-compatible
# backup target, installs Velero (Kopia backend only), and deploys the
# Postgres test app used for the backup/restore validation.
#
# Usage:
#   mise run poc:bootstrap
#   ./scripts/bootstrap.sh
# =============================================================================

set -euo pipefail

CLUSTER_NAME="${KIND_CLUSTER_NAME:-velero-poc}"
VELERO_CHART_VERSION="12.1.0"
EXPERIMENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_dependencies() {
  local deps=("kind" "kubectl" "helm" "velero")
  local missing=()
  for dep in "${deps[@]}"; do
    command -v "${dep}" &>/dev/null || missing+=("${dep}")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    log_error "Missing dependencies: ${missing[*]} — run 'mise install' in this directory."
    exit 1
  fi
}

create_cluster() {
  mkdir -p "$(dirname "${KUBECONFIG:-${HOME}/.kube/config}")"
  if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
    log_info "kind cluster ${CLUSTER_NAME} already exists, reusing it"
  else
    log_info "Creating kind cluster: ${CLUSTER_NAME}"
    kind create cluster --name "${CLUSTER_NAME}"
  fi
  kubectl config use-context "kind-${CLUSTER_NAME}"
  # Backing directory for the static `local` PV (manifests/test-app.yaml) —
  # `local` volumes, unlike hostPath, require the path to pre-exist.
  docker exec "${CLUSTER_NAME}-control-plane" mkdir -p /mnt/velero-poc-data
}

deploy_minio() {
  log_info "Deploying MinIO (S3-compatible backup target)"
  # Job pod templates are immutable — delete before reapplying so reruns
  # against an existing cluster (e.g. after fixing the manifest) don't fail.
  kubectl -n velero-poc delete job minio-create-bucket --ignore-not-found
  kubectl apply -f "${EXPERIMENT_DIR}/manifests/minio.yaml"
  kubectl -n velero-poc rollout status deployment/minio --timeout=120s
  kubectl -n velero-poc wait --for=condition=complete job/minio-create-bucket --timeout=120s
  log_success "MinIO ready, bucket velero-backups created"
}

install_velero() {
  log_info "Installing Velero (chart ${VELERO_CHART_VERSION}, Kopia backend)"

  helm repo add vmware-tanzu https://vmware-tanzu.github.io/helm-charts 2>/dev/null || true
  helm repo update vmware-tanzu

  kubectl create namespace velero --dry-run=client -o yaml | kubectl apply -f -

  # Velero's AWS plugin expects a static credentials file — MinIO's root
  # user/password stand in for an IAM access key/secret pair.
  kubectl -n velero create secret generic cloud-credentials \
    --from-literal=cloud="[default]
aws_access_key_id=veleropoc
aws_secret_access_key=veleropocsecretkey" \
    --dry-run=client -o yaml | kubectl apply -f -

  helm upgrade --install velero vmware-tanzu/velero \
    --version "${VELERO_CHART_VERSION}" \
    --namespace velero \
    -f "${EXPERIMENT_DIR}/manifests/velero-helmvalues.yaml" \
    --wait --timeout 180s

  kubectl -n velero rollout status deployment/velero --timeout=120s
  kubectl -n velero rollout status daemonset/node-agent --timeout=120s

  log_success "Velero installed"
}

deploy_test_app() {
  log_info "Deploying Postgres test app (PVC to back up)"
  kubectl apply -f "${EXPERIMENT_DIR}/manifests/test-app.yaml"
  kubectl -n velero-poc-app rollout status statefulset/test-app --timeout=180s
  log_success "Test app ready"
}

print_instructions() {
  log_success "=========================================="
  log_success "Bootstrap complete"
  log_success "=========================================="
  echo ""
  echo "Next steps:"
  echo "  mise run poc:validate   # run the backup/restore cycle"
  echo "  mise run poc:teardown   # delete the kind cluster"
}

main() {
  log_info "Bootstrapping Velero local POC (cluster: ${CLUSTER_NAME})"
  check_dependencies
  create_cluster
  deploy_minio
  install_velero
  deploy_test_app
  print_instructions
}

main "$@"
