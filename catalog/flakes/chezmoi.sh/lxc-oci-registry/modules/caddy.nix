{ config, lib, pkgs, ... }:

let
  cfg = config.services.lxc-oci-registry.caddy;
in
{
  options.services.lxc-oci-registry.caddy = {
    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.caddy;
      defaultText = lib.literalExpression "pkgs.caddy";
      description = ''
        Caddy package to use. Override with a pkgs.caddy.withPlugins derivation
        when DNS-01 ACME or other plugins are required.
      '';
    };

    domain = lib.mkOption {
      type = lib.types.str;
      description = ''
        Public domain name for the registry (e.g. "oci.chezmoi.sh").
        Used as the HTTP virtual host name and, when https.enable is true,
        as the HTTPS domain for TLS provisioning.
      '';
    };

    upstreamPort = lib.mkOption {
      type = lib.types.port;
      default = 5000;
      description = "Port where Zot listens (reverse-proxied by Caddy).";
    };

    https = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = ''
          Enable HTTPS termination. When true, port 80 issues a redirect to
          HTTPS and port 443 terminates TLS via Caddy's ACME integration.
          DNS-01 challenge requires a suitable caddy.package with a DNS plugin.
        '';
      };

      extraConfig = lib.mkOption {
        type = lib.types.lines;
        default = "";
        description = ''
          Extra Caddy directives appended inside the HTTPS virtual host block.
          Use to configure the TLS provider, e.g.:
            tls {
              dns cloudflare {env.CLOUDFLARE_API_TOKEN}
            }
        '';
      };
    };
  };

  config =
    let
      caddyfile =
        if cfg.https.enable then ''
          # Redirect HTTP → HTTPS
          http://${cfg.domain} {
            redir https://{host}{uri} permanent
          }

          # HTTPS vhost
          https://${cfg.domain} {
            reverse_proxy localhost:${toString cfg.upstreamPort}
            ${cfg.https.extraConfig}
          }
        ''
        else ''
          # HTTP-only (no TLS)
          ${cfg.domain}:80 {
            reverse_proxy localhost:${toString cfg.upstreamPort}
          }
        '';
    in
    {
      services.caddy = {
        enable = true;
        package = cfg.package;
        configFile = pkgs.writeText "Caddyfile" caddyfile;
      };
    };
}
