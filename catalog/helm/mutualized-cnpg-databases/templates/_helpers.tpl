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
{{- define "mutualized-cnpg-databases.userSecretName" -}}
{{- printf "cnpg.%s-%s-%s-credentials" .prefix .db.name .user.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "mutualized-cnpg-databases.userGeneratorName" -}}
{{- printf "cnpg.%s-%s-%s-credentials-gen" .prefix .db.name .user.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "mutualized-cnpg-databases.userPushSecretName" -}}
{{- printf "cnpg.%s-%s-%s-credentials-push" .prefix .db.name .user.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "mutualized-cnpg-databases.userPushSecretNameReadonly" -}}
{{- printf "cnpg.%s-%s-%s-credentials-readonly-push" .prefix .db.name .user.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Vault Key Resolution: RW and RO paths */}}
{{- define "mutualized-cnpg-databases.userVaultKey" -}}
{{- if and .user.vault .user.vault.path -}}
  {{- .user.vault.path -}}
{{- else -}}
  {{- fail (printf "[mutualized-cnpg-databases] Missing vault path for %s/%s" .db.name .user.name) -}}
{{- end -}}
{{- end -}}

{{- define "mutualized-cnpg-databases.userVaultKeyReadonly" -}}
{{- if and .user.vault .user.vault.pathReadonly -}}
  {{- .user.vault.pathReadonly -}}
{{- else -}}
  {{- printf "%s-readonly" (include "mutualized-cnpg-databases.userVaultKey" .) -}}
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
{{- $np := .Values.spec.behavior.networkPolicies.fromOperator -}}
{{- if and $np $np.operator -}}{{ $np.operator.namespace | default "cloudnative-pg-system" }}{{- else -}}cloudnative-pg-system{{- end -}}
{{- end -}}

{{- define "mutualized-cnpg-databases.operatorName" -}}
{{- $np := .Values.spec.behavior.networkPolicies.fromOperator -}}
{{- if and $np $np.operator -}}{{ $np.operator.name | default "cloudnative-pg" }}{{- else -}}cloudnative-pg{{- end -}}
{{- end -}}

{{/* 
Metadata Block Generator:
Merges recommended labels, global labels/annotations from .Values.metadata, 
and resource-specific labels/annotations passed by the template.
*/}}
{{- define "mutualized-cnpg-databases.resourceMetadata" -}}
{{- $instance := .instance | default (include "mutualized-cnpg-databases.resourcePrefix" .root) -}}
{{- $labels := dict
    "app.kubernetes.io/name"       .root.Chart.Name
    "app.kubernetes.io/instance"   $instance
    "app.kubernetes.io/managed-by" "Helm"
    "helm.sh/chart"                (printf "%s-%s" .root.Chart.Name .root.Chart.Version)
-}}
{{- with .root.Values.metadata.labels -}}{{ $labels = merge $labels . }}{{- end -}}
{{- with .extraLabels -}}{{ $labels = merge $labels . }}{{- end -}}
labels:
  {{- toYaml $labels | nindent 2 }}
{{- $annotations := dict -}}
{{- with .root.Values.metadata.annotations -}}{{ $annotations = merge $annotations . }}{{- end -}}
{{- with .extraAnnotations -}}{{ $annotations = merge $annotations . }}{{- end -}}
{{- if $annotations }}
annotations:
  {{- toYaml $annotations | nindent 2 }}
{{- end -}}
{{- end -}}
