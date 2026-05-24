#!/usr/bin/env bash
# discover-cnpg.sh — Discover CNPG candidates declared in the Arcane repo.
#
# Outputs a JSON array on stdout. Each entry describes one CNPG cluster the
# skill could target, with enough metadata to filter by project, app,
# namespace, or logical database name.
#
# Sources scanned:
#   1. Direct `postgresql.cnpg.io/v1` `Cluster` manifests under projects/
#   2. Mutualized clusters rendered from the `mutualized-cnpg-databases`
#      Helm chart, declared via Kustomize helmCharts entries.
#
# Output schema (one element per cluster):
#   {
#     "cluster_name":       string,   // live CNPG cluster name
#     "project":            string,   // first path segment under projects/
#     "namespace":          string,   // resolved namespace (may be inferred)
#     "namespace_source":   string,   // "kustomization" | "helmCharts" | "inferred"
#     "app_dir":            string,   // directory holding the manifest
#     "source":             string,   // "direct" | "mutualized"
#     "plugin_enabled":     bool,     // barman-cloud plugin declared & enabled
#     "logical_databases":  [string], // empty for direct clusters
#     "manifest_path":      string,   // file the data was read from
#     "context_hint":       string    // suggested kubectl context, NOT validated
#   }
#
# Usage:
#   discover-cnpg.sh                # all candidates
#   discover-cnpg.sh <project>      # filter by project (e.g. lungmen.akn)
#
# Requires: rg, yq (v4+), jq. Run from the repository root.

set -euo pipefail

# Resolve repository root (the script lives at .agents/skills/cnpg-backup/scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${REPO_ROOT}"

FILTER_PROJECT="${1-}"

# --- Helpers ---------------------------------------------------------------

# Read a yq expression from a file, return empty string on miss/null.
yq_or_empty() {
  local expr="$1" file="$2"
  local out
  out="$(yq "${expr}" "${file}" 2>/dev/null || true)"
  [[ ${out} == "null" ]] && out=""
  printf '%s' "${out}"
}

# Project name is the first path component after projects/.
project_of() {
  local path="$1"
  printf '%s' "${path#projects/}" | cut -d/ -f1
}

# --- 1) Direct CNPG Cluster manifests --------------------------------------
#
# A manifest may contain multiple YAML documents; we explicitly select
# `kind == "Cluster"` to ignore ScheduledBackup, ObjectStore, etc.

emit_direct() {
  local file project name namespace app_dir plugin_enabled kust_ns
  while IFS= read -r file; do
    project="$(project_of "${file}")"
    [[ -n ${FILTER_PROJECT} && ${project} != "${FILTER_PROJECT}" ]] && continue

    # A file may declare several Cluster documents; iterate by name.
    while IFS= read -r name; do
      [[ -z ${name} ]] && continue
      app_dir="$(basename "$(dirname "${file}")")"

      # Namespace from sibling kustomization.yaml when available
      kust_ns="$(yq_or_empty '.namespace // ""' "$(dirname "${file}")/kustomization.yaml")"
      if [[ -n ${kust_ns} ]]; then
        namespace="${kust_ns}"
        ns_source="kustomization"
      else
        namespace="${app_dir}"
        ns_source="inferred"
      fi

      # Plugin enablement on the specific Cluster doc
      plugin_enabled="$(yq -r \
        "select(.kind == \"Cluster\" and .metadata.name == \"${name}\") |
           [.spec.plugins[]? | select(.name == \"barman-cloud.cloudnative-pg.io\" and .enabled == true)] |
           length > 0" \
        "${file}" 2>/dev/null | head -1)"
      [[ ${plugin_enabled} != "true" ]] && plugin_enabled="false"

      jq -nc \
        --arg cluster_name "${name}" \
        --arg project "${project}" \
        --arg namespace "${namespace}" \
        --arg ns_source "${ns_source}" \
        --arg app_dir "${app_dir}" \
        --arg manifest "${file}" \
        --argjson plugin "${plugin_enabled}" \
        '{
          cluster_name: $cluster_name,
          project: $project,
          namespace: $namespace,
          namespace_source: $ns_source,
          app_dir: $app_dir,
          source: "direct",
          plugin_enabled: $plugin,
          logical_databases: [],
          manifest_path: $manifest,
          context_hint: ("admin@" + $project)
        }'
    done < <(yq -r 'select(.kind == "Cluster") | .metadata.name' "${file}" 2>/dev/null || true)
  done < <({ rg -l --no-messages 'apiVersion:\s*postgresql\.cnpg\.io/v1' projects -g '*.yaml' -g '*.yml' || true; } |
    sort -u || true)
}

# --- 2) Mutualized Helm-rendered clusters ----------------------------------
#
# Each helmCharts[] entry referencing mutualized-cnpg-databases points to a
# values file that defines the cluster prefix (.metadata.name) and the
# generation suffix (.spec.cluster.name). The rendered cluster name is
# <prefix>-<suffix> when suffix is set, else just <prefix> — mirroring the
# chart's _helpers.tpl logic.

emit_mutualized() {
  local kust project app_dir
  while IFS= read -r kust; do
    project="$(project_of "${kust}")"
    [[ -n ${FILTER_PROJECT} && ${project} != "${FILTER_PROJECT}" ]] && continue
    app_dir="$(basename "$(dirname "${kust}")")"

    # Iterate each matching helmCharts entry by index
    local count idx
    count="$(yq -r '[.helmCharts[]? | select(.name == "mutualized-cnpg-databases")] | length' "${kust}" 2>/dev/null || echo 0)"
    [[ -z ${count} || ${count} == "null" ]] && count=0

    for ((idx = 0; idx < count; idx++)); do
      local entry_expr="[.helmCharts[]? | select(.name == \"mutualized-cnpg-databases\")][${idx}]"
      local ns values_file values_path prefix suffix cluster_name plugin_enabled

      ns="$(yq_or_empty "${entry_expr}.namespace" "${kust}")"
      [[ -z ${ns} ]] && ns="$(yq_or_empty '.namespace' "${kust}")"
      values_file="$(yq_or_empty "${entry_expr}.valuesFile" "${kust}")"
      [[ -z ${values_file} ]] && continue
      values_path="$(dirname "${kust}")/${values_file}"
      [[ -f ${values_path} ]] || continue

      prefix="$(yq_or_empty '.metadata.name' "${values_path}")"
      suffix="$(yq_or_empty '.spec.cluster.name // ""' "${values_path}")"
      if [[ -n ${suffix} ]]; then
        cluster_name="${prefix}-${suffix}"
      else
        cluster_name="${prefix}"
      fi
      [[ -z ${cluster_name} ]] && continue

      plugin_enabled="$(yq -r \
        '[.spec.cluster.plugins[]? | select(.name == "barman-cloud.cloudnative-pg.io" and .enabled == true)] | length > 0' \
        "${values_path}" 2>/dev/null)"
      [[ ${plugin_enabled} != "true" ]] && plugin_enabled="false"

      # Logical databases as a JSON array
      local dbs_json
      dbs_json="$(yq -o=json '[.spec.databases[]?.name]' "${values_path}" 2>/dev/null || echo '[]')"
      [[ -z ${dbs_json} ]] && dbs_json='[]'

      jq -nc \
        --arg cluster_name "${cluster_name}" \
        --arg project "${project}" \
        --arg namespace "${ns}" \
        --arg app_dir "${app_dir}" \
        --arg manifest "${values_path}" \
        --argjson plugin "${plugin_enabled}" \
        --argjson dbs "${dbs_json}" \
        '{
          cluster_name: $cluster_name,
          project: $project,
          namespace: $namespace,
          namespace_source: "helmCharts",
          app_dir: $app_dir,
          source: "mutualized",
          plugin_enabled: $plugin,
          logical_databases: $dbs,
          manifest_path: $manifest,
          context_hint: ("admin@" + $project)
        }'
    done
  done < <({ rg -l --no-messages 'mutualized-cnpg-databases' projects -g 'kustomization.yaml' || true; } | sort -u || true)
}

# --- Assemble --------------------------------------------------------------

{
  emit_direct
  emit_mutualized
} | jq -s 'sort_by(.project, .cluster_name)'
