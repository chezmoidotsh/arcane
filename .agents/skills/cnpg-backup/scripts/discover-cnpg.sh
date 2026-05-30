#!/usr/bin/env bash
# discover-cnpg.sh — Discover CNPG candidates from rendered dist/ manifests.
#
# Scans projects/*/dist/ for postgresql.cnpg.io/v1 Cluster objects (the
# rendered, canonical state applied by ArgoCD). Logical databases are derived
# from Database objects in the same dist/ directory, avoiding src/ duplication
# and helmvalues parsing.
#
# Output schema (one element per cluster, no duplicates):
#   {
#     "cluster_name":       string,   // live CNPG cluster name
#     "project":            string,   // first path segment under projects/
#     "namespace":          string,   // resolved namespace
#     "namespace_source":   string,   // "manifest" | "kustomization" | "inferred"
#     "app_dir":            string,   // directory name under dist/apps/
#     "source":             string,   // "direct" | "mutualized"
#     "plugin_enabled":     bool,     // barman-cloud plugin declared & enabled
#     "logical_databases":  [string], // from Database objects; empty for direct
#     "manifest_path":      string,   // dist/ Cluster manifest file
#     "context_hint":       string    // suggested kubectl context, NOT validated
#   }
#
# Usage:
#   discover-cnpg.sh                # all candidates
#   discover-cnpg.sh <project>      # filter by project (e.g. lungmen.akn)
#
# Requires: rg, yq (v4+), jq. Run from the repository root.
# Note: yq is installed via mise in this repo — invoke via `mise exec --` if
#       yq is not on the system PATH.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${REPO_ROOT}"

FILTER_PROJECT="${1-}"

# --- Helpers ---------------------------------------------------------------

yq_or_empty() {
  local expr="$1" file="$2"
  local out
  out="$(yq "${expr}" "${file}" 2>/dev/null || true)"
  [[ ${out} == "null" ]] && out=""
  printf '%s' "${out}"
}

project_of() {
  local path="$1"
  printf '%s' "${path#projects/}" | cut -d/ -f1
}

# --- Emit one JSON entry per Cluster found in dist/ ------------------------
#
# Namespace resolution order:
#   1. .metadata.namespace in the Cluster manifest (set by kustomize commonLabels)
#   2. .namespace in the corresponding src/apps/<app_dir>/kustomization.yaml
#   3. app_dir as last resort
#
# Logical databases are read from Database objects (postgresql.cnpg.io/v1) in
# the same dist/ directory whose spec.cluster.name matches this cluster.
# Clusters with at least one Database are classified as "mutualized".

emit_clusters() {
  local file project app_dir dist_dir name ns ns_source src_kust
  local plugin_enabled dbs_json db_count source_type db_file db_name

  while IFS= read -r file; do
    project="$(project_of "${file}")"
    [[ -n ${FILTER_PROJECT} && ${project} != "${FILTER_PROJECT}" ]] && continue

    dist_dir="$(dirname "${file}")"
    app_dir="$(basename "${dist_dir}")"

    while IFS= read -r name; do
      [[ -z ${name} ]] && continue

      # --- Namespace ---
      ns="$(yq_or_empty \
        "select(.kind == \"Cluster\" and .metadata.name == \"${name}\") | .metadata.namespace // \"\"" \
        "${file}")"
      ns_source="manifest"

      if [[ -z ${ns} ]]; then
        src_kust="projects/${project}/src/apps/${app_dir}/kustomization.yaml"
        if [[ -f ${src_kust} ]]; then
          ns="$(yq_or_empty '.namespace // ""' "${src_kust}")"
          [[ -n ${ns} ]] && ns_source="kustomization"
        fi
      fi

      if [[ -z ${ns} ]]; then
        ns="${app_dir}"
        ns_source="inferred"
      fi

      # --- Plugin ---
      plugin_enabled="$(yq -r \
        "select(.kind == \"Cluster\" and .metadata.name == \"${name}\") |
           [.spec.plugins[]? |
             select(.name == \"barman-cloud.cloudnative-pg.io\" and .enabled == true)] |
           length > 0" \
        "${file}" 2>/dev/null | head -1)"
      [[ ${plugin_enabled} != "true" ]] && plugin_enabled="false"

      # --- Logical databases from Database objects in same dist/ dir ---
      dbs_json='[]'
      while IFS= read -r db_file; do
        while IFS= read -r db_name; do
          [[ -z ${db_name} ]] && continue
          dbs_json="$(printf '%s' "${dbs_json}" | jq --arg n "${db_name}" '. + [$n]')"
        done < <(yq -r \
          "select(.kind == \"Database\" and .spec.cluster.name == \"${name}\") | .spec.name" \
          "${db_file}" 2>/dev/null || true)
      done < <(rg -l --no-messages 'kind:\s*Database' "${dist_dir}" -g '*.yaml' 2>/dev/null | sort || true)

      db_count="$(printf '%s' "${dbs_json}" | jq 'length')"
      source_type="direct"
      [[ ${db_count} -gt 0 ]] && source_type="mutualized"

      jq -nc \
        --arg cluster_name "${name}" \
        --arg project "${project}" \
        --arg namespace "${ns}" \
        --arg ns_source "${ns_source}" \
        --arg app_dir "${app_dir}" \
        --arg manifest "${file}" \
        --argjson plugin "${plugin_enabled}" \
        --argjson dbs "${dbs_json}" \
        --arg source_type "${source_type}" \
        '{
          cluster_name:      $cluster_name,
          project:           $project,
          namespace:         $namespace,
          namespace_source:  $ns_source,
          app_dir:           $app_dir,
          source:            $source_type,
          plugin_enabled:    $plugin,
          logical_databases: $dbs,
          manifest_path:     $manifest,
          context_hint:      ("admin@" + $project)
        }'

    done < <(yq -r 'select(.kind == "Cluster") | .metadata.name' "${file}" 2>/dev/null || true)
  done < <({
    # Collect dist/ directories under projects/ and search only inside them.
    dist_dirs=()
    while IFS= read -r d; do dist_dirs+=("${d}"); done \
      < <(find projects -maxdepth 2 -type d -name dist 2>/dev/null | sort)
    if [[ ${#dist_dirs[@]} -gt 0 ]]; then
      rg -l --no-messages 'apiVersion:\s*postgresql\.cnpg\.io/v1' \
        -g '*.yaml' -g '*.yml' \
        "${dist_dirs[@]}" 2>/dev/null || true
    fi
  } | sort -u)
}

# --- Assemble --------------------------------------------------------------

emit_clusters | jq -s 'sort_by(.project, .cluster_name)'
