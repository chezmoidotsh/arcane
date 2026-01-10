#!/usr/bin/env bash
# =============================================================================
# Setup script for ArgoCD Application Properties experiment
# =============================================================================
# This script creates a k3d cluster with ArgoCD and deploys the test
# ApplicationSet to validate the .argocd-properties.yaml functionality.
#
# The environment is isolated using mise-configured KUBECONFIG and HELM paths
# to prevent interference with production clusters.
#
# Usage:
#   mise run setup    # Recommended - uses mise environment
#   ./scripts/setup.sh  # Direct execution
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
# Use mise environment variable if set, otherwise use default
CLUSTER_NAME="${K3D_CLUSTER_NAME:-argocd-properties-test}"
ARGOCD_CHART_VERSION="9.2.4" # Chart version (includes ArgoCD v2.13.x with ApplicationSet)
EXPERIMENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------
log_info() {
	echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
	echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
	echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
	echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
	local deps=("k3d" "kubectl" "helm")
	local missing=()

	for dep in "${deps[@]}"; do
		if ! command -v "$dep" &>/dev/null; then
			missing+=("$dep")
		fi
	done

	if [[ ${#missing[@]} -gt 0 ]]; then
		log_error "Missing dependencies: ${missing[*]}"
		log_info "Run 'mise install' in this directory to install required tools."
		exit 1
	fi
}

setup_local_dirs() {
	log_info "Setting up isolated environment directories..."

	# Create local directories for isolated configuration
	mkdir -p "${EXPERIMENT_DIR}/.kube"
	mkdir -p "${EXPERIMENT_DIR}/.helm/cache"
	mkdir -p "${EXPERIMENT_DIR}/.helm/config"
	mkdir -p "${EXPERIMENT_DIR}/.helm/data"

	# Export environment if not already set by mise
	export KUBECONFIG="${KUBECONFIG:-${EXPERIMENT_DIR}/.kube/config}"
	export HELM_CACHE_HOME="${HELM_CACHE_HOME:-${EXPERIMENT_DIR}/.helm/cache}"
	export HELM_CONFIG_HOME="${HELM_CONFIG_HOME:-${EXPERIMENT_DIR}/.helm/config}"
	export HELM_DATA_HOME="${HELM_DATA_HOME:-${EXPERIMENT_DIR}/.helm/data}"

	log_success "Environment directories created"
	log_info "KUBECONFIG: ${KUBECONFIG}"
	log_info "HELM_DATA_HOME: ${HELM_DATA_HOME}"
}

# -----------------------------------------------------------------------------
# Main setup steps
# -----------------------------------------------------------------------------
create_cluster() {
	log_info "Creating k3d cluster: ${CLUSTER_NAME}"

	# Check if cluster already exists
	if k3d cluster list 2>/dev/null | grep -q "${CLUSTER_NAME}"; then
		log_warn "Cluster ${CLUSTER_NAME} already exists. Deleting..."
		k3d cluster delete "${CLUSTER_NAME}"
	fi

	# Create cluster - kubeconfig will be written to KUBECONFIG path
	k3d cluster create "${CLUSTER_NAME}" \
		--servers 1 \
		--agents 0 \
		--kubeconfig-update-default=false \
		--kubeconfig-switch-context=false \
		--wait \
		--timeout 120s

	# Get kubeconfig and write to isolated location
	k3d kubeconfig get "${CLUSTER_NAME}" >"${KUBECONFIG}"
	chmod 600 "${KUBECONFIG}"

	log_success "Cluster created successfully"
	log_info "Kubeconfig written to: ${KUBECONFIG}"
}

install_argocd() {
	log_info "Installing ArgoCD (chart version ${ARGOCD_CHART_VERSION})"

	# Create namespace
	kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -

	# Add ArgoCD Helm repo
	helm repo add argo https://argoproj.github.io/argo-helm 2>/dev/null || true
	helm repo update argo

	# Install ArgoCD with ApplicationSet controller enabled
	helm upgrade --install argocd argo/argo-cd \
		--namespace argocd \
		--version "${ARGOCD_CHART_VERSION}" \
		--set 'crds.install=true' \
		--set 'crds.keep=false' \
		--set 'configs.params.server\.insecure=true' \
		--set 'server.service.type=NodePort' \
		--set 'configs.secret.argocdServerSecretKey=supersecretkey' \
		--wait \
		--timeout 300s

	log_success "ArgoCD installed successfully"
}

wait_for_argocd() {
	log_info "Waiting for ArgoCD to be ready..."

	kubectl wait --for=condition=available deployment/argocd-server \
		-n argocd \
		--timeout=300s

	kubectl wait --for=condition=available deployment/argocd-applicationset-controller \
		-n argocd \
		--timeout=300s

	log_success "ArgoCD is ready"
}

setup_argocd_projects() {
	log_info "Creating ArgoCD projects..."

	kubectl apply -f "${EXPERIMENT_DIR}/manifests/argocd-projects.yaml"

	log_success "ArgoCD projects created"
}

print_instructions() {
	log_success "=========================================="
	log_success "Setup completed successfully!"
	log_success "=========================================="

	echo ""
	log_info "Environment isolation:"
	echo "  KUBECONFIG: ${KUBECONFIG}"
	echo "  HELM_DATA_HOME: ${HELM_DATA_HOME}"
	echo ""

	log_info "ArgoCD admin password:"
	kubectl -n argocd get secret argocd-initial-admin-secret \
		-o jsonpath="{.data.password}" | base64 -d
	echo ""
	echo ""

	log_info "Next steps:"
	echo "  1. Push the branch to GitHub:"
	echo "     git push -u origin poc/configurable-applications"
	echo ""
	echo "  2. Deploy the ApplicationSet:"
	echo "     mise run deploy"
	echo ""
	echo "  3. Access ArgoCD UI:"
	echo "     mise run ui"
	echo ""
	echo "  4. Run validation tests:"
	echo "     mise run test"
	echo ""
	echo "  5. Cleanup when done:"
	echo "     mise run clean"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
	log_info "Starting ArgoCD Application Properties experiment setup"
	log_info "Cluster name: ${CLUSTER_NAME}"
	echo ""

	check_dependencies
	setup_local_dirs
	create_cluster
	install_argocd
	wait_for_argocd
	setup_argocd_projects
	print_instructions
}

main "$@"
