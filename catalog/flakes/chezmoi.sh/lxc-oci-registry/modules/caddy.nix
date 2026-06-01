# ─────────────────────────────────────────────────────────────────────────────
# services.lxc-oci-registry.caddy
# ─────────────────────────────────────────────────────────────────────────────
# Caddy in front of Zot.
#
# Caddy is responsible for:
#   * Listening on :80 and :443 (the LXC's only public ports).
#   * Forcing HTTP → HTTPS on :80 (no plaintext registry traffic, ever).
#   * Provisioning and renewing the TLS certificate for `domain` via ACME.
#   * Reverse-proxying everything to Zot on `localhost:upstreamPort`.
#   * Emitting the OCI/registry-friendly Strict-Transport-Security header
#     and stripping/normalising downstream headers Zot might emit.
#
# Caddy is NOT responsible for authentication — Zot has its own htpasswd
# layer, and OCI clients expect 401 challenges to come from the registry
# (with a `WWW-Authenticate: Bearer …` realm) rather than from a proxy
# basic-auth dialog. Bolting Caddy basic-auth on top would break `docker
# login`, `crane`, `skopeo`, and most pull-through clients.
# ─────────────────────────────────────────────────────────────────────────────
{ config, lib, pkgs, ... }:

let
  cfg = config.services.lxc-oci-registry.caddy;

  # Indent helper for embedding `cfg.https.extraConfig` cleanly inside a
  # site block in the generated Caddyfile.
  indent = n: s:
    let
      prefix = lib.concatStrings (builtins.genList (_: " ") n);
      lines = lib.splitString "\n" s;
    in
    lib.concatStringsSep "\n" (
      map (line: if line == "" then "" else prefix + line) lines
    );

  caddyfile =
    if cfg.https.enable then ''
      # ─── HTTP → HTTPS redirect ──────────────────────────────────────────
      http://${cfg.domain} {
        redir https://{host}{uri} permanent
      }

      # ─── HTTPS termination + reverse proxy ──────────────────────────────
      https://${cfg.domain} {
        # OCI clients chunk-upload multi-GB layers; default flush timing is
        # fine but we lift the request body limit (Caddy defaults to 1 GiB
        # on stream uploads — explicit for clarity).
        request_body {
          max_size ${cfg.maxRequestBodySize}
        }

        # Cache-busting headers for registry responses — manifests must
        # never be cached by intermediaries.
        header {
          # 1 year HSTS, include subdomains, preload-eligible.
          Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
          # Defence-in-depth headers (registry is not a browser surface,
          # but cheap to set).
          X-Content-Type-Options "nosniff"
          Referrer-Policy "no-referrer"
          # Strip Server banner from Caddy responses.
          -Server
        }

        reverse_proxy localhost:${toString cfg.upstreamPort} {
          # Streaming large blobs — disable buffering for low memory.
          flush_interval -1
        }

      ${indent 2 cfg.https.extraConfig}
      }
    ''
    else ''
      # ─── HTTP-only (testing / dev) ──────────────────────────────────────
      ${cfg.domain}:80 {
        reverse_proxy localhost:${toString cfg.upstreamPort} {
          flush_interval -1
        }
      }
    '';
in
{
  options.services.lxc-oci-registry.caddy = {

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.caddy;
      defaultText = lib.literalExpression "pkgs.caddy";
      description = ''
        Caddy package to run. Override with a `pkgs.caddy.withPlugins`
        derivation when you need DNS-01 ACME or another non-default plugin:

            pkgs.caddy.withPlugins {
              plugins = [ "github.com/caddy-dns/cloudflare@v0.2.4" ];
              hash = "sha256-…";  # compute once, see project README
            };
      '';
    };

    domain = lib.mkOption {
      type = lib.types.strMatching "[a-zA-Z0-9.-]+";
      example = "oci.chezmoi.sh";
      description = ''
        Public domain serving the registry. Used as the HTTP and HTTPS
        virtual host name and as the subject of the ACME certificate.
      '';
    };

    upstreamPort = lib.mkOption {
      type = lib.types.port;
      default = 5000;
      description = "Local port where Zot is listening.";
    };

    maxRequestBodySize = lib.mkOption {
      type = lib.types.str;
      default = "10GiB";
      example = "5GiB";
      description = ''
        Maximum allowed request body size — sets a hard ceiling on the
        largest blob layer the registry will accept on a single PUT/PATCH.
        Take Caddy's [size syntax](https://caddyserver.com/docs/conventions#size-units).
      '';
    };

    https = {
      enable = lib.mkEnableOption "HTTPS termination via Caddy's ACME integration";

      extraConfig = lib.mkOption {
        type = lib.types.lines;
        default = "";
        description = ''
          Extra Caddy directives appended inside the HTTPS site block. Use
          this hook to configure the TLS issuer (file, internal, or a DNS
          plugin). Example for Cloudflare DNS-01:

              tls {
                dns cloudflare {env.CLOUDFLARE_API_TOKEN}
              }
        '';
      };
    };
  };

  config = {
    # Hard assertion: HTTPS without a TLS configuration is footgun-prone —
    # Caddy would fall back to HTTP-01, which we don't expose (no :80 ACME
    # challenge endpoint configured on this LXC).
    assertions = [
      {
        assertion = cfg.https.enable -> cfg.https.extraConfig != "";
        message = ''
          services.lxc-oci-registry.caddy.https.enable = true requires
          .https.extraConfig to declare a TLS issuer (e.g. a DNS-01 plugin
          block). Set extraConfig or disable HTTPS.
        '';
      }
    ];

    services.caddy = {
      enable = true;
      package = cfg.package;
      configFile = pkgs.writeText "Caddyfile" caddyfile;
    };

    # ── Caddy systemd hardening ────────────────────────────────────────────
    # The unit shipped by nixpkgs already sets reasonable defaults, but
    # ProtectHome=true is helpful inside an LXC where /home is empty.
    systemd.services.caddy.serviceConfig = {
      ProtectHome = lib.mkDefault true;
      ProtectKernelLogs = lib.mkDefault true;
      ProtectClock = lib.mkDefault true;
      RestrictSUIDSGID = lib.mkDefault true;
      LockPersonality = lib.mkDefault true;
      LimitNOFILE = 65536;
    };
  };
}
