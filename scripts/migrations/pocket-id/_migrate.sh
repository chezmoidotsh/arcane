#!/usr/bin/env bash
# Migrate one Pulumi stack from the local @pulumi/pocket-id SDK (pocket-id-api:*)
# to @axnic/pulumi-pocket-id (pocket-id:index:*), without touching Pocket-Id itself.
#
#   1. pulumi preview --json   -> what the new code wants to create
#   2. pulumi stack export     -> old resources + their real Pocket-Id IDs
#   3. show + run `pulumi state delete`  (state only, nothing is destroyed)
#   4. show + run `pulumi import`        (re-adopt clients/groups under the new type)
#
# Usage: _migrate.sh <project> [-y]     e.g. _migrate.sh rhodes.akn
# Needs: POCKET_ID_API_KEY, an already selected Pulumi stack, jq.
set -euo pipefail

project=${1:?usage: $0 <project> [-y]}
yes=${2:-}
: "${POCKET_ID_API_KEY:?POCKET_ID_API_KEY must be set}"
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

cd "$(git rev-parse --show-toplevel)/projects/$project/src/infrastructure/pulumi"
tmp=$(mktemp -d)
echo "### $project / stack $(pulumi stack --show-name)"

confirm() {
	[[ $yes == -y ]] && return 0
	read -r -p "$1 [y/N] " a
	[[ $a == y ]] || { echo "aborted"; exit 1; }
}

# --- 1. preview --------------------------------------------------------------
echo; echo "## 1. pulumi preview --json"
# Non-zero is expected: the old provider plugin can no longer be downloaded.
pulumi preview --json --non-interactive >"$tmp/preview.json" 2>"$tmp/preview.err" \
	|| echo "(preview exited non-zero -- expected while the old state is still there)"
jq -r '.steps[]? | select(.op=="create")
	| select(.newState.type | startswith("pocket-id:index:"))
	| "\(.newState.type) \(.newState.urn | split("::") | last)"' \
	"$tmp/preview.json" 2>/dev/null | sort >"$tmp/creates.txt" || true
echo "new pocket-id resources the program wants to create:"
sed 's/^/  /' "$tmp/creates.txt"

# --- 2. extract from the current state ---------------------------------------
echo; echo "## 2. extracting old resources from the state"
pulumi stack export >"$tmp/state.json"
S='.deployment.resources[]'
jq -r "$S | select(.type==\"pocket-id-api:oidc:OidcClients\") | \"pocket-id:index:OidcClient \(.urn|split(\"::\")|last) \(.id)\"" "$tmp/state.json" >"$tmp/import.txt"
jq -r "$S | select(.type==\"pocket-id-api:usergroups:UserGroups\") | \"pocket-id:index:UserGroup \(.urn|split(\"::\")|last) \(.id)\"" "$tmp/state.json" >>"$tmp/import.txt"

# dynamic AllowedUserGroups / OidcClientSecret from the old lib (outputs have groupIds / secret)
jq -r "$S | select(.type==\"pulumi-nodejs:dynamic:Resource\")
	| select(.outputs | has(\"groupIds\") or has(\"secret\")) | .urn" "$tmp/state.json" >"$tmp/dyn.txt"
# children parented to those dynamic secrets (e.g. the Vault SecretV2): their URN
# changes with the new parent type, so they must be re-created in state too.
jq -r --slurpfile d <(jq -R . "$tmp/dyn.txt") "$S | select(.parent as \$p | \$d | index(\$p)) | .urn" "$tmp/state.json" >"$tmp/children.txt"
jq -r "$S | select(.type | startswith(\"pocket-id-api:\")) | select(.type | startswith(\"pulumi:providers:\") | not) | .urn" "$tmp/state.json" >"$tmp/api.txt"
jq -r "$S | select(.type==\"pulumi:providers:pocket-id-api\") | .urn" "$tmp/state.json" >"$tmp/provider.txt"

# --- 3. state delete ---------------------------------------------------------
del=()
# order matters: children, then dynamic resources, then clients/groups, provider last
for f in children dyn api provider; do
	while IFS= read -r urn; do
		[[ -n $urn ]] && del+=("pulumi state delete '$urn' --force --yes")
	done <"$tmp/$f.txt"
done
imp=()
while read -r type name id; do
	[[ -n ${id:-} ]] && imp+=("pulumi import --yes --skip-preview --generate-code=false --protect=false $type $name $id")
	grep -qx "$type $name" "$tmp/creates.txt" || echo "warning: $type $name not in the preview's creates" >&2
done <"$tmp/import.txt"

echo; echo "## 3. state delete (state only -- nothing is destroyed in Pocket-Id/Vault)"
printf '  %s\n' "${del[@]:-}"
[[ ${#del[@]} -eq 0 ]] && echo "  nothing to delete (already migrated?)"
cp "$tmp/state.json" "$project.state.backup.json" && echo "  backup: $PWD/$project.state.backup.json"
confirm "run the ${#del[@]} deletions?"
for c in "${del[@]:-}"; do [[ -n $c ]] && { echo "+ $c"; eval "$c"; }; done

# --- 4. import ---------------------------------------------------------------
echo; echo "## 4. import"
printf '  %s\n' "${imp[@]:-}"
confirm "run the ${#imp[@]} imports?"
for c in "${imp[@]:-}"; do [[ -n $c ]] && { echo "+ $c"; eval "$c"; }; done

echo; echo "done. Now run: pulumi preview   (expect only secrets + logo updates)"
