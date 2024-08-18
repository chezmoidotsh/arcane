# Copyright (C) 2024 Alexandre Nicolaie (xunleii@users.noreply.github.com)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ----------------------------------------------------------------------------
{ pkgs ? import <nixpkgs> { config.allowUnfree = true; }
,
}:
let
  # helm-schema is a tool to generate JSON schemas based on values.yaml files.
  # NOTE: This uses a custom fork of the original project, as the original
  #       project didn't allows me to manage custom `required` fields.
  helm-schema = pkgs.buildGoModule {
    pname = "helm-schema";
    version = "unstable";
    src = pkgs.fetchFromGitHub {
      owner = "chezmoi-sh";
      repo = "helm-schema";
      rev = "main";
      hash = "sha256-PootirY9vVR3Chy6WKTTqgqzeQvJ0xNqSfyE/DTWY9I=";
    };

    vendorHash = "sha256-qKizheh9YGJFe/bNeWVG+gbmsouuNlMAaZO0DvaL1R0=";
    subPackages = [ "cmd/helm-schema" ];
  };

  # bats-custom-libs is a custom set of Bats libraries that I use in my tests.
  bats-custom-libs = pkgs.stdenv.mkDerivation {
    name = "bats-custom-libs";
    src = ./.;
    installPhase = ''
      mkdir --parent $out/share/bats
      cp --recursive .bats/bats-* $out/share/bats
    '';
  };
in
pkgs.mkShell {
  packages = [
    # runtime requirements
    pkgs.bashInteractive
    pkgs.bats
    pkgs.devcontainer
    pkgs.docker-client
    pkgs.helm
    pkgs.k3d
    pkgs.kubectl

    # development requirements
    pkgs.commitlint
    pkgs.lazygit
    pkgs.lefthook
    pkgs.nix-output-monitor
    pkgs.trunk-io

    # other requirements
    helm-schema
    pkgs.d2
    pkgs.gum
    pkgs.helm-docs
    pkgs.just
    pkgs.nil
    pkgs.nixfmt-rfc-style
  ];

  env = {
    BATS_ROOT = "${pkgs.bats}";
    BATS_LIB_PATH = "${pkgs.bats.libraries.bats-assert}/share/bats:${pkgs.bats.libraries.bats-support}/share/bats:${pkgs.bats.libraries.bats-file}/share/bats:${bats-custom-libs}/share/bats";
  };

  installPhase = "";
}
