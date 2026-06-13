# ─────────────────────────────────────────────────────────────────────────────
# Caddy reverse proxy — TLS termination + path routing for o11y.chezmoi.sh
# ─────────────────────────────────────────────────────────────────────────────
# The single public surface of the appliance. Two listeners, same route table:
#
#   :80 / :443 (public)   — TLS via Cloudflare DNS-01 ACME for o11y.chezmoi.sh
#   tailnet (tsnet)       — caddy-tailscale (embedded Tailscale, userspace)
#                           TLS issued automatically by Tailscale's ACME
#                           reachable at observability.<tailnet>.ts.net
#
# caddy-tailscale embeds a tsnet node directly in the Caddy process — there is
# no kernel TUN device and no separate tailscaled daemon. The LXC gains tailnet
# membership without the /dev/net/tun passthrough.
#
# Signal routing (identical on both listeners):
#   client ─┬─ /metrics/*  → VictoriaMetrics :8428 (remote_write, query, OTLP)
#            ├─ /logs/*     → VictoriaLogs :9428 (ingest + query)
#            ├─ /traces/*   → VictoriaTraces :10428 (OTLP/Jaeger)
#            └─ /alerts/*   → Alertmanager :9093 (per-cluster vmalert notify)
#
# VM/VLogs/VTraces serve at root — Caddy strips the /<signal> prefix
# (handle_path); Alertmanager keeps it (--web.route-prefix=/alerts).
#
# Build args:
#   secrets.cloudflareToken   — Cloudflare API token for DNS-01 ACME. When empty
#     (pure build) /etc/caddy/secrets is not created; Caddy starts but ACME
#     issuance fails until the file is present (the `-` prefix tolerates it).
#   secrets.tailscaleOauthKey — Tailscale OAuth client secret (tag:o11y). When
#     empty the tsnet listener starts but the node cannot join the tailnet.
#     tsnet state lives at /var/lib/caddy — a rebuild wipes it, but the OAuth
#     key re-registers the node on the next start (use a non-ephemeral key).
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, secrets ? { }, ... }:

let
  cloudflareToken = secrets.cloudflareToken or "";
  tailscaleOauthKey = secrets.tailscaleOauthKey or "";
in
{
  services.caddy = {
    enable = true;

    # Caddy with the Cloudflare DNS plugin (ACME DNS-01) and caddy-tailscale
    # (tsnet — embedded Tailscale node; no kernel TUN or tailscaled needed).
    # Refresh the hash when bumping either plugin version:
    #   nix run nixpkgs#caddy.withPlugins -- <same-args> 2>&1 | grep hash
    package = pkgs.caddy.withPlugins {
      plugins = [
        "github.com/caddy-dns/cloudflare@v0.2.4"
        "github.com/tailscale/caddy-tailscale@v0.0.0-20260106222316-bb080c4414ac" # main branch as of 2026-06-04; no tagged releases yet
      ];
      hash = "sha256-ufqG0y0mTInZRJZaYHoKeNBPnJtczvq3G24hgAuwk48=";
    };

    configFile = pkgs.writeText "Caddyfile" ''
      {
        # caddy-tailscale: embedded tsnet node (no /dev/net/tun, no tailscaled).
        # TS_AUTHKEY is the Tailscale OAuth client secret for tag:o11y.
        tailscale {
          auth_key {env.TS_AUTHKEY}
          hostname  observability
        }
      }

      # ─── Shared routing snippet ────────────────────────────────────────────
      # Applied identically on the public listener and the tailnet listener.
      # VM/VLogs/VTraces serve at root (prefix stripped); Alertmanager keeps
      # its prefix via --web.route-prefix=/alerts.
      (routes) {
        request_body {
          max_size 256MiB
        }

        header {
          Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
          X-Content-Type-Options "nosniff"
          Referrer-Policy "no-referrer"
          -Server
        }

        handle_path /metrics/* {
          reverse_proxy localhost:8428 {
            flush_interval -1
          }
        }

        handle_path /logs/* {
          reverse_proxy localhost:9428 {
            flush_interval -1
          }
        }

        handle_path /traces/* {
          reverse_proxy localhost:10428 {
            flush_interval -1
          }
        }

        handle /alerts/* {
          reverse_proxy localhost:9093
        }

        handle {
          respond "Not found" 404
        }
      }

      # ─── HTTP → HTTPS redirect ─────────────────────────────────────────────
      http://o11y.chezmoi.sh {
        redir https://{host}{uri} permanent
      }

      # ─── HTTPS — public hostname, Cloudflare DNS-01 TLS ───────────────────
      https://o11y.chezmoi.sh {
        import routes
        tls {
          dns cloudflare {env.CLOUDFLARE_API_TOKEN}
        }
      }

      # ─── HTTPS — Tailscale virtual listener (tsnet) ────────────────────────
      # Reachable at observability.<tailnet>.ts.net from tailnet members.
      # TLS is issued automatically by Tailscale's ACME for *.ts.net — no
      # Cloudflare token needed on this path.
      https:// {
        bind tailscale/
        tls {
          get_certificate tailscale
        }
        import routes
      }
    '';
  };

  # Secrets file: Cloudflare DNS-01 token + Tailscale OAuth key (TS_AUTHKEY).
  # Created only when at least one value is non-empty. The `-` prefix on
  # EnvironmentFile keeps Caddy startable on a pure build (no secrets).
  environment.etc."caddy/secrets" = lib.mkIf (cloudflareToken != "" || tailscaleOauthKey != "") {
    text = lib.concatStringsSep "\n"
      (
        lib.optional (cloudflareToken != "") "CLOUDFLARE_API_TOKEN=${cloudflareToken}"
          ++ lib.optional (tailscaleOauthKey != "") "TS_AUTHKEY=${tailscaleOauthKey}"
      ) + "\n";
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
