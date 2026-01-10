#!/usr/bin/env bash
# =============================================================================
# Validation script for ArgoCD Application Properties experiment
# =============================================================================
# This script validates that the ApplicationSet correctly generates
# applications with the expected configurations based on .argocd-properties.yaml
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
EXPERIMENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------
log_info() {
	echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
	echo -e "${GREEN}[PASS]${NC} $1"
	((TESTS_PASSED += 1))
}

log_fail() {
	echo -e "${RED}[FAIL]${NC} $1"
	((TESTS_FAILED += 1))
}

log_skip() {
	echo -e "${YELLOW}[SKIP]${NC} $1"
	((TESTS_SKIPPED += 1))
}

get_app() {
	local app_name="$1"
	kubectl get application "${app_name}" -n argocd -o json 2>/dev/null
}

app_exists() {
	local app_name="$1"
	kubectl get application "${app_name}" -n argocd &>/dev/null
}

# -----------------------------------------------------------------------------
# Test Cases
# -----------------------------------------------------------------------------

# TC-01: Application without properties file (defaults)
test_app_default() {
	log_info "TC-01: Testing app-default (no properties file, all defaults)"

	if ! app_exists "app-default"; then
		log_skip "TC-01: app-default not found (ApplicationSet may not be deployed)"
		return
	fi

	local app_json
	app_json=$(get_app "app-default")

	# Check namespace (should be folder name)
	local namespace
	namespace=$(echo "$app_json" | jq -r '.spec.destination.namespace')
	if [[ $namespace == "app-default" ]]; then
		log_success "TC-01a: Namespace is folder name (app-default)"
	else
		log_fail "TC-01a: Expected namespace 'app-default', got '${namespace}'"
	fi

	# Check project (should be default 'applications')
	local project
	project=$(echo "$app_json" | jq -r '.spec.project')
	if [[ $project == "default" ]]; then
		log_success "TC-01b: Project is default (default)"
	else
		log_fail "TC-01b: Expected project 'default', got '${project}'"
	fi

	# Check syncPolicy (should be automated)
	local automated
	automated=$(echo "$app_json" | jq -r '.spec.syncPolicy.automated')
	if [[ $automated != "null" ]]; then
		log_success "TC-01c: SyncPolicy is automated"
	else
		log_fail "TC-01c: Expected automated syncPolicy, got manual"
	fi

	# Check info (should be empty or null)
	local info_count
	info_count=$(echo "$app_json" | jq '.spec.info | length // 0')
	if [[ $info_count -eq 0 ]]; then
		log_success "TC-01d: Info is empty (default)"
	else
		log_fail "TC-01d: Expected empty info, got ${info_count} entries"
	fi
}

# TC-02: Application with info metadata
test_app_with_info() {
	log_info "TC-02: Testing app-with-info (info metadata only)"

	if ! app_exists "app-with-info"; then
		log_skip "TC-02: app-with-info not found"
		return
	fi

	local app_json
	app_json=$(get_app "app-with-info")

	# Check info exists
	local info_count
	info_count=$(echo "$app_json" | jq '.spec.info | length // 0')
	if [[ $info_count -gt 0 ]]; then
		log_success "TC-02a: Info array has ${info_count} entries"
	else
		log_fail "TC-02a: Expected info entries, got none"
	fi

	# Check specific info field (Description)
	local description
	description=$(echo "$app_json" | jq -r '.spec.info[]? | select(.name == "Description") | .value // empty')
	if [[ -n $description ]]; then
		log_success "TC-02b: Description field found: ${description:0:30}..."
	else
		log_fail "TC-02b: Description field not found in info"
	fi

	# Check Version field
	local version
	version=$(echo "$app_json" | jq -r '.spec.info[]? | select(.name == "Version") | .value // empty')
	if [[ $version == "1.0.0" ]]; then
		log_success "TC-02c: Version field matches (1.0.0)"
	else
		log_fail "TC-02c: Expected Version '1.0.0', got '${version}'"
	fi

	# Check syncPolicy is still automated (default)
	local automated
	automated=$(echo "$app_json" | jq -r '.spec.syncPolicy.automated')
	if [[ $automated != "null" ]]; then
		log_success "TC-02d: SyncPolicy remains automated (default preserved)"
	else
		log_fail "TC-02d: Expected automated syncPolicy (default)"
	fi
}

# TC-03: Application with manual sync
test_app_manual_sync() {
	log_info "TC-03: Testing app-manual-sync (syncPolicy: null)"

	if ! app_exists "app-manual-sync"; then
		log_skip "TC-03: app-manual-sync not found"
		return
	fi

	local app_json
	app_json=$(get_app "app-manual-sync")

	# Check syncPolicy is not defined (manual)
	local syncPolicy
	syncPolicy=$(echo "$app_json" | jq -r '.spec.syncPolicy // "null"')
	if [[ $syncPolicy == "null" ]]; then
		log_success "TC-03a: SyncPolicy is manual (no automated block)"
	else
		log_fail "TC-03a: Expected no syncPolicy, got one"
	fi

	# Check info is still populated
	local info_count
	info_count=$(echo "$app_json" | jq '.spec.info | length // 0')
	if [[ $info_count -gt 0 ]]; then
		log_success "TC-03d: Info array populated with ${info_count} entries"
	else
		log_fail "TC-03d: Expected info entries"
	fi
}

# TC-04: Application with custom namespace
test_app_custom_namespace() {
	log_info "TC-04: Testing app-custom-namespace (destination.namespace override)"

	if ! app_exists "app-custom-namespace"; then
		log_skip "TC-04: app-custom-namespace not found"
		return
	fi

	local app_json
	app_json=$(get_app "app-custom-namespace")

	# Check namespace override
	local namespace
	namespace=$(echo "$app_json" | jq -r '.spec.destination.namespace')
	if [[ $namespace == "monitoring" ]]; then
		log_success "TC-04a: Namespace override applied (monitoring)"
	else
		log_fail "TC-04a: Expected namespace 'monitoring', got '${namespace}'"
	fi

	# Check project is still default
	local project
	project=$(echo "$app_json" | jq -r '.spec.project')
	if [[ $project == "default" ]]; then
		log_success "TC-04b: Project remains default (default)"
	else
		log_fail "TC-04b: Expected project 'default', got '${project}'"
	fi
}

# TC-06: ApplicationSet generation check
test_applicationset_generation() {
	log_info "TC-05: Testing ApplicationSet generation"

	# Check if ApplicationSet exists
	if ! kubectl get applicationset applications -n argocd &>/dev/null; then
		log_skip "TC-05: ApplicationSet 'applications' not found"
		return
	fi

	# Count generated applications
	local app_count
	app_count=$(kubectl get applications -n argocd -o name | wc -l | tr -d ' ')

	if [[ $app_count -ge 4 ]]; then
		log_success "TC-05a: ApplicationSet generated ${app_count} applications"
	else
		log_fail "TC-05a: Expected at least 4 applications, got ${app_count}"
	fi

	# Check ApplicationSet status
	local status
	status=$(kubectl get applicationset applications -n argocd -o jsonpath='{.status.conditions[?(@.type=="ErrorOccurred")].status}' 2>/dev/null || echo "Unknown")

	if [[ $status == "False" ]] || [[ $status == "" ]]; then
		log_success "TC-05b: ApplicationSet has no errors"
	else
		log_fail "TC-05b: ApplicationSet has errors"
	fi
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
print_summary() {
	echo ""
	echo "=========================================="
	echo "Validation Summary"
	echo "=========================================="
	echo -e "${GREEN}Passed:${NC}  ${TESTS_PASSED}"
	echo -e "${RED}Failed:${NC}  ${TESTS_FAILED}"
	echo -e "${YELLOW}Skipped:${NC} ${TESTS_SKIPPED}"
	echo "=========================================="

	if [[ ${TESTS_FAILED} -gt 0 ]]; then
		echo -e "${RED}Some tests failed!${NC}"
		exit 1
	elif [[ ${TESTS_PASSED} -eq 0 ]]; then
		echo -e "${YELLOW}No tests ran - ApplicationSet may not be deployed${NC}"
		exit 2
	else
		echo -e "${GREEN}All tests passed!${NC}"
		exit 0
	fi
}

main() {
	echo "=========================================="
	echo "ArgoCD Application Properties Validation"
	echo "=========================================="
	echo ""

	# Check kubectl connection
	if ! kubectl cluster-info &>/dev/null; then
		log_fail "Cannot connect to Kubernetes cluster"
		exit 1
	fi

	# Run test cases
	test_applicationset_generation
	echo ""
	test_app_default
	echo ""
	test_app_with_info
	echo ""
	test_app_manual_sync
	echo ""
	test_app_custom_namespace

	print_summary
}

main "$@"
