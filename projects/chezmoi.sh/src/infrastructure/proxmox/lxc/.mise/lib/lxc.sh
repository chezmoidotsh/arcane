#!/usr/bin/env bash
# Common library for Proxmox LXC build / push / upgrade operations.
#
# Each LXC appliance sources this file from its .mise/tasks/lxc/ scripts.
# mise sets CWD to the .mise.toml directory (the LXC appliance dir), so:
#
#   CONFIG_ROOT="$PWD"
#   source "${CONFIG_ROOT}/../.mise/lib/lxc.sh"
#   lxc_init "pve-exporter" "${CONFIG_ROOT}"
#   lxc_secret "secrets/pve-exporter.sops.env" PVE_HOST PVE_TOKEN_VALUE
#   lxc_build
#
# The upgrade flow auto-detects the running container via PVE tags and
# auto-picks the next available VMID.

# Guard against double-sourcing.
[[ -n ${_LXC_LIB_LOADED:-} ]] && return 0
readonly _LXC_LIB_LOADED=1

# Source shared nix library (logging + Docker helpers).
_LXC_REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z ${_LXC_REPO_ROOT} ]]; then
  _LXC_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd ../../../../../../../../.. && pwd)"
fi
# shellcheck source=nix:_lib
[[ -f "${_LXC_REPO_ROOT}/scripts/nix:_lib" ]] && source "${_LXC_REPO_ROOT}/scripts/nix:_lib"

# ============================================================================
# ANSI helpers
# ============================================================================

[[ -z ${CYAN+x} ]] && readonly CYAN=$'\033[0;36m'
[[ -z ${BOLD+x} ]] && readonly BOLD=$'\033[1m'
[[ -z ${DIM+x} ]]  && readonly DIM=$'\033[2m'
[[ -z ${NC+x} ]] && readonly NC=$'\033[0m'

_ok()    { echo -e "  ${GREEN}✓${NC} $*" >&2; }
_fail()  { echo -e "  ${RED}✗ $*${NC}" >&2; }
_info()  { echo -e "  ${BLUE}○${NC} $*" >&2; }
_warn()  { echo -e "  ${YELLOW}⚠ $*${NC}" >&2; }
_hdr()   { echo -e "${CYAN}${BOLD}$*${NC}" >&2; }

# ============================================================================
# Step runner (upgrade progress display)
# ============================================================================

_LXC_STEP_CURRENT=0
_LXC_STEP_TOTAL=0
_LXC_UPGRADE_T0=0

_lxc_step_reset() {
  _LXC_STEP_CURRENT=0
  _LXC_STEP_TOTAL="${1:-7}"
  _LXC_UPGRADE_T0=$(date +%s)
}

_lxc_step() {
  _LXC_STEP_CURRENT=$((_LXC_STEP_CURRENT + 1))
  local title="$1"
  local suffix="${2:-}"
  echo "" >&2
  if [[ -n ${suffix} ]]; then
    echo -e "${CYAN}${BOLD}▸ Step ${_LXC_STEP_CURRENT}/${_LXC_STEP_TOTAL}${NC} ${BOLD}—${NC} ${title} ${DIM}${suffix}${NC}" >&2
  else
    echo -e "${CYAN}${BOLD}▸ Step ${_LXC_STEP_CURRENT}/${_LXC_STEP_TOTAL}${NC} ${BOLD}—${NC} ${title}" >&2
  fi
}

_lxc_confirm() {
  local prompt="$1"
  [[ -n ${LXC_YES:-} ]] && return 0
  local confirm
  _lxc_prompt "  ${BOLD}?${NC} ${prompt} ${DIM}[y/N]${NC} " confirm || return 1
  [[ ${confirm} =~ ^[Yy]$ ]]
}

_lxc_prompt() {
  # Print prompt (interpreting \033 escapes) then read into a variable.
  printf '%b' "$1" >&2
  read -r "$2"
}

_lxc_ssh() {
  # trunk-ignore(shellcheck/SC2029): local vars expanded on client intentionally
  ssh "root@${1}" "${2}"
}

# ============================================================================
# lxc_init  — register the LXC name, tags, and resolve version/template paths
# ============================================================================

lxc_init() {
  local name="$1"
  local config_root="$2"
  shift 2

  readonly LXC_NAME="${name}"
  readonly LXC_CONFIG_ROOT="${config_root}"
  readonly LXC_VMID_BASE="${LXC_VMID_BASE:-100}"

  # Tags for PVE detection — always includes the name, plus any extras passed.
  local tags="${name}"
  if [[ $# -gt 0 ]]; then
    tags="${name} $*"
  fi
  readonly LXC_TAGS="${tags}"

  # Detect version from flake.nix (handles both 'version' and 'imageVersion')
  local ver
  ver=$(grep -m1 -oE '(imageVersion|version) = "[^"]*"' "${LXC_CONFIG_ROOT}/flake.nix" \
    | sed 's/.*"\(.*\)"/\1/')
  [[ -n ${ver} ]] || {
    echo -e "${RED}[ERROR]${NC} Could not detect version from ${LXC_CONFIG_ROOT}/flake.nix" >&2
    return 1
  }
  readonly LXC_VERSION="${ver}"
  readonly LXC_TEMPLATE="${LXC_NAME}.${LXC_VERSION}-amd64.tar.xz"
  readonly LXC_ARTIFACT="${LXC_CONFIG_ROOT}/${LXC_TEMPLATE}"
  readonly LXC_REMOTE_PATH="/var/lib/vz/template/cache/${LXC_TEMPLATE}"
}

# ============================================================================
# Secrets — register SOPS keys to extract at build time
# ============================================================================

_LXC_SECRET_FILES=()
_LXC_SECRET_KEYS=()
_LXC_SECRET_OPT=()

# Register required secrets from a SOPS file.
# Usage: lxc_secret "secrets/caddy.sops.env" CLOUDFLARE_API_TOKEN TAILSCALE_OAUTH_KEY
lxc_secret() {
  local file="$1"; shift
  local key
  for key in "$@"; do
    _LXC_SECRET_FILES+=("${file}")
    _LXC_SECRET_KEYS+=("${key}")
    _LXC_SECRET_OPT+=("")
  done
}

# Register optional secrets (empty string if file/key missing).
# Usage: lxc_secret_optional "secrets/omni.sops.env" OMNI_SERVICE_ACCOUNT_KEY
lxc_secret_optional() {
  local file="$1"; shift
  local key
  for key in "$@"; do
    _LXC_SECRET_FILES+=("${file}")
    _LXC_SECRET_KEYS+=("${key}")
    _LXC_SECRET_OPT+=("1")
  done
}

# ============================================================================
# lxc_build — build the LXC template with secrets baked in
# ============================================================================

lxc_build() {
  local extracted=()

  # Validate and extract secrets
  local i
  for ((i = 0; i < ${#_LXC_SECRET_KEYS[@]}; i++)); do
    local rel_file="${_LXC_SECRET_FILES[$i]}"
    local key="${_LXC_SECRET_KEYS[$i]}"
    local optional="${_LXC_SECRET_OPT[$i]:-}"
    local sops_file="${LXC_CONFIG_ROOT}/${rel_file}"

    if [[ ! -f ${sops_file} ]]; then
      if [[ -n ${optional} ]]; then
        export "${key}="
        extracted+=("${key}")
        continue
      fi
      echo -e "${RED}[ERROR]${NC} ${rel_file} not found — run 'mise run lxc:secrets:sync' first" >&2
      return 1
    fi

    local value
    value=$(sops -d --extract "[\"${key}\"]" "${sops_file}" 2>/dev/null || true)

    if [[ -z ${value} && -z ${optional} ]]; then
      echo -e "${RED}[ERROR]${NC} ${key} is empty in ${rel_file}" >&2
      return 1
    fi

    export "${key}=${value}"
    extracted+=("${key}")
  done

  echo -e "${BLUE}[INFO]${NC} Building ${LXC_NAME}.${LXC_VERSION}-amd64..." >&2
  nix:build:lxc --impure --output-name "${LXC_NAME}.${LXC_VERSION}-amd64" "${LXC_CONFIG_ROOT}"

  # Cleanup secrets from environment
  local k
  for k in "${extracted[@]}"; do
    unset "${k}"
  done
}

# ============================================================================
# lxc_push — upload template with SHA-256 dedup
# ============================================================================

lxc_push() {
  local pve_host="$1"

  [[ -f ${LXC_ARTIFACT} ]] || {
    echo -e "${RED}[ERROR]${NC} ${LXC_ARTIFACT} not found — run 'mise run lxc:build' first" >&2
    return 1
  }

  local local_sha
  local_sha=$(shasum -a 256 "${LXC_ARTIFACT}" | awk '{print $1}')

  local remote_sha
  remote_sha=$(_lxc_ssh "${pve_host}" "sha256sum '${LXC_REMOTE_PATH}' 2>/dev/null | awk '{print \$1}'" 2>/dev/null || true)

  if [[ ${local_sha} == "${remote_sha}" && -n ${remote_sha} ]]; then
    echo -e "${BLUE}[INFO]${NC} ${LXC_TEMPLATE} already on ${pve_host} (SHA matches), skipping." >&2
    return 0
  fi

  echo -e "${BLUE}[INFO]${NC} Uploading ${LXC_TEMPLATE} to ${pve_host}..." >&2
  scp "${LXC_ARTIFACT}" "root@${pve_host}:${LXC_REMOTE_PATH}"
  echo -e "${GREEN}[SUCCESS]${NC} Template uploaded." >&2
}

# ============================================================================
# Upgrade configuration helpers
# ============================================================================

_LXC_SERVICES=()
_LXC_MP_IDS=()
_LXC_MP_DIRS=()
_LXC_MP_UIDS=()
_LXC_E2E_HINT=""

# Register systemd services to health-check after cutover.
# Usage: lxc_services "caddy" "zot" "lxc-agent"
lxc_services() {
  _LXC_SERVICES=("$@")
}

# Register a subdirectory inside a mount point that needs ownership fixing.
# Usage: lxc_mp "mp0" "zot" 100994
#        lxc_mp "mp0" "caddy" 100997
#        lxc_mp "mp1" "media" 100100
lxc_mp() {
  local mp_id="$1"
  local subdir="$2"
  local uid="$3"
  _LXC_MP_IDS+=("${mp_id}")
  _LXC_MP_DIRS+=("${subdir}")
  _LXC_MP_UIDS+=("${uid}")
}

# Whether this LXC has any persistent mount points (stateful vs stateless).
_lxc_has_mp() {
  [[ ${#_LXC_MP_IDS[@]} -gt 0 ]]
}

# Print unique mount point IDs (e.g. mp0, mp1) from the registrations.
_lxc_unique_mp_ids() {
  [[ ${#_LXC_MP_IDS[@]} -eq 0 ]] && return 0
  local seen=""
  local id
  for id in "${_LXC_MP_IDS[@]}"; do
    if [[ "${seen}" != *" ${id} "* ]]; then
      echo "${id}"
      seen+=" ${id} "
    fi
  done
}

# Set an end-to-end check hint shown after health verification.
# Usage: lxc_e2e_hint "curl -sSf https://oci.chezmoi.sh/v2/"
lxc_e2e_hint() {
  _LXC_E2E_HINT="$1"
}

# ============================================================================
# PVE helpers — VMID auto-detection
# ============================================================================

# Build a grep -E pattern from LXC_TAGS (pipe-separated alternation).
_lxc_tag_pattern() {
  local pattern=""
  local t
  for t in ${LXC_TAGS}; do
    [[ -n ${pattern} ]] && pattern+="|"
    pattern+="${t}"
  done
  echo "${pattern}"
}

# Find the VMID of the running container for this LXC by PVE tag or hostname.
_lxc_detect_source() {
  local pve_host="$1"
  local tag_pattern
  tag_pattern=$(_lxc_tag_pattern)

  # Search by tag first (any of LXC_TAGS), then fall back to hostname match.
  _lxc_ssh "${pve_host}" "
    # By tag
    for f in /etc/pve/lxc/*.conf; do
      [[ -f \"\$f\" ]] || continue
      tags=\$(grep '^tags:' \"\$f\" 2>/dev/null | sed 's/tags: //')
      echo \"\$tags\" | tr ';' '\\n' | grep -qxE '${tag_pattern}' && {
        vmid=\$(basename \"\$f\" .conf)
        hostname=\$(grep '^hostname:' \"\$f\" | awk '{print \$2}')
        echo \"\${vmid} \${hostname}\"
        exit 0
      }
    done
    # By hostname
    for f in /etc/pve/lxc/*.conf; do
      [[ -f \"\$f\" ]] || continue
      hostname=\$(grep '^hostname:' \"\$f\" | awk '{print \$2}')
      if [[ \"\${hostname}\" == '${LXC_NAME}' || \"\${hostname}\" == '${LXC_NAME}.lan' ]]; then
        vmid=\$(basename \"\$f\" .conf)
        echo \"\${vmid} \${hostname}\"
        exit 0
      fi
    done
  " 2>/dev/null || true
}

# Find the first free VMID at or above the configured base.
_lxc_pick_target() {
  local pve_host="$1"
  local base="${LXC_VMID_BASE:-100}"
  local used
  used=$(_lxc_ssh "${pve_host}" "
    pct list | awk 'NR>1 {print \$1}'
    ls /etc/pve/qemu-server/ 2>/dev/null | sed 's/\\.conf\$//'
  " 2>/dev/null || true)

  local candidate="${base}"
  while echo "${used}" | grep -qx "${candidate}"; do
    candidate=$((candidate + 1))
  done
  echo "${candidate}"
}

# ============================================================================
# lxc_upgrade — full rootfs-swap upgrade with interactive UI
# ============================================================================

lxc_upgrade() {
  local pve_host="" source_id="" target_id="" version="" auto_yes=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --pve-host)   pve_host="$2";   shift 2 ;;
      --source-id)  source_id="$2";  shift 2 ;;
      --target-id)  target_id="$2";  shift 2 ;;
      --version)    version="$2";    shift 2 ;;
      --yes|-y)     auto_yes="1";    shift ;;
      *) echo -e "${RED}[ERROR]${NC} Unknown argument: $1" >&2; return 1 ;;
    esac
  done

  [[ -n ${pve_host} ]] || { echo -e "${RED}[ERROR]${NC} --pve-host is required." >&2; return 1; }
  readonly LXC_YES="${auto_yes}"

  # Resolve version
  if [[ -n ${version} ]]; then
    readonly LXC_UPG_VERSION="${version}"
    local template="${LXC_NAME}.${version}-amd64.tar.xz"
    local template_path="/var/lib/vz/template/cache/${template}"
  else
    readonly LXC_UPG_VERSION="${LXC_VERSION}"
    local template="${LXC_TEMPLATE}"
    local template_path="${LXC_REMOTE_PATH}"
  fi

  _lxc_step_reset 7

  echo "" >&2
  _hdr "Initiating ${LXC_NAME} upgrade"

  # ------------------------------------------------------------------
  # Resolve source VMID (auto-detect via tags/hostname)
  # ------------------------------------------------------------------
  local source_hostname=""

  if [[ -z ${source_id} ]]; then
    local detected
    detected=$(_lxc_detect_source "${pve_host}")

    if [[ -n ${detected} ]]; then
      source_id=$(echo "${detected}" | awk '{print $1}')
      source_hostname=$(echo "${detected}" | awk '{print $2}')
      _info "Detected CT ${source_id} (${source_hostname}) via tags/hostname"
    fi

    if [[ -z ${source_id} ]]; then
      if [[ -n ${LXC_YES} ]]; then
        echo -e "${RED}[ERROR]${NC} Cannot auto-detect source CT — use --source-id." >&2
        return 1
      fi
      _lxc_prompt "  ${BOLD}?${NC} Source CT VMID (no auto-match found): " source_id || true
      [[ -n ${source_id} ]] || { echo -e "${RED}[ERROR]${NC} Source VMID is required." >&2; return 1; }
    else
      if [[ -z ${LXC_YES} && -t 0 ]]; then
        local override
        _lxc_prompt "  ${BOLD}?${NC} Source CT ${DIM}[${source_id}]${NC}: " override || true
        [[ -n ${override} ]] && source_id="${override}"
      fi
    fi
  fi

  # ------------------------------------------------------------------
  # Resolve target VMID (auto-pick next free)
  # ------------------------------------------------------------------
  if [[ -z ${target_id} ]]; then
    target_id=$(_lxc_pick_target "${pve_host}")
    _info "Auto-picked target VMID: ${target_id}"
    if [[ -z ${LXC_YES} && -t 0 ]]; then
      local override
      _lxc_prompt "  ${BOLD}?${NC} Target CT ${DIM}[${target_id}]${NC}: " override || true
      [[ -n ${override} ]] && target_id="${override}"
    fi
  fi

  # ------------------------------------------------------------------
  # Header / summary
  # ------------------------------------------------------------------
  echo "" >&2
  _hdr "${LXC_NAME} · upgrade"
  echo -e "${CYAN}${DIM}──────────────────────────────────────────────────────${NC}" >&2
  printf "${CYAN}%-12s %s${NC}\n" "Template" "${template}" >&2
  printf "${CYAN}%-12s CT %s%s${NC}\n" "Source" "${source_id}" "${source_hostname:+ (${source_hostname})}" >&2
  printf "${CYAN}%-12s CT %s${NC}\n" "Target" "${target_id}" >&2

  # ==================================================================
  # Step 1 — Pre-flight checks
  # ==================================================================
  _lxc_step "Pre-flight checks"

  if ! _lxc_ssh "${pve_host}" "test -f '${template_path}'"; then
    _fail "Template not found on ${pve_host}: ${template_path}"
    echo -e "${DIM}        Run 'mise run lxc:build && mise run lxc:push -- ${pve_host}'${NC}" >&2
    return 1
  fi
  _ok "Template present on PVE"

  local source_conf
  source_conf=$(_lxc_ssh "${pve_host}" "cat /etc/pve/lxc/${source_id}.conf 2>/dev/null" || true)
  if [[ -z ${source_conf} ]]; then
    _fail "CT ${source_id} does not exist on ${pve_host}."
    return 1
  fi
  [[ -n ${source_hostname} ]] || source_hostname=$(echo "${source_conf}" | awk '/^hostname:/{print $2}')
  _ok "Source CT ${source_id} exists (${source_hostname})"

  local target_conf
  target_conf=$(_lxc_ssh "${pve_host}" "cat /etc/pve/lxc/${target_id}.conf 2>/dev/null" || true)
  if [[ -n ${target_conf} ]]; then
    _fail "CT ${target_id} already exists. Destroy it first or choose another VMID."
    return 1
  fi
  _ok "Target VMID ${target_id} is free"

  # Extract all mpX specs (if any mount points are registered)
  if _lxc_has_mp; then
    local _uid
    while IFS= read -r _uid; do
      [[ -n ${_uid} ]] || continue
      local spec
      spec=$(_lxc_ssh "${pve_host}" "grep '^${_uid}:' /etc/pve/lxc/${source_id}.conf 2>/dev/null | sed 's/^${_uid}: //'" || true)
      if [[ -z ${spec} ]]; then
        _fail "No ${_uid} found in CT ${source_id} config."
        return 1
      fi
      local mnt
      mnt=$(echo "${spec}" | grep -oE 'mp=[^,]+' | cut -d= -f2-)
      _ok "${_uid}: ${spec}"
      # Store spec and mount path for later steps (mp IDs are alphanumeric, safe for eval)
      eval "_MP_SPEC_${_uid}=\"\${spec}\""
      eval "_MP_MOUNT_${_uid}=\"\${mnt}\""
    done <<< "$(_lxc_unique_mp_ids)"
  fi

  if ! _lxc_confirm "Upgrade CT ${source_id} → CT ${target_id}?"; then
    echo -e "  ${DIM}Aborted.${NC}" >&2
    return 1
  fi

  # ==================================================================
  # Step 2 — Create target CT (rootfs only)
  # ==================================================================
  _lxc_step "Create target CT"

  _lxc_ssh "${pve_host}" "
    ROOTFS_LINE=\$(grep '^rootfs:' /etc/pve/lxc/${source_id}.conf | sed 's/^rootfs: //')
    ROOTFS_STORAGE=\$(echo \"\$ROOTFS_LINE\" | cut -d: -f1)
    ROOTFS_SIZE=\$(echo \"\$ROOTFS_LINE\" | grep -oE 'size=[0-9]+' | cut -d= -f2)
    FEATURES=\$(grep '^features:' /etc/pve/lxc/${source_id}.conf | sed 's/^features: //')
    MEMORY=\$(grep '^memory:' /etc/pve/lxc/${source_id}.conf | awk '{print \$2}')
    CORES=\$(grep '^cores:' /etc/pve/lxc/${source_id}.conf | awk '{print \$2}')

    pct create ${target_id} ${template_path} \
      --rootfs \$ROOTFS_STORAGE:\$ROOTFS_SIZE \
      --features \"\$FEATURES\" \
      --memory \$MEMORY \
      --cores \$CORES \
      --swap 0
  "
  _ok "Created CT ${target_id} from template"

  # ==================================================================
  # Step 3 — Smoke-test
  # ==================================================================
  _lxc_step "Smoke-test"

  _lxc_ssh "${pve_host}" "pct start ${target_id}" || true
  sleep 10

  local activation
  activation=$(_lxc_ssh "${pve_host}" "pct exec ${target_id} -- /bin/sh -c 'test -e /run/current-system && echo OK || echo FAIL'" || true)
  if [[ ${activation} != *"OK"* ]]; then
    _fail "NixOS activation failed — is features:nesting=1 set?"
    _lxc_ssh "${pve_host}" "pct stop ${target_id}" 2>/dev/null || true
    return 1
  fi
  _ok "NixOS activation passed"

  _lxc_ssh "${pve_host}" "pct exec ${target_id} -- /run/current-system/sw/bin/bash -lc '
    systemctl is-system-running
    systemctl --failed --no-legend
  '" >&2 || true

  _lxc_ssh "${pve_host}" "pct stop ${target_id}"
  _ok "Smoke test passed"

  # ==================================================================
  # Step 4 — Merge config (rootfs swap)
  # ==================================================================
  if _lxc_has_mp; then
    _lxc_step "Merge config" "(rootfs swap, strip mounts)"
  else
    _lxc_step "Merge config" "(rootfs swap)"
  fi

  _lxc_ssh "${pve_host}" "
    NEW_ROOTFS_VOL=\$(grep '^rootfs:' /etc/pve/lxc/${target_id}.conf | awk '{print \$2}' | cut -d, -f1)
    OLD_ROOTFS_VOL=\$(grep '^rootfs:' /etc/pve/lxc/${source_id}.conf | sed 's/^rootfs: //' | cut -d, -f1)
    sed \"s|\$OLD_ROOTFS_VOL|\$NEW_ROOTFS_VOL|g\" /etc/pve/lxc/${source_id}.conf > /etc/pve/lxc/${target_id}.conf
  "

  # Strip all mpX lines from target config (stateful LXCs)
  if _lxc_has_mp; then
    _lxc_ssh "${pve_host}" "sed -i '/^mp[0-9]:/d' /etc/pve/lxc/${target_id}.conf"
  fi

  # Copy firewall rules
  _lxc_ssh "${pve_host}" "
    if [[ -f /etc/pve/firewall/${source_id}.fw ]]; then
      cp /etc/pve/firewall/${source_id}.fw /etc/pve/firewall/${target_id}.fw
    fi
  " 2>/dev/null || true
  _ok "Config merged"

  # ==================================================================
  # Step 5 — Cutover (downtime starts)
  # ==================================================================
  if ! _lxc_confirm "Ready to cut over? (CT ${source_id} will stop)"; then
    echo -e "  ${DIM}Aborted — target ready but not started.${NC}" >&2
    return 0
  fi

  _lxc_step "Cutover" "(downtime)"
  local t0
  t0=$(date +%s)

  if _lxc_has_mp; then
    # Build detach + attach commands for all mount points
    local mp_detach=""
    local mp_attach=""
    local _uid
    while IFS= read -r _uid; do
      [[ -n ${_uid} ]] || continue
      eval "local spec=\"\${_MP_SPEC_${_uid}}\""
      mp_detach+="pct set ${source_id} --delete ${_uid}; "
      mp_attach+="pct set ${target_id} -${_uid} '${spec}'; "
    done <<< "$(_lxc_unique_mp_ids)"

    _lxc_ssh "${pve_host}" "pct stop ${source_id}; ${mp_detach} ${mp_attach}"

    # Fix ownership on mount subdirectories
    local chown_cmds=""
    local j
    for ((j = 0; j < ${#_LXC_MP_DIRS[@]}; j++)); do
      local mp_id="${_LXC_MP_IDS[$j]}"
      local dir="${_LXC_MP_DIRS[$j]}"
      local uid="${_LXC_MP_UIDS[$j]}"
      eval "local mount_path=\"\${_MP_MOUNT_${mp_id}}\""
      chown_cmds+="mkdir -p /var/lib/lxc/${target_id}/rootfs${mount_path}/${dir}; "
      chown_cmds+="chown --recursive ${uid}:${uid} /var/lib/lxc/${target_id}/rootfs${mount_path}/${dir}; "
    done

    _lxc_ssh "${pve_host}" "
      pct mount ${target_id} >/dev/null
      ${chown_cmds}
      pct unmount ${target_id}
      pct start ${target_id}
    "
  else
    _lxc_ssh "${pve_host}" "
      pct stop ${source_id}
      pct start ${target_id}
    "
  fi

  local elapsed
  elapsed=$(($(date +%s) - t0))
  _ok "Cutover done in ${elapsed}s — services warming up"

  # ==================================================================
  # Step 6 — Health check
  # ==================================================================
  _lxc_step "Health check" "(15s warm-up)"
  sleep 15

  local svc_list=""
  local s
  for s in "${_LXC_SERVICES[@]}"; do
    svc_list+="printf \"%-24s %s\\\\n\" \"${s}\" \"\$(systemctl is-active ${s})\"; "
  done

  _lxc_ssh "${pve_host}" "pct exec ${target_id} -- /run/current-system/sw/bin/bash -lc '
    echo === system ===
    systemctl is-system-running
    systemctl --failed --no-legend
    echo === services ===
    ${svc_list}
  '" >&2 || true

  if [[ -n ${_LXC_E2E_HINT} ]]; then
    echo "" >&2
    echo -e "  ${DIM}End-to-end: ${_LXC_E2E_HINT}${NC}" >&2
    echo "" >&2
  fi

  # ==================================================================
  # Step 7 — Decommission or rollback
  # ==================================================================
  local confirm
  if [[ -n ${LXC_YES} ]]; then
    confirm="y"
  else
    local inp
    _lxc_prompt "  ${BOLD}?${NC} CT ${target_id} is working correctly? ${DIM}[y/N]${NC} " inp || inp=""
    confirm="${inp}"
  fi

  if [[ ${confirm} =~ ^[Yy]$ ]]; then
    _lxc_step "Decommission CT ${source_id}"

    _lxc_ssh "${pve_host}" "
      sed -i '/^rootfs:/d; /^unused0:/d' /etc/pve/lxc/${source_id}.conf
      pct destroy ${source_id}
    "
    local total
    total=$(($(date +%s) - _LXC_UPGRADE_T0))
    echo "" >&2
    echo -e "${GREEN}${BOLD}  ✓ Upgrade complete${NC} — CT ${target_id} (${source_hostname}) is live (${total}s)." >&2
    echo "" >&2
  else
    _lxc_step "Rollback"
    _warn "Rolling back — restarting CT ${source_id}..."

    if _lxc_has_mp; then
      # Reverse all mount point attachments
      local rb_detach=""
      local rb_attach=""
      local _uid
      while IFS= read -r _uid; do
        [[ -n ${_uid} ]] || continue
        eval "local spec=\"\${_MP_SPEC_${_uid}}\""
        rb_detach+="pct set ${target_id} --delete ${_uid}; "
        rb_attach+="pct set ${source_id} -${_uid} '${spec}'; "
      done <<< "$(_lxc_unique_mp_ids)"

      _lxc_ssh "${pve_host}" "
        pct stop ${target_id}
        ${rb_detach} ${rb_attach}
        pct start ${source_id}
      "
    else
      _lxc_ssh "${pve_host}" "
        pct stop ${target_id}
        pct start ${source_id}
      "
    fi
    _ok "Rolled back to CT ${source_id}."
    echo -e "  ${DIM}Destroy the failed target:${NC}" >&2
    echo -e "  ${DIM}  ssh root@${pve_host} \"sed -i '/^unused0:/d' /etc/pve/lxc/${target_id}.conf && pct destroy ${target_id}\"${NC}" >&2
    return 1
  fi
}
