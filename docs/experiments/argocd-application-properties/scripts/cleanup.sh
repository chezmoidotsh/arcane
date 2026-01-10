#!/usr/bin/env bash
# =============================================================================
# Cleanup script for ArgoCD Application Properties experiment
# =============================================================================
# This script removes all resources created by the experiment, including:
# - k3d cluster
# - Local kubeconfig and helm directories
#
# Usage:
#   mise run clean     # Recommended - uses mise environment
#   ./scripts/cleanup.sh  # Direct execution
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
CLUSTER_NAME="${K3D_CLUSTER_NAME:-argocd-properties-test}"
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

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
	echo "=========================================="
	echo "Cleaning up experiment resources"
	echo "=========================================="
	echo ""

	# Delete k3d cluster
	if k3d cluster list 2>/dev/null | grep -q "${CLUSTER_NAME}"; then
		log_info "Deleting k3d cluster: ${CLUSTER_NAME}"
		k3d cluster delete "${CLUSTER_NAME}"
		log_success "Cluster deleted"
	else
		log_warn "Cluster ${CLUSTER_NAME} not found"
	fi

	# Clean up local directories
	if [[ -d "${EXPERIMENT_DIR}/.kube" ]]; then
		log_info "Removing local kubeconfig directory..."
		rm -rf "${EXPERIMENT_DIR}/.kube"
		log_success "Kubeconfig directory removed"
	fi

	if [[ -d "${EXPERIMENT_DIR}/.helm" ]]; then
		log_info "Removing local helm directory..."
		rm -rf "${EXPERIMENT_DIR}/.helm"
		log_success "Helm directory removed"
	fi

	echo ""
	log_success "Cleanup completed"
}

main "$@"
