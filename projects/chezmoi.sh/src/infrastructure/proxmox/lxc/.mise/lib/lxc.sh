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
# upgrades it in place (same VMID), using a Proxmox snapshot for rollback.

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

# Find a free VMID at or above the configured base, for disposable/scratch
# CTs used during the upgrade (never the persistent app VMID).
_lxc_pick_free_vmid() {
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

# Attempt automatic rollback if lxc_upgrade aborts unexpectedly (e.g. a
# remote command fails under `set -e`) after the pre-upgrade snapshot was
# taken but before the function reached its own commit/rollback decision.
# Relies on bash's dynamic scoping: pve_host/vmid/snapshot/new_vol are
# lxc_upgrade's local variables, still visible here because the trap fires
# while lxc_upgrade's stack frame is active. A no-op on a clean exit or
# before the snapshot exists; every intentional return path in lxc_upgrade
# clears the trap first with `trap - EXIT` so this never double-fires.
_lxc_recover_on_abort() {
  local ec=$?
  [[ ${ec} -eq 0 ]] && return
  [[ -z ${snapshot:-} ]] && return

  echo "" >&2
  _fail "Upgrade aborted unexpectedly (exit ${ec}) — attempting automatic rollback."
  if _lxc_ssh "${pve_host}" "
    set -e
    pct status ${vmid} | grep -q running && pct stop ${vmid}
    pct rollback ${vmid} ${snapshot}
    pct start ${vmid}
  " 2>/dev/null; then
    _ok "Rolled back CT ${vmid} to snapshot ${snapshot}."
    if [[ -n ${new_vol:-} ]] && ! _lxc_ssh "${pve_host}" "pvesm free ${new_vol}" 2>/dev/null; then
      _warn "Could not free ${new_vol} — free it manually:"
      echo -e "  ${DIM}  ssh root@${pve_host} \"pvesm free ${new_vol}\"${NC}" >&2
    fi
  else
    echo -e "  ${DIM}Automatic rollback failed — recover manually:${NC}" >&2
    echo -e "  ${DIM}  ssh root@${pve_host} \"pct stop ${vmid}; pct rollback ${vmid} ${snapshot}; pct start ${vmid}\"${NC}" >&2
  fi
}

# ============================================================================
# lxc_upgrade — in-place rootfs replacement (same CT, snapshot rollback)
# ============================================================================

lxc_upgrade() {
  local pve_host="" vmid="" version="" auto_yes=""
  local snapshot="" old_vol="" new_vol=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --pve-host) pve_host="$2"; shift 2 ;;
      --vmid)     vmid="$2";     shift 2 ;;
      --version)  version="$2";  shift 2 ;;
      --yes|-y)   auto_yes="1";  shift ;;
      *) echo -e "${RED}[ERROR]${NC} Unknown argument: $1" >&2; return 1 ;;
    esac
  done

  [[ -n ${pve_host} ]] || { echo -e "${RED}[ERROR]${NC} --pve-host is required." >&2; return 1; }
  readonly LXC_YES="${auto_yes}"

  trap _lxc_recover_on_abort EXIT

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
  # Resolve VMID (auto-detect via tags/hostname)
  # ------------------------------------------------------------------
  local hostname=""

  if [[ -z ${vmid} ]]; then
    local detected
    detected=$(_lxc_detect_source "${pve_host}")

    if [[ -n ${detected} ]]; then
      vmid=$(echo "${detected}" | awk '{print $1}')
      hostname=$(echo "${detected}" | awk '{print $2}')
      _info "Detected CT ${vmid} (${hostname}) via tags/hostname"
    fi

    if [[ -z ${vmid} ]]; then
      if [[ -n ${LXC_YES} ]]; then
        echo -e "${RED}[ERROR]${NC} Cannot auto-detect CT — use --vmid." >&2
        return 1
      fi
      _lxc_prompt "  ${BOLD}?${NC} CT VMID (no auto-match found): " vmid || true
      [[ -n ${vmid} ]] || { echo -e "${RED}[ERROR]${NC} VMID is required." >&2; return 1; }
    else
      if [[ -z ${LXC_YES} && -t 0 ]]; then
        local override
        _lxc_prompt "  ${BOLD}?${NC} CT ${DIM}[${vmid}]${NC}: " override || true
        [[ -n ${override} ]] && vmid="${override}"
      fi
    fi
  fi

  [[ ${vmid} =~ ^[0-9]+$ ]] || {
    echo -e "${RED}[ERROR]${NC} Invalid VMID: '${vmid}' (must be numeric)." >&2
    return 1
  }

  # ------------------------------------------------------------------
  # Header / summary
  # ------------------------------------------------------------------
  echo "" >&2
  _hdr "${LXC_NAME} · upgrade"
  echo -e "${CYAN}${DIM}──────────────────────────────────────────────────────${NC}" >&2
  printf "${CYAN}%-12s %s${NC}\n" "Template" "${template}" >&2
  printf "${CYAN}%-12s CT %s%s${NC}\n" "Container" "${vmid}" "${hostname:+ (${hostname})}" >&2

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

  # Use `pct config` (not the raw conf file) everywhere below: once a
  # pre-upgrade snapshot exists, the conf file also contains an embedded
  # [snapname] section with its own copy of every key (rootfs, mpN, ...),
  # and a plain grep on the file would match both and double the value.
  local conf
  conf=$(_lxc_ssh "${pve_host}" "pct config ${vmid} 2>/dev/null" || true)
  if [[ -z ${conf} ]]; then
    _fail "CT ${vmid} does not exist on ${pve_host}."
    return 1
  fi
  [[ -n ${hostname} ]] || hostname=$(echo "${conf}" | awk '/^hostname:/{print $2}')
  _ok "CT ${vmid} exists (${hostname})"

  # A pre-upgrade-* snapshot already present means a previous run created
  # one and never reached step 7 (interrupted, or aborted before the
  # automatic-recovery trap could clean up). Refuse to stack a second
  # snapshot on top — the operator must resolve the existing one first.
  local stray_snap
  stray_snap=$(_lxc_ssh "${pve_host}" "pct listsnapshot ${vmid} 2>/dev/null | grep -oE 'pre-upgrade-[0-9-]+' | head -1" || true)
  if [[ -n ${stray_snap} ]]; then
    _fail "CT ${vmid} already has a snapshot '${stray_snap}' from a previous, unfinished upgrade."
    echo -e "${DIM}        Resolve it first: roll back (ssh root@${pve_host} \"pct stop ${vmid}; pct rollback ${vmid} ${stray_snap}; pct start ${vmid}\")${NC}" >&2
    echo -e "${DIM}        or, if CT ${vmid} already reflects the desired state, delete it (pct delsnapshot ${vmid} ${stray_snap}).${NC}" >&2
    return 1
  fi

  # Confirm registered mount points are still present (they are never
  # detached during an in-place upgrade — this is a sanity check only).
  if _lxc_has_mp; then
    local _uid
    while IFS= read -r _uid; do
      [[ -n ${_uid} ]] || continue
      local spec
      spec=$(_lxc_ssh "${pve_host}" "pct config ${vmid} 2>/dev/null | grep '^${_uid}:' | sed 's/^${_uid}: //'" || true)
      if [[ -z ${spec} ]]; then
        _fail "No ${_uid} found in CT ${vmid} config."
        return 1
      fi
      _ok "${_uid}: ${spec}"
    done <<< "$(_lxc_unique_mp_ids)"
  fi

  if ! _lxc_confirm "Upgrade CT ${vmid} in place to ${LXC_UPG_VERSION}?"; then
    echo -e "  ${DIM}Aborted.${NC}" >&2
    return 1
  fi

  # ==================================================================
  # Step 2 — Temporary CT smoke-test
  # ==================================================================
  _lxc_step "Temporary CT smoke-test"

  local smoke_id
  smoke_id=$(_lxc_pick_free_vmid "${pve_host}")

  _lxc_ssh "${pve_host}" "
    CONF=\$(pct config ${vmid})
    ROOTFS_LINE=\$(echo \"\$CONF\" | grep '^rootfs:' | sed 's/^rootfs: //')
    ROOTFS_STORAGE=\$(echo \"\$ROOTFS_LINE\" | cut -d: -f1)
    ROOTFS_SIZE=\$(echo \"\$ROOTFS_LINE\" | grep -oE 'size=[0-9]+' | cut -d= -f2)
    FEATURES=\$(echo \"\$CONF\" | grep '^features:' | sed 's/^features: //')
    MEMORY=\$(echo \"\$CONF\" | grep '^memory:' | awk '{print \$2}')
    CORES=\$(echo \"\$CONF\" | grep '^cores:' | awk '{print \$2}')

    pct create ${smoke_id} ${template_path} \
      --rootfs \$ROOTFS_STORAGE:\$ROOTFS_SIZE \
      --features \"\$FEATURES\" \
      --memory \$MEMORY \
      --cores \$CORES \
      --swap 0
  "

  _lxc_ssh "${pve_host}" "pct start ${smoke_id}" || true
  sleep 10

  local activation
  activation=$(_lxc_ssh "${pve_host}" "pct exec ${smoke_id} -- /bin/sh -c 'test -e /run/current-system && echo OK || echo FAIL'" || true)
  if [[ ${activation} != *"OK"* ]]; then
    _fail "NixOS activation failed — is features:nesting=1 set?"
    _lxc_ssh "${pve_host}" "pct stop ${smoke_id}" 2>/dev/null || true
    _lxc_ssh "${pve_host}" "pct destroy ${smoke_id}" 2>/dev/null || true
    return 1
  fi
  _ok "NixOS activation passed"

  _lxc_ssh "${pve_host}" "pct exec ${smoke_id} -- /run/current-system/sw/bin/bash -lc '
    systemctl is-system-running
    systemctl --failed --no-legend
  '" >&2 || true

  _lxc_ssh "${pve_host}" "pct stop ${smoke_id}; pct destroy ${smoke_id}"
  _ok "Smoke test passed — temporary CT ${smoke_id} destroyed"

  # ==================================================================
  # Step 3 — Snapshot
  # ==================================================================
  _lxc_step "Snapshot"

  snapshot="pre-upgrade-$(date +%Y%m%d-%H%M%S)"
  _lxc_ssh "${pve_host}" "pct snapshot ${vmid} ${snapshot} --description 'Before upgrade to ${LXC_UPG_VERSION}'"
  _ok "Snapshot ${snapshot} created"

  if ! _lxc_confirm "Ready to start the upgrade? (CT ${vmid} will stop)"; then
    echo -e "  ${DIM}Aborted — snapshot ${snapshot} left in place.${NC}" >&2
    # Nothing has touched the CT yet (still running, unmodified) — declining
    # here is not a failure to recover from, so don't let the abort trap
    # below try to "roll back" a CT that was never actually changed.
    trap - EXIT
    return 1
  fi

  # ==================================================================
  # Step 4 — Stop
  # ==================================================================
  _lxc_step "Stop CT ${vmid}" "(downtime starts)"
  local t0
  t0=$(date +%s)

  _lxc_ssh "${pve_host}" "pct stop ${vmid}"
  _ok "CT ${vmid} stopped"

  # ==================================================================
  # Step 5 — Replace rootfs in-place, start
  # ==================================================================
  _lxc_step "Replace rootfs in-place"

  local scratch_id
  scratch_id=$(_lxc_pick_free_vmid "${pve_host}")

  local swap_result
  swap_result=$(_lxc_ssh "${pve_host}" "
    set -e
    ROOTFS_LINE=\$(pct config ${vmid} | grep '^rootfs:' | sed 's/^rootfs: //')
    ROOTFS_STORAGE=\$(echo \"\$ROOTFS_LINE\" | cut -d: -f1)
    ROOTFS_SIZE=\$(echo \"\$ROOTFS_LINE\" | grep -oE 'size=[0-9]+' | cut -d= -f2)
    OLD_VOL=\$(echo \"\$ROOTFS_LINE\" | cut -d, -f1)

    pct create ${scratch_id} ${template_path} --rootfs \${ROOTFS_STORAGE}:\${ROOTFS_SIZE} >&2

    # Move the freshly-created rootfs volume out of the scratch CT's config
    # and into vmid's, as an 'unused' entry. For same-storage LVM-thin this
    # is a metadata rename (vm-${scratch_id}-disk-0 -> vm-\${VMID}-disk-N),
    # not a data copy — so the new rootfs volume ends up correctly named
    # under vmid's own VMID instead of staying under the disposable scratch
    # VMID forever (which is what silently produced e.g. vm-104-disk-7 as
    # CT 103's rootfs in the past). move-volume also atomically drops the
    # 'rootfs:' key from the scratch config as part of the move, so there's
    # never a window where two configs reference the same volume.
    UNUSED_IDX=0
    while pct config ${vmid} | grep -q \"^unused\${UNUSED_IDX}:\"; do
      UNUSED_IDX=\$((UNUSED_IDX + 1))
    done
    UNUSED_KEY=\"unused\${UNUSED_IDX}\"
    pct move-volume ${scratch_id} rootfs \${ROOTFS_STORAGE} ${vmid} \${UNUSED_KEY} >&2
    NEW_VOL=\$(pct config ${vmid} | grep \"^\${UNUSED_KEY}:\" | awk '{print \$2}' | cut -d, -f1)

    pct destroy ${scratch_id}

    # Promote the moved-in volume from its temporary unused slot to rootfs:
    # and drop the unused: entry in the same edit.
    sed -i \"0,/^rootfs:/s|^rootfs:.*|rootfs: \${NEW_VOL},size=\${ROOTFS_SIZE}G|; /^\${UNUSED_KEY}:/d\" /etc/pve/lxc/${vmid}.conf

    echo \"OLD_VOL=\${OLD_VOL}\"
    echo \"NEW_VOL=\${NEW_VOL}\"
  ")

  old_vol=$(echo "${swap_result}" | grep '^OLD_VOL=' | cut -d= -f2)
  new_vol=$(echo "${swap_result}" | grep '^NEW_VOL=' | cut -d= -f2)
  [[ -n ${old_vol} && -n ${new_vol} ]] || {
    _fail "Could not determine rootfs volumes during swap."
    return 1
  }
  _ok "rootfs swapped: ${old_vol} → ${new_vol}"

  _lxc_ssh "${pve_host}" "pct start ${vmid}"

  local elapsed
  elapsed=$(($(date +%s) - t0))
  _ok "CT ${vmid} started in ${elapsed}s — services warming up"

  # ==================================================================
  # Step 6 — Health check
  # ==================================================================
  _lxc_step "Health check" "(30s warm-up)"
  sleep 30

  local svc_list=""
  local s
  for s in "${_LXC_SERVICES[@]}"; do
    svc_list+="printf \"%-24s %s\\\\n\" \"${s}\" \"\$(systemctl is-active ${s})\"; "
  done

  _lxc_ssh "${pve_host}" "pct exec ${vmid} -- /run/current-system/sw/bin/bash -lc '
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
  # Step 7 — Commit or rollback
  # ==================================================================
  local confirm
  if [[ -n ${LXC_YES} ]]; then
    confirm="y"
  else
    local inp
    _lxc_prompt "  ${BOLD}?${NC} CT ${vmid} is working correctly? ${DIM}[y/N]${NC} " inp || inp=""
    confirm="${inp}"
  fi

  if [[ ${confirm} =~ ^[Yy]$ ]]; then
    _lxc_step "Commit"

    _lxc_ssh "${pve_host}" "pct delsnapshot ${vmid} ${snapshot}"
    if ! _lxc_ssh "${pve_host}" "pvesm free ${old_vol}" 2>/dev/null; then
      _warn "Could not free old volume ${old_vol} — free it manually:"
      echo -e "  ${DIM}  ssh root@${pve_host} \"pvesm free ${old_vol}\"${NC}" >&2
    fi
    local total
    total=$(($(date +%s) - _LXC_UPGRADE_T0))
    echo "" >&2
    echo -e "${GREEN}${BOLD}  ✓ Upgrade complete${NC} — CT ${vmid} (${hostname}) is on ${LXC_UPG_VERSION} (${total}s)." >&2
    echo "" >&2
    trap - EXIT
  else
    _lxc_step "Rollback"
    _warn "Rolling back CT ${vmid} to snapshot ${snapshot}..."

    _lxc_ssh "${pve_host}" "
      set -e
      pct stop ${vmid}
      pct rollback ${vmid} ${snapshot}
      pct start ${vmid}
    "
    if ! _lxc_ssh "${pve_host}" "pvesm free ${new_vol}" 2>/dev/null; then
      _warn "Could not free new volume ${new_vol} — free it manually:"
      echo -e "  ${DIM}  ssh root@${pve_host} \"pvesm free ${new_vol}\"${NC}" >&2
    fi
    _ok "Rolled back CT ${vmid} to pre-upgrade state."
    trap - EXIT
    return 1
  fi
}
