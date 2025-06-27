#!/bin/sh
# trunk-ignore-all(shellcheck/SC3040,shellcheck/SC3045,shellcheck/SC3037,shellcheck/SC3043): this is a shell is not a POSIX shell
# trunk-ignore-all(shellcheck/SC2310): all commands used in if conditions are "safe" to fail

set -euo pipefail

# Note: tini is used as PID 1 via shebang to reap zombie processes
# and forward signals to all processes in its session.

# Prevent core dumps
ulimit -c 0

# Configuration
readonly BAO_CONFIG_DIR="/openbao/config"
readonly SOFTHSM_SECRET_DIR="/run/secrets/softhsm2"
readonly SOFTHSM_TOKENS_TAR="${SOFTHSM_SECRET_DIR}/tokens.tar"
readonly SOFTHSM_PIN_FILE="${SOFTHSM_SECRET_DIR}/pin"
readonly SOFTHSM_HSM_DIR="/run/secrets/openbao/pkcs11"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly CYAN='\033[0;36m'
readonly BLUE='\033[0;34m'
readonly GRAY='\033[0;90m'
readonly NC='\033[0m' # No Color

# Tree characters for better visualization
readonly TREE_BRANCH="├── "
readonly TREE_LAST="└── "
readonly TREE_PIPE="│   "
# readonly TREE_SPACE="    "
readonly CHECK="✓"
readonly CROSS="✗"
readonly ARROW="→"

# Print colored output with tree structure
log_info() { echo -e "${CYAN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_tree() { echo -e "${GRAY}$1${NC}$2"; }
log_tree_ok() { echo -e "${GRAY}$1${GREEN}${CHECK}${NC} $2"; }
log_tree_warn() { echo -e "${GRAY}$1${YELLOW}${CROSS}${NC} $2"; }
log_tree_info() { echo -e "${GRAY}$1${BLUE}${ARROW}${NC} $2"; }

# Setup SoftHSMv2 tokens (always run, but silent if tokens not available)
setup_hsm_tokens() {
	echo "🔧 Initializing OpenBao Environment"
	log_tree "${TREE_BRANCH}" "SoftHSMv2 Setup"

	export SOFTHSM2_CONF="${SOFTHSM_HSM_DIR}/softhsm2.conf"

	# Check if SoftHSM2 has been already initialized
	if [ -f "${SOFTHSM_HSM_DIR}/pin" ]; then
		log_tree "${TREE_PIPE}${TREE_LAST}" "${GREEN}${CHECK}${NC} SoftHSMv2 already initialized"
		return 0
	fi

	# Check if tokens are available
	if [ ! -f "${SOFTHSM_TOKENS_TAR}" ]; then
		log_tree "${TREE_PIPE}${TREE_LAST}" "${YELLOW}${CROSS}${NC} Tokens not mounted - HSM features unavailable"
		return 0
	fi

	if [ ! -f "${SOFTHSM_PIN_FILE}" ]; then
		log_tree "${TREE_PIPE}${TREE_LAST}" "${RED}${CROSS}${NC} PIN file not found"
		return 1
	fi

	# Ensure HSM directory exists and is clean
	mkdir -p "${SOFTHSM_HSM_DIR}"
	rm -rf "${SOFTHSM_HSM_DIR:?}"/*

	# Extract tokens
	if ! (cd "${SOFTHSM_HSM_DIR}" && tar --no-same-owner -xf "${SOFTHSM_TOKENS_TAR}"); then
		log_tree "${TREE_PIPE}${TREE_LAST}" "${RED}${CROSS}${NC} Failed to extract tokens"
		return 1
	fi

	# Copy PIN file
	cp "${SOFTHSM_PIN_FILE}" "${SOFTHSM_HSM_DIR}/pin"

	# Verify extraction
	local token_count
	token_count=$(find "${SOFTHSM_HSM_DIR}" -maxdepth 1 -type d -name "*-*-*" | wc -l)

	if [ "${token_count}" -eq 0 ]; then
		log_tree "${TREE_PIPE}${TREE_LAST}" "${RED}${CROSS}${NC} No tokens found after extraction"
		return 1
	fi

	# Create SoftHSM2 configuration
	cat >"${SOFTHSM2_CONF}" <<EOF
# SoftHSMv2 configuration for OpenBao
directories.tokendir = ${SOFTHSM_HSM_DIR}
objectstore.backend = file
log.level = INFO
EOF

	log_tree "${TREE_PIPE}${TREE_LAST}" "${GREEN}${CHECK}${NC} Tokens extracted and configured (${token_count} tokens)"
	return 0
}

# Check if OpenBao config uses PKCS#11 seal
has_pkcs11_seal() {
	if [ ! -d "${BAO_CONFIG_DIR}" ]; then
		return 1
	fi

	# Look for pkcs11 seal configuration in any .hcl files
	find "${BAO_CONFIG_DIR}" -name "*.hcl" -exec grep -l "pkcs11" {} \; 2>/dev/null | head -1 >/dev/null
}

# Parse PKCS#11 configuration from OpenBao config files using hcl2json and jq
parse_pkcs11_config() {
	if [ ! -d "${BAO_CONFIG_DIR}" ]; then
		return 1
	fi

	# Check if required tools are available
	if ! command -v hcl2json >/dev/null 2>&1; then
		return 1
	fi

	if ! command -v jq >/dev/null 2>&1; then
		return 1
	fi

	# Find config files containing pkcs11 seal blocks and deduplicate
	local config_files
	# trunk-ignore(shellcheck/SC2038): xargs is safe to use here
	config_files=$(find "${BAO_CONFIG_DIR}" -name "*.hcl" -exec grep -l 'seal.*"pkcs11"' {} \; 2>/dev/null |
		xargs -r ls -la |
		awk '{print $5 " " $9}' |
		sort -k1,1nr -k2,2 |
		awk '!seen[$1]++ {print $2}')

	if [ -z "${config_files}" ]; then
		return 1
	fi

	# Parse only the first (largest/newest) config file to avoid duplicates
	local config_file
	config_file=$(echo "${config_files}" | head -1)

	# Convert HCL to JSON and extract PKCS#11 seal configuration
	local json_config
	if ! json_config=$(hcl2json <"${config_file}" 2>/dev/null); then
		return 1
	fi

	# Extract seal configurations and find pkcs11 ones
	local pkcs11_seals
	pkcs11_seals=$(echo "${json_config}" | jq -r '.seal.pkcs11[0] // empty' 2>/dev/null)

	if [ -z "${pkcs11_seals}" ]; then
		return 1
	fi

	# Extract individual configuration values
	local lib slot token_label pin key_label default_key_label key_id mechanism rsa_oaep_hash

	lib=$(echo "${pkcs11_seals}" | jq -r '.lib // empty' 2>/dev/null)
	slot=$(echo "${pkcs11_seals}" | jq -r '.slot // empty' 2>/dev/null)
	token_label=$(echo "${pkcs11_seals}" | jq -r '.token_label // empty' 2>/dev/null)
	pin=$(echo "${pkcs11_seals}" | jq -r '.pin // empty' 2>/dev/null)
	key_label=$(echo "${pkcs11_seals}" | jq -r '.key_label // empty' 2>/dev/null)
	default_key_label=$(echo "${pkcs11_seals}" | jq -r '.default_key_label // empty' 2>/dev/null)
	key_id=$(echo "${pkcs11_seals}" | jq -r '.key_id // empty' 2>/dev/null)
	mechanism=$(echo "${pkcs11_seals}" | jq -r '.mechanism // empty' 2>/dev/null)
	rsa_oaep_hash=$(echo "${pkcs11_seals}" | jq -r '.rsa_oaep_hash // empty' 2>/dev/null)

	# Export configuration values
	[ -n "${lib}" ] && export CONFIG_BAO_HSM_LIB="${lib}"
	[ -n "${slot}" ] && export CONFIG_BAO_HSM_SLOT="${slot}"
	[ -n "${token_label}" ] && export CONFIG_BAO_HSM_TOKEN_LABEL="${token_label}"
	[ -n "${pin}" ] && export CONFIG_BAO_HSM_PIN="${pin}"
	[ -n "${key_label}" ] && export CONFIG_BAO_HSM_KEY_LABEL="${key_label}"
	[ -n "${default_key_label}" ] && export CONFIG_BAO_HSM_DEFAULT_KEY_LABEL="${default_key_label}"
	[ -n "${key_id}" ] && export CONFIG_BAO_HSM_KEY_ID="${key_id}"
	[ -n "${mechanism}" ] && export CONFIG_BAO_HSM_MECHANISM="${mechanism}"
	[ -n "${rsa_oaep_hash}" ] && export CONFIG_BAO_HSM_RSA_OAEP_HASH="${rsa_oaep_hash}"

	return 0
}

# Get HSM configuration value with fallback priority:
# 1. Environment variable (BAO_HSM_*)
# 2. Parsed config file value (CONFIG_BAO_HSM_*)
# 3. Default value if provided
get_hsm_config() {
	local param_name="$1"
	local default_value="${2-}"

	# Environment variable (highest priority)
	local env_var="BAO_HSM_${param_name}"
	eval "local env_value=\${${env_var}:-}"

	# Config file value (medium priority)
	local config_var="CONFIG_BAO_HSM_${param_name}"
	eval "local config_value=\${${config_var}:-}"

	# Return in priority order
	if [ -n "${env_value}" ]; then
		echo "${env_value}"
	elif [ -n "${config_value}" ]; then
		echo "${config_value}"
	else
		echo "${default_value}"
	fi
}

# Verify SoftHSMv2 tokens accessibility
verify_hsm_tokens() {
	if [ ! -f "${SOFTHSM_TOKENS_TAR}" ]; then
		return 0
	fi

	log_tree "${TREE_BRANCH}" "HSM Verification"

	if ! command -v softhsm2-util >/dev/null 2>&1; then
		log_tree "${TREE_PIPE}${TREE_LAST}" "${RED}${CROSS}${NC} softhsm2-util not found"
		return 1
	fi

	if ! softhsm2-util --show-slots >/dev/null 2>&1; then
		log_tree "${TREE_PIPE}${TREE_LAST}" "${RED}${CROSS}${NC} Cannot access tokens ${RED}(softhsm2-util --show-slots)${NC}"
		return 1
	fi

	log_tree "${TREE_PIPE}${TREE_BRANCH}" "${GREEN}${CHECK}${NC} Tokens accessible"

	# Verify HSM keys if environment variables are set
	verify_hsm_keys

	return 0
}

# Verify HSM keys based on environment variables and config file
verify_hsm_keys() {
	# Parse configuration from OpenBao config files first
	if ! parse_pkcs11_config; then
		log_tree "${TREE_PIPE}${TREE_LAST}" "${YELLOW}${CROSS}${NC} No PKCS#11 config found"
		return 0
	fi

	# Get configuration values with priority: env vars > config file > defaults
	local hsm_lib hsm_slot hsm_token_label hsm_pin hsm_key_label hsm_default_key_label hsm_key_id
	hsm_lib=$(get_hsm_config "LIB")
	hsm_slot=$(get_hsm_config "SLOT")
	hsm_token_label=$(get_hsm_config "TOKEN_LABEL")
	hsm_pin=$(get_hsm_config "PIN")
	hsm_key_label=$(get_hsm_config "KEY_LABEL")
	hsm_default_key_label=$(get_hsm_config "DEFAULT_KEY_LABEL")
	hsm_key_id=$(get_hsm_config "KEY_ID")

	# Check if HSM library is SoftHSMv2
	if [ -n "${hsm_lib}" ]; then
		if ! echo "${hsm_lib}" | grep -i "softhsm" >/dev/null 2>&1; then
			log_tree "${TREE_PIPE}${TREE_LAST}" "${BLUE}${ARROW}${NC} Non-SoftHSMv2 library detected - skipping verification"
			return 0
		fi
	else
		log_tree "${TREE_PIPE}${TREE_LAST}" "${YELLOW}${CROSS}${NC} No HSM library specified"
		return 0
	fi

	# Check if any HSM configuration is available
	if [ -z "${hsm_token_label}" ] && [ -z "${hsm_slot}" ]; then
		log_tree "${TREE_PIPE}${TREE_LAST}" "${YELLOW}${CROSS}${NC} No token configuration found"
		return 0
	fi

	# Show HSM configuration in a compact tree format
	log_tree "${TREE_PIPE}${TREE_BRANCH}" "Configuration:"
	[ -n "${hsm_token_label}" ] && log_tree "${TREE_PIPE}${TREE_PIPE}${TREE_BRANCH}" "Token: ${CYAN}${hsm_token_label}${NC}"
	[ -n "${hsm_slot}" ] && log_tree "${TREE_PIPE}${TREE_PIPE}${TREE_BRANCH}" "Slot: ${CYAN}${hsm_slot}${NC}"

	# Determine key identification for verification
	local key_to_verify=""
	if [ -n "${hsm_key_label}" ]; then
		key_to_verify="${hsm_key_label}"
		log_tree "${TREE_PIPE}${TREE_PIPE}${TREE_LAST}" "Key: ${CYAN}${hsm_key_label}${NC}"
	elif [ -n "${hsm_default_key_label}" ]; then
		key_to_verify="${hsm_default_key_label}"
		log_tree "${TREE_PIPE}${TREE_PIPE}${TREE_LAST}" "Default Key: ${CYAN}${hsm_default_key_label}${NC}"
	elif [ -n "${hsm_key_id}" ]; then
		key_to_verify="${hsm_key_id}"
		log_tree "${TREE_PIPE}${TREE_PIPE}${TREE_LAST}" "Key ID: ${CYAN}${hsm_key_id}${NC}"
	else
		log_tree "${TREE_PIPE}${TREE_PIPE}${TREE_LAST}" "${YELLOW}No specific key configured${NC}"
	fi

	# Verify key existence using pkcs11-tool
	if ! command -v pkcs11-tool >/dev/null 2>&1; then
		log_tree "${TREE_PIPE}${TREE_LAST}" "${YELLOW}${CROSS}${NC} pkcs11-tool not found - skipping key verification"
		return 0
	fi

	# Build pkcs11-tool command
	local pkcs11_cmd="pkcs11-tool"

	# Add library if specified
	if [ -n "${hsm_lib}" ]; then
		pkcs11_cmd="${pkcs11_cmd} --module ${hsm_lib}"
	fi

	# Add slot or token
	if [ -n "${hsm_slot}" ]; then
		pkcs11_cmd="${pkcs11_cmd} --slot ${hsm_slot}"
	elif [ -n "${hsm_token_label}" ]; then
		pkcs11_cmd="${pkcs11_cmd} --token \"${hsm_token_label}\""
	fi

	# Add PIN if available
	local pin_value=""
	if [ -n "${hsm_pin}" ]; then
		pin_value="${hsm_pin}"
	elif [ -f "${SOFTHSM_HSM_DIR}/pin" ]; then
		pin_value=$(cat "${SOFTHSM_HSM_DIR}/pin")
	fi

	if [ -n "${pin_value}" ]; then
		pkcs11_cmd="${pkcs11_cmd} --pin \"${pin_value}\""
	fi

	# Verify key existence
	if [ -n "${key_to_verify}" ]; then
		# List objects and search for the key
		local list_cmd="${pkcs11_cmd} --list-objects"

		if eval "${list_cmd}" 2>/dev/null | grep -i -E "(label|id).*${key_to_verify}" >/dev/null; then
			log_tree "${TREE_PIPE}${TREE_LAST}" "${GREEN}${CHECK}${NC} Key '${key_to_verify}' verified"
		else
			log_tree "${TREE_PIPE}${TREE_LAST}" "${RED}${CROSS}${NC} Key '${key_to_verify}' not found ${RED}(${list_cmd})${NC}"
			return 1
		fi
	else
		# Basic verification - just check if we can list objects
		local list_cmd="${pkcs11_cmd} --list-objects"

		if eval "${list_cmd}" >/dev/null 2>&1; then
			local object_count
			object_count=$(eval "${list_cmd}" 2>/dev/null | grep -c "Object" || echo "0")
			log_tree "${TREE_PIPE}${TREE_LAST}" "${GREEN}${CHECK}${NC} Token accessible (${object_count} objects)"
		else
			log_tree "${TREE_PIPE}${TREE_LAST}" "${YELLOW}${CROSS}${NC} Could not verify token accessibility"
		fi
	fi

	return 0
}

# Check if we should run OpenBao
should_run_bao() {
	case "${1-}" in
	"") return 1 ;;                                                                                                                                                    # No arguments
	bao) return 0 ;;                                                                                                                                                   # Direct bao command
	-*) return 0 ;;                                                                                                                                                    # Any flag (starts with -)
	server | version | status | auth | kv | policy | audit | lease | operator | path-help | read | write | delete | list | unwrap | token | secrets | sys) return 0 ;; # Known bao commands
	*)
		# Check if it's a valid bao subcommand
		if command -v bao >/dev/null 2>&1 && bao --help "$1" 2>&1 | grep -q "bao $1"; then
			return 0
		fi
		return 1
		;;
	esac
}

# Main execution logic
main() {
	# Always setup HSM tokens (silent if not available)
	setup_hsm_tokens

	# If no arguments, exit
	if [ $# -eq 0 ]; then
		echo ""
		log_info "No command specified - exiting"
		exit 0
	fi

	echo ""

	# Determine if we should run bao
	if should_run_bao "$1"; then
		echo "🚀 Starting OpenBao"

		# Check HSM tokens only if needed
		if has_pkcs11_seal; then
			# HSM verification with improved tree structure
			if ! verify_hsm_tokens; then
				echo ""
				log_error "HSM verification failed but PKCS#11 seal is configured"
				exit 1
			fi
		else
			log_tree "${TREE_LAST}" "${BLUE}${ARROW}${NC} No PKCS#11 seal detected - skipping HSM verification"
		fi

		echo ""

		# If the command is "bao", we remove it from the arguments
		if [ "$1" = "bao" ]; then shift; fi

		set -- bao "$@"

		log_tree "${TREE_LAST}" "${GREEN}▶${NC} Executing: ${CYAN}$*${NC}"
		echo ""
	else
		echo "🔧 Running Custom Command"
		log_tree "${TREE_LAST}" "${GREEN}▶${NC} Executing: ${CYAN}$*${NC}"
		echo ""
	fi

	# Execute the final command
	exec "$@"
}

# Run main function with all arguments
main "$@"
