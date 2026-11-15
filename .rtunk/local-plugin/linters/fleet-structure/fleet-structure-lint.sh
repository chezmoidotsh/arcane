#!/usr/bin/env bash
# Copyright (C) 2026 Alexandre Nicolaie (xunleii@users.noreply.github.com)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ----------------------------------------------------------------------------
# Linter `fleet-structure` of rtunk (see plugin.yaml). Findings are `path:1: message` lines.
#
# Usage: fleet-structure-lint.sh [--self-test | <repo-root>]
#
# Rules:
#   1. A system component present on two or more distinct clusters must have a
#      catalog/kubernetes/<x>/ base. Both layouts are scanned during the
#      migration: projects/<cluster>/src/infrastructure/kubernetes/<x>/ and
#      fleet/clusters/<family>.<name>/kubernetes/src/system/<x>/. A cluster that
#      exists in both layouts is counted once (rhodes.akn == akn.rhodes).
#   2. Every folder under fleet/hosts and fleet/clusters is named
#      core.<name> or akn.<name>.
set -o nounset
set -o pipefail

if [[ ${1:-} == "--self-test" ]]; then
	self="${BASH_SOURCE[0]}"
	tmp="$(mktemp -d)"
	trap 'rm -rf "${tmp}"' EXIT
	mkdir -p "${tmp}/catalog/kubernetes/with-base"
	for c in a.akn b.akn; do
		mkdir -p "${tmp}/projects/${c}/src/infrastructure/kubernetes"/{no-base,with-base}
	done
	# c.akn exists in both layouts: counted once, so "only-here" is not shared.
	mkdir -p "${tmp}/projects/c.akn/src/infrastructure/kubernetes/only-here" \
		"${tmp}/fleet/clusters/akn.c/kubernetes/src/system/only-here"
	out="$("${self}" "${tmp}")" && {
		echo >&2 "self-test: expected a failure for no-base"
		exit 1
	}
	[[ ${out} == *"no-base: present on a.akn, b.akn but catalog/kubernetes/no-base/ is missing"* && ${out} == "projects/"* ]] || {
		echo >&2 "self-test: bad no-base report: ${out}"
		exit 1
	}
	[[ ${out} != *"with-base"* && ${out} != *"only-here"* ]] || {
		echo >&2 "self-test: false positive: ${out}"
		exit 1
	}
	rm -r "${tmp}/projects/a.akn/src/infrastructure/kubernetes/no-base"
	"${self}" "${tmp}" >/dev/null || {
		echo >&2 "self-test: expected a pass"
		exit 1
	}
	mkdir -p "${tmp}/fleet/hosts/BadName" "${tmp}/fleet/base"
	out="$("${self}" "${tmp}")" && {
		echo >&2 "self-test: expected a failure for BadName"
		exit 1
	}
	[[ ${out} == *"fleet/hosts/BadName"* && ${out} != *"fleet/base"* ]] || {
		echo >&2 "self-test: bad folder report: ${out}"
		exit 1
	}
	echo "self-test: ok"
	exit 0
fi

if [[ -n ${1:-} ]]; then
	REPO_ROOT="$1"
elif ! REPO_ROOT="$(git rev-parse --show-toplevel)"; then
	echo >&2 "Error: not inside a git checkout (git rev-parse --show-toplevel failed)."
	exit 1
fi
FAILURES=0

# One "<component> <cluster> <relative dir>" line per system component; cluster is the
# canonical <name>.<family>, so both layouts of a cluster collapse together.
pairs="$(mktemp)"
trap 'rm -f "${pairs}"' EXIT

for dir in "${REPO_ROOT}"/projects/*/src/infrastructure/kubernetes/*/; do
	[[ -d ${dir} ]] || continue
	component="$(basename "${dir}")"
	cluster="$(basename "${dir%/src/infrastructure/kubernetes/*}")"
	echo "${component} ${cluster} ${dir#"${REPO_ROOT}"/}" >>"${pairs}"
done

for dir in "${REPO_ROOT}"/fleet/clusters/*/kubernetes/src/system/*/; do
	[[ -d ${dir} ]] || continue
	component="$(basename "${dir}")"
	folder="$(basename "${dir%/kubernetes/src/system/*}")"
	cluster="${folder#*.}.${folder%%.*}" # <family>.<name> -> <name>.<family>
	echo "${component} ${cluster} ${dir#"${REPO_ROOT}"/}" >>"${pairs}"
done

sort -u -k1,2 -o "${pairs}" "${pairs}"
while IFS= read -r component; do
	clusters="$(awk -v c="${component}" '$1 == c { printf "%s%s", sep, $2; sep = ", " }' "${pairs}")"
	[[ ${clusters} == *", "* ]] || continue # a single cluster
	if [[ ! -d "${REPO_ROOT}/catalog/kubernetes/${component}" ]]; then
		where="$(awk -v c="${component}" '$1 == c { print $3; exit }' "${pairs}")"
		echo "${where%/}:1: ${component}: present on ${clusters} but catalog/kubernetes/${component}/ is missing"
		FAILURES=$((FAILURES + 1))
	fi
done < <(awk '{ print $1 }' "${pairs}" | uniq || true)

for dir in "${REPO_ROOT}"/fleet/hosts/*/ "${REPO_ROOT}"/fleet/clusters/*/; do
	[[ -d ${dir} ]] || continue
	name="$(basename "${dir}")"
	if [[ ! ${name} =~ ^(core|akn)\.[a-z0-9-]+$ ]]; then
		rel="${dir#"${REPO_ROOT}"/}"
		echo "${rel%/}:1: folder must be named core.<name> or akn.<name> (lower-case letters, digits, hyphens)"
		FAILURES=$((FAILURES + 1))
	fi
done

if ((FAILURES > 0)); then
	echo >&2 "${FAILURES} fleet structure violation(s) found."
	exit 1
fi

echo "Fleet structure is compliant: shared system components have a catalog base, fleet folders carry a family."
