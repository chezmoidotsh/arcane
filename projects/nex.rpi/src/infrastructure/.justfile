# -- Variables -----------------------------------------------------------------
kubernetes_configuration := canonicalize(source_directory() / ".." / ".." / ".." / "..") / ".direnv/kubernetes/config"
kubernetes_context := kubernetes_host
kubernetes_host := "kubernetes.nr.chezmoi.sh"
kubernetes_applyset := replace_regex(blake3("crossplane/nr.chezmoi.sh"), "[a-f0-9]{32}$", "")

kubectl := "kubectl --kubeconfig " + quote(kubernetes_configuration) + " --context " + quote(kubernetes_context)

[private]
@default:
  just --list --list-submodules


# -- Infrastructure (crossplane) related tasks ---------------------------------
[doc("Applies the infrastructure changes")]
apply *kubectl_opts="": diff && (force-apply kubectl_opts)
  @read -p "Do you want to apply the changes? [y/N] " -n 1 -r; [[ $REPLY =~ ^[Yy]$ ]] && printf "\nApplying the changes...\n\n"

[doc("Applies the infrastructure changes without asking for confirmation")]
force-apply *kubectl_opts="":
  KUBECTL_APPLYSET=true \
    {{ kubectl }} apply --kustomize 'live/production' \
    --prune --server-side --applyset="clusterapplysets.kubernetes.chezmoi.sh/{{ kubernetes_applyset }}" --force-conflicts \
    {{ kubectl_opts }}

[doc("Shows the diff of the infrastructure changes")]
diff:
  KUBECTL_APPLYSET=true \
    {{ kubectl }} diff --kustomize 'live/production' --server-side --force-conflicts \
  || true


# -- Kubernetes helper tasks ---------------------------------------------------
[private]
[doc("Generates the ClusterApplySet required follow which resources should be pruned")]
generate-applyset:
  #!/bin/env bash
  set -euo pipefail

  {{ kubectl }} create --filename - <<EOF
  apiVersion: kubernetes.chezmoi.sh/v1alpha1
  kind: ClusterApplySet
  metadata:
    annotations:
      applyset.kubernetes.io/tooling: kubectl/v1.31
      applyset.kubernetes.io/contains-group-kinds: ''
    labels:
      applyset.kubernetes.io/name: "{{ kubernetes_applyset }}"
      applyset.kubernetes.io/id: applyset-$(
        echo -n "{{ kubernetes_applyset }}..ClusterApplySet.kubernetes.chezmoi.sh" \
        | openssl dgst -sha256 -binary \
        | openssl base64 -A \
        | tr -d '=' | tr '/+' '_-'
      )-v1
    name: "{{ kubernetes_applyset }}"
  EOF
