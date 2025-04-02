# -- Variables -----------------------------------------------------------------
kubernetes_configuration := canonicalize(source_directory() / ".." / ".." / "..") / ".direnv/kubernetes/config"
kubernetes_context := kubernetes_host
kubernetes_host := "kubernetes.nx.chezmoi.sh"

[private]
@default:
    just --list --list-submodules


# -- Kubernetes related tasks --------------------------------------------------
[doc("Generates the kubeconfig")]
update-kubeconfig:
  #!/bin/env bash
  set -euo pipefail

  mkdir --parents "{{ parent_directory(kubernetes_configuration) }}"
  touch "{{ kubernetes_configuration }}"
  ssh "pi@{{ kubernetes_host }}" 'sudo cat /etc/rancher/k3s/k3s.yaml' \
    | sed 's|https://127.0.0.1:6443|https://{{ kubernetes_host }}:6443|' \
    | yq '.
          | .clusters[0].name = "{{ kubernetes_host }}"
          | .users[0].name = "nx.root"
          | .contexts = [{"name": "{{ kubernetes_host }}", "context": {"cluster": "{{ kubernetes_host }}", "user": "nx.root"}}]' \
    | yq --inplace '. as $item ireduce ({}; . * $item)' {{ kubernetes_configuration }} -
  kubectl --kubeconfig "{{ kubernetes_configuration }}" config use-context "{{ kubernetes_context }}"
  kubectl --kubeconfig "{{ kubernetes_configuration }}" version
