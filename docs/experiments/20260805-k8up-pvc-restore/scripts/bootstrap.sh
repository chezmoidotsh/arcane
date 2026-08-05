#!/usr/bin/env bash
# =============================================================================
# Bootstrap for the k8up local POC (issue #1208)
# =============================================================================
# Creates a disposable kind cluster, deploys MinIO as the S3-compatible backup
# target, installs k8up (Helm chart), and deploys the Postgres test app + its
# Schedule used for the backup/restore/prune validation.
#
# Usage:
#   mise run poc:bootstrap
#   ./scripts/bootstrap.sh
# =============================================================================

set -euo pipefail

CLUSTER_NAME="${KIND_CLUSTER_NAME:-k8up-poc}"
K8UP_CHART_VERSION="4.10.0"
EXPERIMENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_dependencies() {
  local deps=("kind" "kubectl" "helm")
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
}

deploy_minio() {
  log_info "Deploying MinIO (S3-compatible backup target)"
  # Job pod templates are immutable — delete before reapplying so reruns
  # against an existing cluster don't fail.
  kubectl -n k8up-poc delete job minio-create-bucket --ignore-not-found
  kubectl apply -f "${EXPERIMENT_DIR}/manifests/minio.yaml"
  kubectl -n k8up-poc rollout status deployment/minio --timeout=120s
  kubectl -n k8up-poc wait --for=condition=complete job/minio-create-bucket --timeout=120s
  log_success "MinIO ready, bucket k8up-backups created"
}

install_k8up() {
  log_info "Installing k8up (chart ${K8UP_CHART_VERSION})"

  helm repo add k8up-io https://k8up-io.github.io/k8up 2>/dev/null || true
  helm repo update k8up-io

  kubectl create namespace k8up --dry-run=client -o yaml | kubectl apply -f -

  # Restic repository credentials. Read by the operator (referenced from
  # manifests/k8up-helmvalues.yaml's k8up.envVars as the *global* S3/repo-password
  # config) and injected into every backup/restore/prune Job it spawns — this is
  # what lets every Schedule/Backup/Restore/Prune CR in this POC omit spec.backend.
  kubectl -n k8up create secret generic k8up-repo-credentials \
    --from-literal=username=k8uppoc \
    --from-literal=password=k8uppocsecretkey \
    --from-literal=repository-password=k8uppocResticRepoPassword \
    --dry-run=client -o yaml | kubectl apply -f -

  helm upgrade --install k8up k8up-io/k8up \
    --version "${K8UP_CHART_VERSION}" \
    --namespace k8up \
    -f "${EXPERIMENT_DIR}/manifests/k8up-helmvalues.yaml" \
    --wait --timeout 180s

  kubectl -n k8up rollout status deployment/k8up --timeout=120s

  log_success "k8up installed"
}

deploy_test_app() {
  log_info "Deploying Postgres test app (PVC to back up) and its Schedule"
  kubectl apply -f "${EXPERIMENT_DIR}/manifests/test-app.yaml"
  kubectl -n k8up-poc-app rollout status statefulset/test-app --timeout=180s
  kubectl apply -f "${EXPERIMENT_DIR}/manifests/schedule.yaml"
  kubectl -n k8up-poc-app wait --for=condition=Ready schedule.k8up.io/test-app --timeout=60s
  log_success "Test app and Schedule ready"
}

print_instructions() {
  log_success "=========================================="
  log_success "Bootstrap complete"
  log_success "=========================================="
  echo ""
  echo "Next steps:"
  echo "  mise run poc:validate   # run the backup/restore/prune cycle"
  echo "  mise run poc:teardown   # delete the kind cluster"
}

main() {
  log_info "Bootstrapping k8up local POC (cluster: ${CLUSTER_NAME})"
  check_dependencies
  create_cluster
  deploy_minio
  install_k8up
  deploy_test_app
  print_instructions
}

main "$@"
