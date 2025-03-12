[private]
@default:
  just --list --list-submodules


# -- Infrastructure (ansible) related tasks ------------------------------------
[doc("Bootstrap the cluster using Ansible")]
bootstrap: upgrade-collections && update-kubeconfig
  ansible-playbook --diff bootstrap-cluster.yaml

[private]
[doc("Upgrade Ansible collections")]
upgrade-collections:
  ansible-galaxy collection install --upgrade community.general
  ansible-galaxy collection install --upgrade kubernetes.core

# -- Kubernetes related tasks --------------------------------------------------
[doc("Generates the kubeconfig")]
update-kubeconfig:
  ansible-playbook --diff \
    --inventory kubernetes.maison.chezmoi.sh, \
    --user kairos \
    sync-kubeconfig.yaml
