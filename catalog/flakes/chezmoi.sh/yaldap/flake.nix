{
  description = "yaLDAP is an easy-to-use LDAP server using YAML file as directory definition.";

  # Nixpkgs / NixOS version to use.
  # inputs.nixpkgs.url = "nixpkgs/nixos-24.11";
  # TODO: nixos-24.11 is not currently available, and required for the yarn*Hook packages.
  inputs.nixpkgs.url = "nixpkgs/nixos-unstable";

  inputs.systems.url = "github:nix-systems/default";
  inputs.flake-utils.url = "github:numtide/flake-utils";
  inputs.flake-utils.inputs.systems.follows = "systems";

  outputs =
    { self
    , nixpkgs
    , flake-utils
    , ...
    }:
    flake-utils.lib.eachDefaultSystem (system: {
      packages =
        let
          pkgs = import nixpkgs { inherit system; };
          inherit (import ./yaldap.nix { inherit self pkgs; }) yaldap version;
          nixversion = "${pkgs.lib.versions.major pkgs.lib.version}.${pkgs.lib.versions.minor pkgs.lib.version}";
        in
        rec {
          inherit yaldap;

          # ┌───────────────────────────────────────────────────────────────────────────┐
          # │ <default>: Build the yaLDAP image based on the yaLDAP source code.        │
          # │            See `yaldap.nix` for more details.                             │
          # │                                                                           │
          # | @sh.chezmoi.app.image: yaldap                                             │
          # | @sh.chezmoi.app.type: helm                                                │
          # └───────────────────────────────────────────────────────────────────────────┘
          default = pkgs.dockerTools.buildLayeredImage {
            name = "yaldap";
            tag = "${version}-${nixversion}-${system}";

            # Add CA certificates that can be required by Traefik.
            contents = [ pkgs.cacert ];

            config.Env = [ "TZDIR=${pkgs.tzdata}/share/zoneinfo" ];
            config.Entrypoint = [ "${yaldap}/bin/yaldap" ];

            created = builtins.substring 0 8 self.lastModifiedDate;
            config.Labels = {
              "org.opencontainers.image.authors" = "chezmoi.sh Lab <xunleii@users.noreply.github.com>";
              "org.opencontainers.image.description" = "yaLDAP is an easy-to-use LDAP server using YAML file as directory definition.";
              "org.opencontainers.image.documentation" = "https://github.com/chezmoi-sh/yaldap";
              "org.opencontainers.image.licenses" = "Apache-2.0";
              "org.opencontainers.image.revision" = version;
              "org.opencontainers.image.source" = "https://github.com/chezmoi-sh/atlas/blob/main/catalog/flakes/chezmoi-sh/yaldap/flake.nix";
              "org.opencontainers.image.title" = "ydalp";
              "org.opencontainers.image.url" = "https://github.com/chezmoi-sh/atlas";
              "org.opencontainers.image.version" = version;

              "sh.chezmoi.catalog.build.engine.type" = "nix";
              "sh.chezmoi.catalog.build.engine.version" = "${pkgs.lib.version}";
              "sh.chezmoi.catalog.category" = "system/network";
              "sh.chezmoi.catalog.origin.author" = "Chezmoi.sh Lab <https://github.com/chezmoi-sh>";
              "sh.chezmoi.catalog.origin.license" = "MIT";
              "sh.chezmoi.catalog.origin.repository" = "github.com/chezmoi-sh/yaldap";
            };
            config.User = "23169:42291"; # NOTE: random UID/GID
          };
        };
    });
}
