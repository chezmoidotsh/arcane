# ─────────────────────────────────────────────────────────────────────────────
# Caddy reverse proxy — TLS termination for oci.chezmoi.sh
# ─────────────────────────────────────────────────────────────────────────────
# Listens on :80 (redirect) and :443 (HTTPS). TLS is obtained via DNS-01
# ACME using the Cloudflare plugin so that :80 never needs to be reachable
# from the ACME infrastructure.
#
# Build arg:
#   cloudflareToken — Cloudflare API token, forwarded from flake.nix via
#                     _module.args. When empty (pure build), /etc/caddy/secrets
#                     is not created and the operator must provide it manually;
#                     Caddy starts but ACME issuance fails until the file
#                     exists (the `-` prefix on EnvironmentFile makes systemd
#                     tolerate the missing file at boot).
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, cloudflareToken ? "", ... }:

{
  services.caddy = {
    enable = true;

    # Caddy with the Cloudflare DNS plugin for the ACME DNS-01 challenge.
    # Refresh the hash when bumping the plugin version:
    #   nix run nixpkgs#caddy.withPlugins -- <same-args> 2>&1 | grep hash
    package = pkgs.caddy.withPlugins {
      plugins = [ "github.com/caddy-dns/cloudflare@v0.2.4" ];
      hash = "sha256-bzMqxWTqrJ1skZmRTXyEMCKStXpljbqe5r0Ve2cnBfM=";
    };

    configFile = pkgs.writeText "Caddyfile" ''
      # ─── HTTP → HTTPS redirect ─────────────────────────────────────────
      http://oci.chezmoi.sh {
        redir https://{host}{uri} permanent
      }

      # ─── HTTPS termination + reverse proxy ────────────────────────────
      https://oci.chezmoi.sh {
        # OCI clients chunk-upload multi-GB layers; lift the body limit.
        request_body {
          max_size 10GiB
        }

        header {
          # 1 year HSTS, includeSubDomains, preload-eligible.
          Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
          X-Content-Type-Options "nosniff"
          Referrer-Policy "no-referrer"
          -Server
        }

        reverse_proxy localhost:5000 {
          # Streaming large blobs — disable response buffering.
          flush_interval -1
        }

        tls {
          dns cloudflare {env.CLOUDFLARE_API_TOKEN}
        }
      }
    '';
  };

  # Cloudflare API token for DNS-01. Created only when the token is non-empty
  # (i.e. `nix build --impure` with CLOUDFLARE_API_TOKEN in the environment).
  environment.etc."caddy/secrets" = lib.mkIf (cloudflareToken != "") {
    text = "CLOUDFLARE_API_TOKEN=${cloudflareToken}\n";
    mode = "0400";
    user = "caddy";
    group = "caddy";
  };

  systemd.services.caddy.serviceConfig = {
    EnvironmentFile = "-/etc/caddy/secrets";

    # Extra hardening on top of what nixpkgs' caddy unit already sets.
    ProtectHome = lib.mkDefault true;
    ProtectKernelLogs = lib.mkDefault true;
    ProtectClock = lib.mkDefault true;
    RestrictSUIDSGID = lib.mkDefault true;
    LockPersonality = lib.mkDefault true;
    LimitNOFILE = 65536;
  };
}
