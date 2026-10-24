# oripathy: type=nixpkg pkg=openbao upstream=github.com/openbao/openbao tagPrefix=v
{
  description = "OpenBao Vault (with SoftHSMv2)";

  # Nixpkgs / NixOS version to use.
  inputs.nixpkgs.url = "nixpkgs/nixos-unstable";

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

      # Since OpenBao 2.7.0 the pkcs11 seal is no longer built in: it is the external
      # kms-pkcs11 plugin, declared in the server configuration (`plugin "kms" "pkcs11"`).
      # The upstream release binary is dynamically linked (cgo), so it is patched for Nix.
      pkcs11PluginVersion = "0.2.1";
      pkcs11PluginAsset = {
        x86_64-linux = {
          file = "linux_amd64_v1";
          sha256 = "ed18e461bb2bf13e644194711f72aed79524fda8a7c212e8a2ef8548be761497";
        };
        aarch64-linux = {
          file = "linux_arm64_v8";
          sha256 = "d402f8857a88764abd8ab5b6ee7310e982873cc2b19a613d4da644a821aad3e1";
        };
      }.${system} or null;
      pkcs11Plugin = pkgs.stdenvNoCC.mkDerivation {
        pname = "openbao-plugin-kms-pkcs11";
        version = pkcs11PluginVersion;

        src = pkgs.fetchurl {
          url = "https://github.com/openbao/openbao-plugins/releases/download/kms-pkcs11-v${pkcs11PluginVersion}/openbao-plugin-kms-pkcs11_${pkcs11PluginAsset.file}.tar.gz";
          inherit (pkcs11PluginAsset) sha256;
        };
        sourceRoot = ".";

        nativeBuildInputs = [ pkgs.autoPatchelfHook ];
        buildInputs = [ pkgs.glibc ];

        dontConfigure = true;
        dontBuild = true;
        installPhase = ''
          install -Dm755 openbao-plugin-kms-pkcs11_${pkcs11PluginAsset.file} $out/bin/openbao-plugin-kms-pkcs11
        '';
      };
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
          # The plugin version is part of the tag: the image changes when the plugin does.
          tag = "${version}-${nixversion}-pkcs11.${pkcs11PluginVersion}-${system}";

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
            mkdir -p openbao/{config,logs,file,plugins}

            # Install the PKCS#11 seal plugin (`plugin_directory = "/openbao/plugins"`).
            cp ${pkcs11Plugin}/bin/openbao-plugin-kms-pkcs11 openbao/plugins/

            chown -R 23169:42291 openbao
            chmod 755 openbao openbao/{config,logs,file,plugins}

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
