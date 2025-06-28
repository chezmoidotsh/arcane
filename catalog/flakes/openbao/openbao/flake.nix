{
  description = "OpenBao Vault (with SoftHSMv2)";

  # Nixpkgs / NixOS version to use.
  inputs.nixpkgs.url = "nixpkgs/nixos-25.05";

  inputs.systems.url = "github:nix-systems/default";
  inputs.flake-utils.url = "github:numtide/flake-utils";
  inputs.flake-utils.inputs.systems.follows = "systems";

  inputs.flockenzeit.url = "github:balsoft/Flockenzeit";

  outputs =
    { self
    , nixpkgs
    , flake-utils
    , flockenzeit
    , ...
    }:
    flake-utils.lib.eachDefaultSystem (system:
    let
      pkgs = import nixpkgs {
        inherit system;
      };
      version = pkgs.openbao.version;
      nixversion = "${pkgs.lib.versions.major pkgs.lib.version}.${pkgs.lib.versions.minor pkgs.lib.version}";

      # Custom configuration and scripts.
      entrypoint = pkgs.writeScript "docker-entrypoint.sh" (builtins.readFile ./docker-entrypoint.sh);
      generateTokens = pkgs.writeScript "softhsm:tokens:new" (builtins.readFile ./softhsm-tokens-new);
    in
    {
      packages = {
        # ┌───────────────────────────────────────────────────────────────────────────┐
        # │ <runtimeImage>: Build the OpenBao image with minimal components and       │
        # │                SoftHSMv2.                                                 │
        # │                                                                           │
        # | @sh.chezmoi.app.image: openbao                                            |
        # | @sh.chezmoi.app.type: helm                                                │
        # └───────────────────────────────────────────────────────────────────────────┘
        default = pkgs.dockerTools.buildLayeredImage {
          name = "openbao-softhsm";
          tag = "${version}-${nixversion}-${system}";

          # Add OpenBao, SoftHSMv2, CA certificates, Tini and directories to the image.
          contents = [
            pkgs.busybox
            pkgs.cacert
            pkgs.openbao
            pkgs.softhsm
            pkgs.tini
            pkgs.opensc
            pkgs.hcl2json
            pkgs.jq
          ];

          fakeRootCommands = ''
            #!${pkgs.runtimeShell}

            # Create default OpenBao directories.
            mkdir -p openbao/{config,logs,file}
            chown -R 23169:42291 openbao
            chmod 755 openbao openbao/{config,logs,file}

            # Create SoftHSMv2 token directory where the tokens are stored.
            mkdir -p run/secrets/openbao/pkcs11
            chown -R 23169:42291 run/secrets/openbao/pkcs11
            chmod 755 run/secrets/openbao/pkcs11

            # Create temporary directory.
            mkdir -p tmp
            chmod 1777 tmp

            ln -s ${generateTokens} bin/softhsm:tokens:new
            mkdir -p usr/local/bin
            ln -s ${entrypoint} usr/local/bin/docker-entrypoint.sh
          '';
          enableFakechroot = false;

          config.Env = [
            "PATH=/bin"
            "TZDIR=${pkgs.tzdata}/share/zoneinfo"
          ];
          config.Entrypoint = [ "${pkgs.tini}/bin/tini" "--" "${entrypoint}" ];

          maxLayers = 32;
          created = flockenzeit.lib.ISO-8601 self.lastModified;
          config.Labels = {
            "org.opencontainers.image.authors" = "chezmoidotsh lab <xunleii@users.noreply.github.com>";
            "org.opencontainers.image.description" = "Open source, community-driven fork of Vault managed by the Linux Foundation, with SoftHSMv2 for PKCS#11 auto-unseal.";
            "org.opencontainers.image.documentation" = "https://openbao.org/docs/";
            "org.opencontainers.image.licenses" = "MPL-2.0";
            "org.opencontainers.image.revision" = self.rev or self.dirtyRev or "dirty";
            "org.opencontainers.image.source" = "https://github.com/chezmoidotsh/arcane/blob/main/catalog/flakes/openbao/openbao/flake.nix";
            "org.opencontainers.image.title" = "openbao-softhsm";
            "org.opencontainers.image.url" = "https://github.com/chezmoidotsh/arcane";
            "org.opencontainers.image.version" = version;

            "sh.chezmoi.catalog.build.engine.type" = "nix";
            "sh.chezmoi.catalog.build.engine.version" = "${pkgs.lib.version}";
            "sh.chezmoi.catalog.category" = "system/security";
            "sh.chezmoi.catalog.origin.author" = "OpenBao";
            "sh.chezmoi.catalog.origin.license" = "MPL-2.0";
            "sh.chezmoi.catalog.origin.repository" = "github.com/openbao/openbao";
          };
          config.User = "23169:42291";
        };
      };
    });
}
