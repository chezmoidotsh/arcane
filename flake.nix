{
  description = "Atlas Nix configuration";

  # Nixpkgs / NixOS version to use.
  # inputs.nixpkgs.url = "nixpkgs/nixos-24.11";
  # TODO: nixos-24.11 is not currently available, and required to build some
  #       flake, so we will use this one too too avoid using two different
  #       nixpkgs versions and increasing the space usage.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
      in
      rec {
        packages = {
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
        };

        devShells.default = pkgs.mkShell {
          packages = [
            packages.kubevault

            # - Kubernetes and container tools
            pkgs.dive
            pkgs.docker-client
            pkgs.helm-docs
            pkgs.k3d
            pkgs.k9s
            pkgs.kubectl
            pkgs.kubernetes-helm
            pkgs.tilt

            # - Development tools
            pkgs.devcontainer
            pkgs.just
            pkgs.runme

            # - Security and encryption tools
            pkgs.age
            pkgs.sops

            # - Quality assurance tools
            pkgs.ansible-lint
            pkgs.bats
            pkgs.commitlint
            pkgs.lefthook
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
            pkgs.bashInteractive
            pkgs.delta
            pkgs.fzf
            pkgs.lazygit
            pkgs.nix-output-monitor
            pkgs.yq-go

            # Miscellaneous tools
            pkgs.d2
          ];

          env = {
            BATS_ROOT = "${pkgs.bats}";
            BATS_LIB_PATH = "${pkgs.bats.libraries.bats-assert}/share/bats:${pkgs.bats.libraries.bats-support}/share/bats:${pkgs.bats.libraries.bats-file}/share/bats";
            LANG = "C.UTF-8";
          };

          installPhase = "";
        };
      }
    );
}
