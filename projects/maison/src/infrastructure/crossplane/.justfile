# -- Variables -----------------------------------------------------------------
crossplane_configuration := canonicalize(source_directory() / ".." / ".." / ".." / ".." / "..") / ".direnv/kubernetes/config"
crossplane_context := "kubernetes.nx.chezmoi.sh"
crossplane_applyset := replace_regex(blake3("crossplane/maison.chezmoi.sh"), "[a-f0-9]{32}$", "")

[private]
@default:
  just --list --list-submodules


# -- Infrastructure (crossplane) related tasks ---------------------------------
[doc("Applies the infrastructure changes")]
apply *kubectl_opts="": diff && (force-apply kubectl_opts)
  @read -p "Do you want to apply the changes? [y/N] " -n 1 -r; [[ $REPLY =~ ^[Yy]$ ]] && printf "\nApplying the changes...\n\n"

[doc("Applies the infrastructure changes without asking for confirmation")]
force-apply *kubectl_opts="":
  kubectl kustomize '.' \
  | KUBECTL_APPLYSET=true \
    kubectl --kubeconfig {{ quote(crossplane_configuration) }} --context {{ quote(crossplane_context) }} \
    apply --filename - \
    --prune --server-side --applyset="clusterapplysets.kubernetes.chezmoi.sh/{{ crossplane_applyset }}" --force-conflicts \
    {{ kubectl_opts }}

[doc("Shows the diff of the infrastructure changes")]
diff:
  kubectl kustomize '.' \
  | KUBECTL_APPLYSET=true \
    kubectl --kubeconfig {{ quote(crossplane_configuration) }} --context {{ quote(crossplane_context) }} \
    diff --filename - --server-side --force-conflicts \
  || true


# -- Kubernetes helper tasks ---------------------------------------------------
[private]
[doc("Generates the ClusterApplySet required follow which resources should be pruned")]
generate-applyset:
  #!/bin/env bash
  set -euo pipefail

  kubectl --kubeconfig {{ quote(crossplane_configuration) }} --context {{ quote(crossplane_context) }} \
    create --filename - <<EOF
  apiVersion: kubernetes.chezmoi.sh/v1alpha1
  kind: ClusterApplySet
  metadata:
    annotations:
      applyset.kubernetes.io/tooling: kubectl/v1.31
      applyset.kubernetes.io/contains-group-kinds: ''
    labels:
      applyset.kubernetes.io/name: "{{ crossplane_applyset }}"
      applyset.kubernetes.io/id: applyset-$(
        echo -n "{{ crossplane_applyset }}..ClusterApplySet.kubernetes.chezmoi.sh" \
        | openssl dgst -sha256 -binary \
        | openssl base64 -A \
        | tr -d '=' | tr '/+' '_-'
      )-v1
    name: "{{ crossplane_applyset }}"
  spec:
    project: crossplane.nx.chezmoi.sh
  EOF
