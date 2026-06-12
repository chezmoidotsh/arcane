# ─────────────────────────────────────────────────────────────────────────────
# Dex OIDC — optional integration with services.omni
# ─────────────────────────────────────────────────────────────────────────────
# Dex is *one* possible OIDC provider for Omni. You can equally point
# services.omni.oidcProviderUrl at Pocket-Id, Keycloak, or any other provider.
# Enable this module only when you want a co-located Dex instance.
#
# When enabled, Dex runs in HTTP mode on services.omni.dex.bindAddr.
# TLS termination is left to the site (Caddy, nginx, …).
# The Dex issuer URL must match services.omni.oidcProviderUrl exactly.
#
# Password hashes are read from environmentFile at Nix eval time (build --impure)
# and baked into the config. Generate with:
#   htpasswd -bnBC 12 "" '<password>' | tr -d ':\n'
# ─────────────────────────────────────────────────────────────────────────────
{ config, lib, pkgs, ... }:

let
  cfg = config.services.omni;
  dex = cfg.dex;

  # Dex web assets with an extra "omni" theme that mirrors the Omni UI
  # design tokens (see ./dex-theme/). Dex only allows overriding the
  # whole web directory, so upstream assets are copied verbatim and the
  # theme is layered on top. The logo/favicon are rasterized from the
  # committed SVG sources at build time (Dex templates hardcode the
  # theme/logo.png and theme/favicon.png paths).
  omniWebDir = pkgs.runCommand "dex-web-omni"
    { nativeBuildInputs = [ pkgs.resvg ]; }
    ''
      mkdir -p $out
      cp -r ${pkgs.dex-oidc.src}/web/. $out/
      chmod -R u+w $out
      mkdir -p $out/themes/omni
      cp ${./dex-theme/styles.css} $out/themes/omni/styles.css
      resvg --zoom 4 ${./dex-theme/logo.svg} $out/themes/omni/logo.png
      resvg --width 128 --height 128 ${./dex-theme/favicon.svg} \
        $out/themes/omni/favicon.png
    '';
in
{
  options.services.omni.dex = {
    enable = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Enable a co-located Dex OIDC provider. Not mandatory — any OIDC provider works.";
    };

    bindAddr = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1:5557";
      description = "Dex HTTP bind address. TLS is handled externally by the site.";
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = "Environment file for the dex unit (e.g. SOPS-decrypted secrets).";
    };

    omniTheme = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Style the Dex login page like the Omni UI (dark background,
        Sidero orange accents, Sidero logo). Disable to keep the stock
        Dex frontend.
      '';
    };

    users = lib.mkOption {
      type = lib.types.listOf (lib.types.submodule {
        options = {
          email = lib.mkOption { type = lib.types.str; };
          username = lib.mkOption { type = lib.types.str; };
          hashEnvVar = lib.mkOption {
            type = lib.types.str;
            description = "Env var name holding the bcrypt hash (from environmentFile).";
          };
        };
      });
      default = [ ];
      example = lib.literalExpression ''
        [{ email = "admin@example.com"; username = "admin"; hashEnvVar = "DEX_ADMIN_PASSWORD_HASH"; }]
      '';
    };
  };

  config =
    let
      # Dex does not expand ${VAR} in its YAML config (Dex ≥2.40 dropped
      # the internal envsubst pass). Bake the hash directly by reading the
      # value from the secrets file at Nix evaluation time and emitting
      # the literal string into the config. When the file is absent (pure
      # build), hashes are empty — Dex will reject the config at startup,
      # which is the expected behavior for a build without secrets.
      # Read from dex.environmentFile specifically (set to a nix-store file
      # at build time in the site configuration.nix), not from the main
      # cfg.environmentFile which is a runtime path. Both are declared
      # options (nullOr str), so `or` never falls through — test for null
      # explicitly.
      envFile =
        if dex.environmentFile != null then dex.environmentFile
        else if cfg.environmentFile != null then cfg.environmentFile
        else null;

      mkHash = u:
        let
          raw = builtins.readFile envFile;
          lines = lib.splitString "\n" (lib.replaceStrings [ "\r" ] [ "" ] raw);
          prefix = "${u.hashEnvVar}=";
          match = lib.findFirst (lib.hasPrefix prefix) "" lines;
        in
        lib.removePrefix prefix match;

      # Pure-build fallback: empty string so the hash slot is populated
      # but invalid. Dex rejects it, which is the desired behaviour.
      mkHashOrEmpty = u:
        if envFile != null && builtins.pathExists envFile
        then mkHash u
        else "";

      passwordUsers = map
        (u: {
          email = u.email;
          username = u.username;
          preferredUsername = u.username;
          hash = mkHashOrEmpty u;
        })
        dex.users;
    in
    lib.mkIf (cfg.enable && dex.enable) {
      services.dex = {
        enable = true;

        environmentFile =
          lib.mkIf (dex.environmentFile != null) dex.environmentFile;

        settings = {
          issuer = cfg.oidcProviderUrl;
          storage.type = "memory";
          web.http = dex.bindAddr;

          enablePasswordDB = true;

          frontend = lib.mkIf dex.omniTheme {
            dir = toString omniWebDir;
            theme = "omni";
            issuer = "Omni";
          };

          staticClients = [{
            id = cfg.oidcClientId;
            secret = cfg.oidcClientSecret;
            name = "Omni";
            redirectURIs = [ "https://${cfg.domain}/oidc/consume" ];
          }];

          staticPasswords = passwordUsers;
        };
      };
    };
}
