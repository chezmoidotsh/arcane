#!/usr/bin/env bash
# trunk-ignore-all(shellcheck/SC2155): don't care about masking value
# trunk-ignore-all(shellcheck/SC2312): don't care about masking return value

set -euo pipefail

# ===== CONFIGURATION =====
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Path pattern for parsing project structure
readonly PATH_REGEX='^projects/([^/]+)/src/(apps|infrastructure/kubernetes)/(.+)$'
readonly YAML_PATH_REGEX='^projects/([^/]+)/src/(apps|infrastructure/kubernetes)/(.+)\.ya?ml$'

# ===== UTILITY FUNCTIONS =====
# Check if required tools are available
check_dependencies() {
	local missing_tools=()

	for tool in "$@"; do
		if ! command -v "${tool}" &>/dev/null; then
			missing_tools+=("${tool}")
		fi
	done

	if [[ ${#missing_tools[@]} -gt 0 ]]; then
		gum log --structured --level error "Missing required tools: ${missing_tools[*]}. Please install them to continue."
		exit 1
	fi
}

# Normalize a path relative to the project root
normalize_path() {
	local path="$1"
	local original_path="${path}"

	# Handle current directory and relative paths
	case "${path}" in
	".")
		path="$(pwd)"
		;;
	/*)
		# Already absolute path
		;;
	*)
		# Relative path - convert to absolute
		path="$(realpath "${path}" 2>/dev/null || echo "${PWD}/${path}")"
		;;
	esac

	# Validate path exists
	if [[ ! -e ${path} ]]; then
		gum log --structured --level error "Path '${original_path}' does not exist."
		exit 1
	fi

	# Normalize path relative to project root
	path="$(realpath --relative-to="${PROJECT_ROOT}" "${path}" 2>/dev/null || echo "${path}")"

	# Strip project root if still absolute
	path="${path#"${PROJECT_ROOT}"/}"

	echo "${path}"
}

# Parse a YAML file path and extract cluster/app information
parse_yaml_path() {
	local yaml_path
	yaml_path="$(normalize_path "$1")"

	# Validate it's a YAML file
	if [[ ! ${yaml_path} =~ \.(yaml|yml)$ ]]; then
		gum log --structured --level error "File '$1' is not a YAML file."
		exit 1
	fi

	# Parse format: projects/<cluster>/src/<type>/<app>/<file>.yaml
	if [[ ! ${yaml_path} =~ ${YAML_PATH_REGEX} ]]; then
		gum log --structured --level error "Invalid path format. Expected: projects/<cluster>/src/apps/<app>/<file>.yaml"
		gum log --structured --level error "Or: projects/<cluster>/src/infrastructure/kubernetes/<app>/<file>.yaml"
		gum log --structured --level error "Resolved path: '${yaml_path}'"
		gum log --structured --level error "Current directory: $(pwd), Project root: ${PROJECT_ROOT}"
		exit 1
	fi

	export YAML_PATH="${yaml_path}"
	export CLUSTER_NAME="${BASH_REMATCH[1]}"
	export APP_TYPE="${BASH_REMATCH[2]}"
	export APP_PATH="${BASH_REMATCH[3]}"

	gum log --structured --level info "YAML file parsed:"
	gum log --structured --level info "  File: ${yaml_path}"
	gum log --structured --level info "  Cluster: ${CLUSTER_NAME}"
	gum log --structured --level info "  Type: ${APP_TYPE}"
	gum log --structured --level info "  App Path: ${APP_PATH}"
}

# Parse an application directory path and extract cluster/app information
parse_app_path() {
	local app_path
	app_path="$(normalize_path "$1")"

	# Validate it's a directory
	if [[ ! -d "${PROJECT_ROOT}/${app_path}" ]]; then
		gum log --structured --level error "Path '$1' is not a directory."
		exit 1
	fi

	# Parse format: projects/<cluster>/src/<type>/<app>
	if [[ ! ${app_path} =~ ${PATH_REGEX} ]]; then
		gum log --structured --level error "Invalid path format. Expected: projects/<cluster>/src/apps/<app>"
		gum log --structured --level error "Or: projects/<cluster>/src/infrastructure/kubernetes/<app>"
		gum log --structured --level error "Resolved path: '${app_path}'"
		gum log --structured --level error "Current directory: $(pwd), Project root: ${PROJECT_ROOT}"
		exit 1
	fi

	local cluster="${BASH_REMATCH[1]}"
	local app_type="${BASH_REMATCH[2]}"
	local app_name="${BASH_REMATCH[3]#\*}" # Remove '*' prefix if exists
	local app_project="system"

	# Set project based on app type
	[[ ${app_type} != "infrastructure/kubernetes" ]] && app_project="applications"

	export APP_PATH="${app_path}"
	export CLUSTER_NAME="${cluster}"
	export APP_NAME="${app_name}"
	export APP_PROJECT="${app_project}"
	export APP_TYPE="${app_type}"

	gum log --structured --level info "Application parsed:"
	gum log --structured --level info "  Cluster: ${CLUSTER_NAME}"
	gum log --structured --level info "  Application: ${APP_NAME}"
	gum log --structured --level info "  Project: ${APP_PROJECT}"
	gum log --structured --level info "  Type: ${APP_TYPE}"
}

# Determine the appropriate Kubernetes context
determine_context() {
	local provided_context=""
	local cluster_name="$1"

	if [[ -z ${cluster_name} ]]; then
		gum log --structured --level error "Cluster name is required"
		exit 1
	fi

	local context=""

	# Use provided context if available
	if [[ -n ${KUBE_CONTEXT-} ]]; then
		context="${KUBE_CONTEXT}"
		gum log --structured --level info "Using environment context: ${context}"
	else
		# Try to derive context from cluster name
		local available_contexts
		available_contexts=$(kubectl config get-contexts -o name 2>/dev/null || echo "")

		if [[ -n ${available_contexts} ]]; then
			# Look for exact match first
			if echo "${available_contexts}" | grep -q "^${cluster_name}$"; then
				context="${cluster_name}"
				gum log --structured --level info "Found exact context match: ${context}"
			else
				# Look for partial match
				local partial_match
				partial_match=$(echo "${available_contexts}" | grep "${cluster_name}" | head -1)
				if [[ -n ${partial_match} ]]; then
					context="${partial_match}"
					gum log --structured --level info "Found partial context match: ${context}"
				else
					# Let user choose interactively
					gum style --border normal --margin "1" --padding "1" --border-foreground 212 "Select Kubernetes Context"
					context=$(echo "${available_contexts}" | gum choose --header "Select the Kubernetes context to use")
					if [[ -z ${context} ]]; then
						gum log --structured --level error "No context selected. Aborting."
						exit 1
					fi
				fi
			fi
		else
			gum log --structured --level error "No Kubernetes contexts available. Please configure kubectl."
			exit 1
		fi
	fi

	echo "${context}"
}

# Generate application deployment namespace
generate_dest_namespace() {
	local app_type="$1"
	local app_name="$2"
	local cluster_name="$3"

	if [[ ${app_type} == "infrastructure/kubernetes" ]]; then
		echo "${app_name}-system"
	else
		echo "${cluster_name//\./-}"
	fi
}

# Generate the actual application namespace (not ArgoCD namespace)
# For CNPG backups, we need the namespace where the PostgreSQL cluster is deployed
generate_app_namespace() {
	local app_type="$1"
	local app_path="$2"

	# Extract the app name from the path, removing any '*' prefix
	local app_name=$(basename "$(dirname "${app_path}")")
	app_name="${app_name#\*}" # Remove '*' prefix if exists

	if [[ ${app_type} == "infrastructure/kubernetes" ]]; then
		echo "${app_name}-system"
	else
		echo "${app_name}"
	fi
}

# Parse a file path and return Kubernetes context and application namespace
get_context_and_namespace_from_file() {
	local file_path="$1"

	# Handle both YAML files and directories
	if [[ -f ${file_path} ]]; then
		parse_yaml_path "${file_path}"
		local app_namespace=$(generate_app_namespace "${APP_TYPE}" "${APP_PATH}")
	else
		parse_app_path "${file_path}"
		local app_namespace=$(generate_app_namespace "${APP_TYPE}" "${APP_PATH}")
	fi

	# Determine context
	local context
	context=$(determine_context "${CLUSTER_NAME}")

	echo "${context} ${app_namespace}"
}

# ===== USAGE =====
usage() {
	cat <<'EOF'
Usage: cnpg:backup:create [OPTIONS] <yaml-file>

Create a backup for a CloudNative-PG cluster from its YAML definition.

Arguments:
  yaml-file   Path to the YAML file containing the PostgreSQL cluster definition
              Format: projects/<cluster>/src/apps/<app>/<file>.yaml
              Format: projects/<cluster>/src/infrastructure/kubernetes/<app>/<file>.yaml

Options:
  --context   Kubernetes context to use (if not specified, will be derived from cluster name)
  -h, --help  Show this help message

Examples:
  cnpg:backup:create projects/amiya.akn/src/apps/*vault/openbao.postgresql.yaml
  cnpg:backup:create --context my-cluster projects/maison/src/infrastructure/kubernetes/database/postgres.yaml

Optional environment variables:
  KUBE_CONTEXT    Kubernetes context to use
EOF
}

# ===== BACKUP-SPECIFIC FUNCTIONS =====
# Extract cluster information from a YAML file
# Usage: extract_cluster_info <yaml-file>
# Returns: cluster_name
extract_cluster_info() {
	local yaml_file_arg="$1"

	# Parse the YAML file path first to get access to arcane variables
	parse_yaml_path "${yaml_file_arg}"
	local yaml_file="${PROJECT_ROOT}/${YAML_PATH}"

	gum log --structured --level info "Parsing PostgreSQL cluster information from: ${yaml_file}"

	# Extract cluster name from the YAML file
	local cluster_name

	# Try to find a Cluster resource first
	cluster_name=$(yq eval '.metadata.name // empty' "${yaml_file}" 2>/dev/null | head -1)

	# If no cluster found, try to extract from documents in the file
	if [[ -z ${cluster_name} ]]; then
		cluster_name=$(yq eval 'select(.kind == "Cluster") | .metadata.name' "${yaml_file}" 2>/dev/null | head -1)
	fi

	# Validate we found a cluster
	if [[ -z ${cluster_name} ]]; then
		gum log --structured --level error "No PostgreSQL Cluster resource found in ${yaml_file}"
		exit 1
	fi

	gum log --structured --level info "PostgreSQL cluster name: ${cluster_name}"
	echo "${cluster_name}"
}

verify_cluster_exists() {
	local cluster_name="$1"
	local namespace="$2"
	local context="$3"

	gum log --structured --level info "Verifying cluster '${cluster_name}' exists in namespace '${namespace}'..."

	if ! kubectl get cluster.postgresql.cnpg.io "${cluster_name}" -n "${namespace}" --context "${context}" &>/dev/null; then
		gum log --structured --level error "PostgreSQL cluster '${cluster_name}' not found in namespace '${namespace}'"
		gum log --structured --level error "Available clusters in namespace '${namespace}':"
		kubectl get cluster.postgresql.cnpg.io -n "${namespace}" --context "${context}" 2>/dev/null || echo "  No clusters found"
		exit 1
	fi

	gum log --structured --level info --prefix "✓" "Cluster '${cluster_name}' found in namespace '${namespace}'"
}

create_backup() {
	local cluster_name="$1"
	local namespace="$2"
	local context="$3"
	local backup_name="${cluster_name}-on-demand-$(date +%s)"

	gum log --structured --level info "Creating backup for cluster '${cluster_name}'..."

	local manifest="---
apiVersion: postgresql.cnpg.io/v1
kind: Backup
metadata:
  name: ${backup_name}
  namespace: ${namespace}
spec:
  cluster:
    name: ${cluster_name}
"

	# Confirm backup creation
	gum style --border normal --margin "1" --padding "1" --border-foreground 212 "Backup Confirmation"
	gum confirm "Create backup for cluster '${cluster_name}' in namespace '${namespace}' using context '${context}'?" || exit 0

	gum style --border normal --margin "1" --padding "1" --border-foreground 212 "Applying the following manifest:"
	echo "${manifest}" | gum format --type code --language yaml

	gum spin --spinner dot --title "Creating backup..." -- echo "${manifest}" | kubectl apply --context "${context}" -f -

	gum style --bold --foreground "green" "✔ Backup created successfully!"
	echo
	gum style \
		--border-foreground 212 --border double \
		--align center --width 50 --margin "1" --padding "1" \
		"Backup Name: ${backup_name}" \
		"Namespace:   ${namespace}" \
		"Cluster:     ${cluster_name}" \
		"Context:     ${context}"
	echo
	gum style --italic "To monitor the backup progress, run:"
	gum style --foreground "cyan" "kubectl get backup -n ${namespace} ${backup_name} --context ${context} -w"

	export BACKUP_NAME="${backup_name}"
}

# ===== ARGUMENT PARSING =====
parse_arguments() {
	local provided_context=""
	local yaml_file=""

	while [[ $# -gt 0 ]]; do
		case $1 in
		--context)
			if [[ -z ${2-} ]]; then
				gum log --structured --level error "Option --context requires a value"
				exit 1
			fi
			provided_context="$2"
			shift 2
			;;
		-h | --help)
			usage
			exit 0
			;;
		-*)
			gum log --structured --level error "Unknown option: $1"
			usage
			exit 1
			;;
		*)
			if [[ -n ${yaml_file} ]]; then
				gum log --structured --level error "Multiple files provided. Only one YAML file is allowed."
				exit 1
			fi
			yaml_file="$1"
			shift
			;;
		esac
	done

	# Validate arguments
	if [[ -z ${yaml_file} ]]; then
		gum log --structured --level error "YAML file path is required."
		exit 1
	fi

	export PROVIDED_CONTEXT="${provided_context}"
	export YAML_FILE_ARG="${yaml_file}"
}

# ===== MAIN FUNCTION =====
main() {
	parse_arguments "$@"
	check_dependencies kubectl gum yq

	# Parse the YAML file and extract project info
	local context namespace cluster_name

	# Get the context and namespace info from the file
	read -r context namespace < <(get_context_and_namespace_from_file "${YAML_FILE_ARG}")

	# Override context if provided
	if [[ -n ${PROVIDED_CONTEXT-} ]]; then
		context="${PROVIDED_CONTEXT}"
		gum log --structured --level info "Using provided context: ${context}"
	fi

	# Extract the actual PostgreSQL cluster info from the YAML content
	cluster_name=$(extract_cluster_info "${YAML_FILE_ARG}")

	# Verify and create backup
	verify_cluster_exists "${cluster_name}" "${namespace}" "${context}"
	create_backup "${cluster_name}" "${namespace}" "${context}"

	gum log --structured --level info --prefix "✓" "Backup creation completed successfully!"
}

# Execute if script is called directly
if [[ ${BASH_SOURCE[0]} == "${0}" ]]; then
	main "$@"
fi
