{ pkgs, lib, config, inputs, ... }:

let
  # kubevault is a custom package that is not available in nixpkgs yet
  kubevault = pkgs.rustPlatform.buildRustPackage {
    pname = "kubevault";
    version = "1.1.0";
    src = pkgs.fetchFromGitHub {
      owner = "chezmoi-sh";
      repo = "kubevault";
      rev = "1.1.0";
      hash = "sha256-PLQusY/hiqy6GsEYsV2tQjUHckV/04o5mEaw6NLrZV8=";
    };

    cargoHash = "sha256-N85XU02MtkCm7zbvSA1Tv5VkKciJQM1Fwwb3F0vIOiU=";
  };
in
{
  # ┌───────────────────────────────────────────────────────────────────────────┐
  # │ Environment variables definitions                                         │
  # └───────────────────────────────────────────────────────────────────────────┘
  # NOTE: in order to speed up a bit the development experience, we will use the
  #       `.containerdev` folder as location for all cached items
  env.HELM_CACHE_HOME = "${config.env.DEVENV_ROOT}/.cache/helm/cache";
  env.HELM_CONFIG_HOME = "${config.env.DEVENV_ROOT}/.cache/helm/config";
  env.HELM_DATA_HOME = "${config.env.DEVENV_ROOT}/.cache/helm/data";

  # NOTE: I don't want to use the default `~/.kube` folder for the kubeconfig file
  #       because it is not mounted in the container, and I don't want to pollute
  #       the host with a lot of files
  env.KUBECONFIG = "${config.env.DEVENV_ROOT}/.cache/kubernetes/config.yaml";

  env.SOPS_AGE_KEY_FILE = "${config.env.DEVENV_ROOT}/.cache/sops/age.key";

  # ┌───────────────────────────────────────────────────────────────────────────┐
  # │ Packages & languages configuration                                        │
  # └───────────────────────────────────────────────────────────────────────────┘
  languages.nix.enable = true;
  languages.python.enable = true;
  languages.python.directory = "${config.env.DEVENV_ROOT}/.direnv/python";

  packages = [
    # - Kubernetes and container tools
    pkgs.argocd
    pkgs.crane
    pkgs.dive
    pkgs.docker-client
    pkgs.fluxcd
    pkgs.helm-docs
    pkgs.k3d
    pkgs.k9s
    pkgs.kubectl
    pkgs.kubernetes-helm
    pkgs.tilt

    # - Development tools
    pkgs.just
    pkgs.runme

    # - Security and encryption tools
    kubevault
    pkgs.age
    pkgs.sops

    # - Quality assurance tools
    pkgs.ansible-lint
    pkgs.bats
    pkgs.commitlint
    pkgs.nil
    pkgs.nixfmt-rfc-style
    pkgs.trunk-io

    # - Provisioning tools
    pkgs.ansible
    pkgs.python312Packages.jmespath
    pkgs.python312Packages.kubernetes
    pkgs.python312Packages.proxmoxer
    pkgs.python312Packages.requests
    pkgs.python312Packages.requests-toolbelt
    pkgs.cdrkit

    # - Shell miscellaneous utilities
    pkgs.bash
    pkgs.delta
    pkgs.fzf
    pkgs.lazygit
    pkgs.nix-output-monitor
    pkgs.yq-go

    # Miscellaneous tools
    pkgs.d2
  ];

  env.DFT_SKIP_UNCHANGED = "true";
  env.KUBECTL_EXTERNAL_DIFF = "${pkgs.difftastic}/bin/difft";
  difftastic.enable = true;

  # ┌───────────────────────────────────────────────────────────────────────────┐
  # │ Devcontainer configuration                                                │
  # └───────────────────────────────────────────────────────────────────────────┘
  devcontainer.enable = true;
  devcontainer.settings.customizations.vscode.extensions = [
    "bierner.github-markdown-preview"
    "bierner.markdown-preview-github-styles"
    "jetmartin.bats"
    "jnoortheen.nix-ide"
    "ldez.ignore-files"
    "mkhl.direnv"
    "ms-azuretools.vscode-docker"
    "ms-kubernetes-tools.vscode-kubernetes-tools"
    "ms-python.python"
    "ms-vscode-remote.remote-containers"
    "nefrob.vscode-just-syntax"
    "redhat.ansible"
    "redhat.vscode-yaml"
    "tamasfe.even-better-toml"
    "terrastruct.d2"
    "tilt-dev.tiltfile"
    "trunk.io"
    "visualstudioexptteam.vscodeintellicode"
  ];
  devcontainer.settings.features = {
    "ghcr.io/devcontainers/features/docker-in-docker:2.12.1" = { };
  };
  devcontainer.settings.mounts = [
    # NOTE: in order to avoid conflict with old .devenv files existing on the
    #       host, we will mount this folder into a dedicated `tmpfs` volume
    {
      type = "tmpfs";
      target = "\${containerWorkspaceFolder}/.devenv";
    }
  ];
  devcontainer.settings.updateContentCommand = "
    set -x;
    sudo chown --recursive --no-dereference --silent vscode: /nix \"\${containerWorkspaceFolder}/.devenv\";
    devenv test;
    ${pkgs.direnv}/bin/direnv allow \"\${containerWorkspaceFolder}\";
  ";

  # ┌───────────────────────────────────────────────────────────────────────────┐
  # │ Scripts & tasks definitions                                               │
  # └───────────────────────────────────────────────────────────────────────────┘
  scripts.motd.exec = ''
      cat <<EOF
    ────────────────────────────────────────────────────────────────────────────────
    👋 Welcome to the Atlas Dev Container / Codespace!
    This space contains everything required to use, build, update and edit
    the Atlas infrastructure (aka. my homelab).

    📚 No documentation has been written yet ... but it is planned
    🚀 How to build or update the infrastructure ?
       - You can't.... nothing is ready yet -
    ────────────────────────────────────────────────────────────────────────────────
    EOF
  '';

  enterShell = ''
    export PATH="${config.env.DEVENV_ROOT}/scripts:$PATH";
    motd;
  '';
}
