{{/*
_helpers.tpl — Utility functions for the mutualized-cnpg-databases chart.
*/}}

{{/*
CNPG Cluster Name: <metadata.name>-<spec.cluster.name> or <metadata.name>.
This is the only resource name that changes when spec.cluster.name is provided,
allowing for parallel cluster deployments (e.g., during major upgrades).
*/}}
{{- define "mutualized-cnpg-databases.clusterName" -}}
{{- $prefix := required "[mutualized-cnpg-databases] .Values.metadata.name is required." .Values.metadata.name -}}
{{- if and .Values.spec.cluster ((.Values.spec.cluster).name) -}}
{{- printf "%s-%s" $prefix .Values.spec.cluster.name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $prefix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/*
Stable resource prefix used for all supporting resources (Secrets, DBs, Policies).
Driven exclusively by .Values.metadata.name to ensure stable references.
*/}}
{{- define "mutualized-cnpg-databases.resourcePrefix" -}}
{{- required "[mutualized-cnpg-databases] .Values.metadata.name is required." .Values.metadata.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* ESO Resource Naming (Secrets, Generators, PushSecrets) */}}
{{- define "mutualized-cnpg-databases.userCredentialsName" -}}
{{- printf "cnpg.%s-%s-%s-credentials" .prefix .db.name .user.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Vault Key Resolution: RW and RO paths */}}
{{- define "mutualized-cnpg-databases.userVaultKey" -}}
{{- if and .user.vault .user.vault.path -}}
  {{- .user.vault.path -}}
{{- else -}}
  {{- fail (printf "[mutualized-cnpg-databases] Missing vault path for %s/%s" .db.name .user.name) -}}
{{- end -}}
{{- end -}}

{{/* SecretStore resolution: checks for per-user overrides before using global default. */}}
{{- define "mutualized-cnpg-databases.userSecretStoreKind" -}}
{{- if and .user.vault .user.vault.secretStoreRef .user.vault.secretStoreRef.kind -}}
  {{- .user.vault.secretStoreRef.kind -}}
{{- else -}}
  {{- .root.Values.spec.secretStoreRef.kind | default "ClusterSecretStore" -}}
{{- end -}}
{{- end -}}

{{- define "mutualized-cnpg-databases.userSecretStoreName" -}}
{{- if and .user.vault .user.vault.secretStoreRef .user.vault.secretStoreRef.name -}}
  {{- .user.vault.secretStoreRef.name -}}
{{- else -}}
  {{- required "[mutualized-cnpg-databases] .Values.spec.secretStoreRef.name is required." .root.Values.spec.secretStoreRef.name -}}
{{- end -}}
{{- end -}}

{{/* Network Policy Operator Resolution */}}
{{- define "mutualized-cnpg-databases.operatorNamespace" -}}
{{- .Values.spec.behavior.networkPolicies.fromOperator | dig "operator" "namespace" "cnpg-system" -}}
{{- end -}}

{{- define "mutualized-cnpg-databases.operatorName" -}}
{{- .Values.spec.behavior.networkPolicies.fromOperator | dig "operator" "name" "cloudnative-pg" -}}
{{- end -}}

{{/*
Default Labels helper:
Builds the canonical set of labels used across resources.
This helper outputs YAML mapping (without a top-level `labels:` key).
Call with a context containing:
- .root     : chart root context
- .instance : optional instance override
*/}}
{{- define "mutualized-cnpg-databases.defaultLabels" -}}
{{- $root := .root -}}
{{- $instance := .instance | default (include "mutualized-cnpg-databases.resourcePrefix" $root) -}}
{{- $labels := dict
    "app.kubernetes.io/name"                $root.Chart.Name
    "app.kubernetes.io/instance"            $instance
    "app.kubernetes.io/managed-by"          "Helm"
    "mutualized.cloudnative-pg.io/group"    (include "mutualized-cnpg-databases.resourcePrefix" $root)
    "mutualized.cloudnative-pg.io/cluster"  (include "mutualized-cnpg-databases.clusterName" $root)
    "helm.sh/chart"                         (printf "%s-%s" $root.Chart.Name $root.Chart.Version)
-}}
{{- with $root.Values.metadata.labels }}
{{- toYaml . | trimSuffix "\n" -}}
{{- end -}}
{{- dict
    "app.kubernetes.io/name"                $root.Chart.Name
    "app.kubernetes.io/instance"            $instance
    "app.kubernetes.io/managed-by"          "Helm"
    "mutualized.cloudnative-pg.io/group"    (include "mutualized-cnpg-databases.resourcePrefix" $root)
    "mutualized.cloudnative-pg.io/cluster"  (include "mutualized-cnpg-databases.clusterName" $root)
    "helm.sh/chart"                         (printf "%s-%s" $root.Chart.Name $root.Chart.Version)
    | toYaml | trimSuffix "\n" -}}
{{- end -}}

{{/*
Default Annotations helper:
Outputs base annotations as YAML mapping (currently empty, kept for symmetry).
Call with a context containing:
- .root : chart root context
*/}}
{{- define "mutualized-cnpg-databases.defaultAnnotations" -}}
{{- with .root.Values.metadata.annotations }}
{{- toYaml . | trimSuffix "\n" -}}
{{- end -}}
{{- end -}}
