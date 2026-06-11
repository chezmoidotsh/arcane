# ─────────────────────────────────────────────────────────────────────────────
# Caddy reverse proxy — TLS termination for omni.chezmoi.sh
# ─────────────────────────────────────────────────────────────────────────────
# Listens on :80 (redirect) and :443 (HTTPS). TLS is obtained via DNS-01
# ACME using the Cloudflare plugin so that :80 never needs to be reachable
# from the ACME infrastructure.
#
# Path routing on the single hostname `omni.chezmoi.sh`:
#   /dex/*  →  Dex OIDC      (loopback HTTP, prefix preserved)
#   /*      →  Omni UI/API   (loopback HTTPS, self-signed cert from Omni PKI)
#
# The Omni Machine API (:8090), event sink (:8091), Kubernetes proxy (:8100)
# and SideroLink WireGuard (:50180/UDP) are NOT proxied — they keep their
# direct binding and are opened by `catalog/nix/siderolabs/omni/omni.nix`
# at the firewall layer.
#
# Build arg:
#   cloudflareToken — Cloudflare API token, forwarded from flake.nix via
#                     _module.args. When empty (pure build), /etc/caddy/secrets
#                     is not created and the operator must provide it manually;
#                     Caddy starts but ACME issuance fails until the file
#                     exists (the `-` prefix on EnvironmentFile makes systemd
#                     tolerate the missing file at boot).
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, config, cloudflareToken ? "", ... }:

let
  cfg = config.services.omni;
  domain = cfg.domain;
in
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
      http://${domain} {
        redir https://{host}{uri} permanent
      }

      # ─── HTTPS termination + path routing ──────────────────────────────
      https://${domain} {
        header {
          # 1 year HSTS, includeSubDomains, preload-eligible.
          Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
          X-Content-Type-Options "nosniff"
          Referrer-Policy "no-referrer"
          -Server
        }

        # Dex OIDC — sub-path. The catalog Dex module sets the issuer to
        # https://omni.chezmoi.sh/dex, so Dex itself serves every route under
        # the /dex prefix. Forward the request verbatim (no path rewrite).
        handle /dex/* {
          reverse_proxy http://${cfg.dex.bindAddr}
        }

        # Omni UI / API — everything else. Omni binds on loopback with its
        # own PKI TLS cert; tls_insecure_skip_verify is intentional because
        # that cert is self-signed by the Omni PKI init job.
        handle {
          reverse_proxy https://${cfg.bindAddr} {
            transport http {
              tls_insecure_skip_verify
            }
            # Streaming kubectl proxy / SideroLink events — disable buffering.
            flush_interval -1
          }
        }

        tls {
          dns cloudflare {env.CLOUDFLARE_API_TOKEN}
        }
      }

      # ─── Machine API (SideroLink) on port 8090 ─────────────────────────
      # Talos machines connect here for SideroLink registration and the
      # gRPC tunnel (grpc_tunnel=true). Caddy terminates TLS with the
      # DNS-01 Let's Encrypt cert so machines trust it without needing
      # Omni's self-signed PKI CA. Omni's machine API is moved to a
      # loopback-only internal port (machineApiBindAddr) to keep Caddy
      # as the single TLS entry point.
      https://${domain}:8090 {
        reverse_proxy https://${cfg.machineApiBindAddr} {
          transport http {
            tls_insecure_skip_verify
          }
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

  # Caddy is the public surface; the catalog omni module opens the direct
  # API/proxy ports (8090/8091/8100) and the WireGuard UDP port separately.
  # Do NOT use lib.mkDefault for allowedTCPPorts — nixos-generators' lxc
  # format sets it to [] at normal priority and would silently win over
  # mkDefault (1000). Normal-priority assignments from multiple modules are
  # concatenated by lib.concatLists, so this adds [80 443] on top.
  networking.firewall.allowedTCPPorts = [ 80 443 ];
}
