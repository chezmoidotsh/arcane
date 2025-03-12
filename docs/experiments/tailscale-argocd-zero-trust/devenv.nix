{ pkgs, lib, config, inputs, ... }:

{
  env.KUBECONFIG = "${config.env.DEVENV_ROOT}/.direnv/kube/config.yaml";
  env.HELM_HOME = "${config.env.DEVENV_ROOT}/.direnv/helm";
  env.HELM_CACHE_HOME = "${config.env.DEVENV_ROOT}/.direnv/helm/cache";
  env.HELM_CONFIG_HOME = "${config.env.DEVENV_ROOT}/.direnv/helm/config";

  packages = [
    # Kubernetes Tools
    pkgs.krew
    pkgs.kubectl
    pkgs.kubernetes-helm
    pkgs.k3d

    # Utility
    pkgs.argocd
    pkgs.runme
    pkgs.tailscale
  ];

  devcontainer.enable = true;
  difftastic.enable = true;
}
