#!/usr/bin/env bash
# Migrate one Pulumi stack from the local @pulumi/pocket-id SDK (pocket-id-api:*)
# to @axnic/pulumi-pocket-id (pocket-id:index:*), without touching Pocket-Id itself.
#
#   1. pulumi preview --json   -> what the new code wants to create
#   2. pulumi stack export     -> old resources + their real Pocket-Id IDs
#   3. show + run `pulumi state delete`  (state only, nothing is destroyed)
#   4. show + run `pulumi import`        (re-adopt clients/groups under the new type)
#
# The original state backup and the plan (urns to delete, resources to import)
# are saved once, before anything is deleted, in
# ~/.cache/pocket-id-migration/<project>/. Re-running the script resumes from
# that plan and only does what is still missing from the current state; it
# never overwrites the backup. Delete that directory to start over.
#
# Usage: _migrate.sh <project> [-y]     e.g. _migrate.sh rhodes.akn
# Needs: POCKET_ID_API_KEY, an already selected Pulumi stack, jq.
set -euo pipefail

project="${1:?usage: $0 <project> [-y]}"
assume_yes="${2:-}"
: "${POCKET_ID_API_KEY:?POCKET_ID_API_KEY must be set}"
command -v jq >/dev/null || {
	echo "jq is required" >&2
	exit 1
}

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}/projects/${project}/src/infrastructure/pulumi"
stack="$(pulumi stack --show-name)"
work="${HOME}/.cache/pocket-id-migration/${project}"
tmp="$(mktemp -d)"
mkdir -p "${work}"
echo "### ${project} / stack ${stack}"

confirm() {
	[[ ${assume_yes} == "-y" ]] && return 0
	read -r -p "$1 [y/N] " answer
	[[ ${answer} == "y" ]] || {
		echo "aborted"
		exit 1
	}
}

# --- 1+2. first run only: preview, extract, persist the plan -----------------
if [[ ! -f "${work}/import.txt" ]]; then
	echo
	echo "## 1. pulumi preview --json"
	# Non-zero is expected: the old provider plugin can no longer be downloaded.
	pulumi preview --json --non-interactive >"${tmp}/preview.json" 2>"${tmp}/preview.err" ||
		echo "(preview exited non-zero -- expected while the old state is still there)"
	jq -r '.steps[]? | select(.op == "create")
		| select(.newState.type | startswith("pocket-id:index:"))
		| "\(.newState.type) \(.newState.urn | split("::") | last)"' \
		"${tmp}/preview.json" >"${tmp}/creates.raw" 2>/dev/null || true
	sort "${tmp}/creates.raw" >"${tmp}/creates.txt"
	echo "new pocket-id resources the program wants to create:"
	sed 's/^/  /' "${tmp}/creates.txt"

	echo
	echo "## 2. extracting old resources from the state"
	pulumi stack export >"${tmp}/state.json"
	state="${tmp}/state.json"

	jq -r '.deployment.resources[] | select(.type == "pocket-id-api:oidc:OidcClients")
		| "pocket-id:index:OidcClient \(.urn | split("::") | last) \(.id)"' "${state}" >"${tmp}/import.txt"
	jq -r '.deployment.resources[] | select(.type == "pocket-id-api:usergroups:UserGroups")
		| "pocket-id:index:UserGroup \(.urn | split("::") | last) \(.id)"' "${state}" >>"${tmp}/import.txt"

	# dynamic AllowedUserGroups / OidcClientSecret of the old lib (outputs have groupIds / secret)
	jq -r '.deployment.resources[] | select(.type == "pulumi-nodejs:dynamic:Resource")
		| select(.outputs | has("groupIds") or has("secret")) | .urn' "${state}" >"${tmp}/dyn.txt"
	jq -Rs 'split("\n") | map(select(length > 0))' "${tmp}/dyn.txt" >"${tmp}/dyn.json"
	# children parented to those dynamic resources (e.g. the Vault SecretV2): their
	# URN changes with the new parent type, so they must be re-created in state too.
	jq -r --slurpfile dyn "${tmp}/dyn.json" '.deployment.resources[]
		| select(.parent as $p | $dyn[0] | index($p)) | .urn' "${state}" >"${tmp}/children.txt"
	jq -r '.deployment.resources[] | select(.type | startswith("pocket-id-api:"))
		| .urn' "${state}" >"${tmp}/api.txt"
	jq -r '.deployment.resources[] | select(.type == "pulumi:providers:pocket-id-api")
		| .urn' "${state}" >"${tmp}/provider.txt"

	# order matters: children, dynamic resources, clients/groups, provider last
	cat "${tmp}/children.txt" "${tmp}/dyn.txt" "${tmp}/api.txt" "${tmp}/provider.txt" >"${tmp}/del.txt"

	while read -r type name _; do
		grep -qx "${type} ${name}" "${tmp}/creates.txt" ||
			echo "warning: ${type} ${name} not in the preview's creates" >&2
	done <"${tmp}/import.txt"

	# persist backup + plan before deleting anything
	cp "${state}" "${work}/state.backup.json"
	cp "${tmp}/del.txt" "${work}/del.txt"
	cp "${tmp}/import.txt" "${work}/import.txt"
	echo "  backup + plan saved in ${work}"
else
	echo
	echo "## resuming from the saved plan in ${work}"
fi

# --- what is still left to do, given the current state -----------------------
pulumi stack export >"${tmp}/current.json"
current="${tmp}/current.json"
jq -r '.deployment.resources[].urn' "${current}" >"${tmp}/present.txt"

del=()
: >"${tmp}/todelete.txt"
while read -r urn; do
	[[ -n ${urn} ]] || continue
	if grep -qxF -- "${urn}" "${tmp}/present.txt"; then
		del+=("pulumi state delete '${urn}' --force --yes")
		echo "${urn}" >>"${tmp}/todelete.txt"
	fi
done <"${work}/del.txt"

# Resources already imported under the new type with the CLI (previous versions of
# this script) sit behind a stale default provider: drop them and that provider too,
# they are re-imported from the code below.
: >"${tmp}/stale.txt"
while read -r type name _; do
	[[ -n ${name:-} ]] || continue
	jq -r --arg t "${type}" --arg n "${name}" '.deployment.resources[]
		| select(.type == $t and (.urn | endswith("::" + $n))) | .urn' "${current}" >>"${tmp}/stale.txt"
done <"${work}/import.txt"
if [[ -s "${tmp}/stale.txt" ]]; then
	jq -r '.deployment.resources[] | select(.type | startswith("pulumi:providers:pocket-id"))
		| select(.type | startswith("pulumi:providers:pocket-id-api") | not) | .urn' "${current}" >>"${tmp}/stale.txt"
	while read -r urn; do
		if [[ -n ${urn} ]]; then
			del+=("pulumi state delete '${urn}' --force --yes")
			echo "${urn}" >>"${tmp}/todelete.txt"
		fi
	done <"${tmp}/stale.txt"
fi

# --- 3. state delete ---------------------------------------------------------
# `pulumi state delete` refuses a resource other resources depend on (e.g. the Vault
# auth backend and roles built from the Vault OIDC client) and --target-dependents
# would drop those from the state too. Only the dependency *references* to the
# resources about to be deleted are removed from the others; the next `pulumi up`
# records the dependencies again from the program.
strip_dependencies() {
	jq -Rs 'split("\n") | map(select(length > 0))' "${tmp}/todelete.txt" >"${tmp}/todelete.json"
	pulumi stack export >"${tmp}/before-strip.json"
	jq --slurpfile del "${tmp}/todelete.json" '($del[0]) as $d
		| (.deployment.resources |= map(
			(if has("dependencies") then .dependencies |= map(select(. as $u | ($d | index($u)) | not)) else . end)
			| (if has("propertyDependencies") then .propertyDependencies |= with_entries(.value |= map(select(. as $u | ($d | index($u)) | not))) else . end)))' \
		"${tmp}/before-strip.json" >"${tmp}/after-strip.json"
	cp "${tmp}/before-strip.json" "${work}/state.before-strip.json"
	pulumi stack import --file "${tmp}/after-strip.json"
}
count_references() {
	jq -Rs 'split("\n") | map(select(length > 0))' "${tmp}/todelete.txt" >"${tmp}/todelete.json"
	jq --slurpfile del "${tmp}/todelete.json" '($del[0]) as $d
		| [.deployment.resources[]
			| ((.dependencies // []) + ((.propertyDependencies // {}) | [.[][]]))
			| map(select(. as $u | ($d | index($u)) != null)) | length] | add // 0' "${current}"
}

echo
echo "## 3. state delete (state only -- nothing is destroyed in Pocket-Id/Vault)"
if ((${#del[@]})); then
	refs="$(count_references)"
	printf '  %s\n' "${del[@]}"
	echo "  backups: ${work}/state.backup.json (original), ${work}/state.before-strip.json"
	echo "  first: strip ${refs} dependency reference(s) to these resources from the other resources"
	confirm "run the ${#del[@]} deletions?"
	if ((refs)); then
		echo "+ pulumi stack import (dependencies stripped)"
		strip_dependencies
	fi
	for c in "${del[@]}"; do
		echo "+ ${c}"
		eval "${c}"
	done
else
	echo "  nothing left to delete"
fi

# --- 4. declare the imports in the code --------------------------------------
# `pulumi import` would register the resources under a provider whose inputs differ
# from the program's (apiKey), which makes the engine replace them. Declaring
# `import: "<id>"` in the code imports them with the program's own provider.
# clientId stays after the migration: the provider replaces a client whose clientId
# changes, and the imported state records it.
echo
echo "## 4. import options written in the code (undone later by _finish.sh)"
patch_import() {
	NAME="$2" ID="$3" perl -0pi -e '
		my ($n, $id) = ($ENV{NAME}, $ENV{ID});
		if (index($_, "import: \"$id\"") < 0) {
			s{(new pocketid\.OidcClient\(\n\t"\Q$n\E",\n\t\{\n)(.*?\n\t\},\n)\);}{
				my ($h, $b) = ($1, $2);
				$h .= "\t\tclientId: \"$id\",\n" unless $b =~ /^\t\tclientId:/m;
				"$h$b\t{ import: \"$id\" },\n);"
			}se;
			s{(new pocketid\.UserGroup\("\Q$n\E", \{\n.*?\n\})\);}{$1, { import: "$id" });}s;
		}
	' "$1"
}
patched=0
: >"${tmp}/patched-files.txt"
grep -rlE 'new pocketid\.(OidcClient|UserGroup)\(' stack --include='*.ts' >"${tmp}/files.txt" || true
while read -r type name id; do
	[[ -n ${id:-} ]] || continue
	found=""
	while read -r file; do
		patch_import "${file}" "${name}" "${id}"
		if grep -qF "import: \"${id}\"" "${file}"; then
			found="${file}"
			break
		fi
	done <"${tmp}/files.txt"
	if [[ -z ${found} ]]; then
		echo "  warning: no code found for ${type} ${name}" >&2
		continue
	fi
	echo "  ${found}: ${name} -> import ${id}"
	echo "${found}" >>"${tmp}/patched-files.txt"
	patched=$((patched + 1))
done <"${work}/import.txt"
echo "  ${patched} import(s) declared, taken from the saved plan: that includes the resources already"
echo "  removed from the state by a previous run, which are re-imported by the next pulumi up"
if ((patched)); then
	sort -u "${tmp}/patched-files.txt" | xargs rtunk fmt --no-progress >/dev/null 2>&1 || true
fi

echo
echo "done. Now: pulumi preview   (expect '= import' lines, no replace), then pulumi up,"
echo "then scripts/migrations/pocket-id/_finish.sh ${project} to drop the import options."
