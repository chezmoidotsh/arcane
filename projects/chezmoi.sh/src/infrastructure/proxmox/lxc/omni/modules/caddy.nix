# ─────────────────────────────────────────────────────────────────────────────
# Caddy reverse proxy — TLS termination for all Omni subdomains
# ─────────────────────────────────────────────────────────────────────────────
# Listens on :80 (redirect) and :443 (HTTPS only). TLS is obtained via
# DNS-01 ACME using the Cloudflare plugin — :80 never needs to be reachable
# from the ACME infrastructure.
#
# All Omni services are exposed through subdomains on port 443:
#
#   omni.chezmoi.sh        — Omni UI/API + Dex OIDC
#     /dex/*  →  Dex OIDC       (loopback HTTP :5557, prefix preserved)
#     /*      →  Omni UI/API    (loopback HTTPS :8443, Omni PKI cert)
#
#   api.omni.chezmoi.sh    — SideroLink Machine API (gRPC, loopback HTTPS :9090)
#
#   kube.omni.chezmoi.sh   — Kubernetes API proxy  (HTTPS, loopback :8100)
#
# No non-standard TCP ports are opened externally. The event sink (:8091)
# and SideroLink WireGuard (:50180/UDP) keep their direct bindings.
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

      # ─── omni.chezmoi.sh — UI/API + Dex OIDC ──────────────────────────
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
        # `/dex*` matches both the bare `/dex` path and all `/dex/…` sub-paths.
        handle /dex* {
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

      # ─── api.omni.chezmoi.sh — SideroLink Machine API ──────────────────
      # Talos machines connect here for SideroLink registration and the
      # gRPC tunnel. Caddy terminates TLS with the DNS-01 Let's Encrypt
      # cert so machines trust it without needing Omni's self-signed PKI CA.
      # Omni's machine API binds on loopback (machineApiBindAddr).
      https://api.${domain} {
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

      # ─── kube.omni.chezmoi.sh — Kubernetes API proxy ───────────────────
      # omnictl / kubectl connects here to reach managed cluster APIs.
      # Omni's k8s proxy binds on loopback (k8sProxyBindAddr) with its own
      # PKI TLS cert (inherited from the main API cert/key); Caddy proxies
      # with tls_insecure_skip_verify, matching the UI/API and Machine API.
      https://kube.${domain} {
        reverse_proxy https://${cfg.k8sProxyBindAddr} {
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

  # Caddy is the sole public TCP surface — all Omni services are routed
  # through subdomains on 443. The catalog omni module opens 8091 (event
  # sink, WireGuard-internal) and the WireGuard UDP port separately.
  # Do NOT use lib.mkDefault for allowedTCPPorts — nixos-generators' lxc
  # format sets it to [] at normal priority and would silently win over
  # mkDefault (1000). Normal-priority assignments from multiple modules are
  # concatenated by lib.concatLists, so this adds [80 443] on top.
  networking.firewall.allowedTCPPorts = [ 80 443 ];
}
