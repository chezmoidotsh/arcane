# oripathy: type=nixpkg pkg=caddy upstream=github.com/caddyserver/caddy tagPrefix=v
# ─────────────────────────────────────────────────────────────────────────────
# Caddy reverse proxy — TLS termination + path routing for data.o11y.chezmoi.sh
# ─────────────────────────────────────────────────────────────────────────────
# The single surface of the appliance. o11y.chezmoi.sh itself is Grafana's
# alone (served from Kubernetes, not this LXC). Two ports, each served on two
# listeners (LAN TLS via Cloudflare DNS-01 for data.o11y.chezmoi.sh, and the
# tailnet via caddy-tailscale at o11y-ep.<tailnet>.ts.net):
#
#   :4318  OTLP/HTTP — the ONLY write path (no remote_write): /v1/* goes to
#          the OTLP gateway (otlp-gateway.nix, JSON + protobuf), which feeds
#          VictoriaMetrics / VictoriaLogs / VictoriaTraces.
#   :443   read only + UI:
#            /metrics/*  → VictoriaMetrics query API + vmui (writes refused)
#            /logs/*     → VictoriaLogs /select/* only
#            /traces/*   → VictoriaTraces /select/* only (Jaeger API, vmui)
#            /alerts/*   → Alertmanager UI/API (--web.route-prefix=/alerts)
#            /           → landing page (/etc/caddy/www, from ./fs/etc.caddy/www)
#
# caddy-tailscale embeds a tsnet node in the Caddy process — no kernel TUN
# device, no tailscaled daemon.
#
# Build args:
#   secrets.cloudflareToken   — Cloudflare API token for DNS-01 ACME. When empty
#     (pure build) /etc/caddy/secrets is not created; Caddy starts but ACME
#     issuance fails until the file is present (the `-` prefix tolerates it).
#   secrets.tailscaleOauthKey — Tailscale OAuth client secret (tag:o11y). When
#     empty the tsnet listener starts but the node cannot join the tailnet.
#     tsnet state and TLS certificates live at /persistent/caddy (mp0 —
#     persisted across upgrades, isolated from the rest of the stack data).
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, secrets ? { }, ... }:

let
  cloudflareToken = secrets.cloudflareToken or "";
  tailscaleOauthKey = secrets.tailscaleOauthKey or "";
in
{
  # Landing page, served read-only at / (index.html is the fallback).
  environment.etc."caddy/www".source = ./fs/etc.caddy/www;

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
      hash = "sha256-K8nMnSWuwISv4rS8dDBz4mH91tVt6hq+xUc1t5n01nA=";
    };

    # The whole configuration lives in ./fs/etc.caddy/Caddyfile.
    configFile = ./fs/etc.caddy/Caddyfile;
  };

  # Dedicated uid — host uid 100000 + 997 = 100997 with default Proxmox mapping.
  # Isolated from the shared o11y uid (980) so the upgrade script can chown
  # /persistent/caddy and /persistent/o11y independently.
  users.users.caddy = {
    uid = lib.mkForce 997;
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

  systemd.services.caddy = {
    environment = {
      # caddy uses AppDataDir() = $XDG_DATA_HOME/caddy when set (cert/key storage).
      # Points into /persistent/caddy (mp0) so TLS certs survive image upgrades.
      # Note: caddy-tailscale uses os.UserConfigDir() (not XDG_DATA_HOME) for tsnet
      # state; that path is set explicitly via state_dir in the Caddyfile instead.
      XDG_DATA_HOME = "/persistent/caddy";
    };
    serviceConfig = {
      # nixpkgs' caddy module sets StateDirectory/ReadWritePaths/LogsDirectory to
      # "caddy" (/var/lib/caddy). Since all state is in /persistent/caddy,
      # override them. Without this, systemd's namespace setup fails with ENOENT
      # because /var/lib/caddy does not exist.
      StateDirectory = lib.mkForce "";
      ReadWritePaths = lib.mkForce "/persistent/caddy";
      LogsDirectory = lib.mkForce "";
      WorkingDirectory = lib.mkForce "/persistent/caddy";

      EnvironmentFile = "-/etc/caddy/secrets";

      # Extra hardening on top of what nixpkgs' caddy unit already sets.
      ProtectHome = lib.mkDefault true;
      ProtectKernelLogs = lib.mkDefault true;
      ProtectClock = lib.mkDefault true;
      RestrictSUIDSGID = lib.mkDefault true;
      LockPersonality = lib.mkDefault true;
      LimitNOFILE = 65536;
    };
  };

  # Ensure /persistent/caddy is owned by caddy before the service starts.
  # tmpfiles.d runs as root and succeeds where the service's StateDirectory
  # chown fails (unprivileged LXC can't chown from a non-root service user).
  systemd.tmpfiles.rules = [
    "d /persistent/caddy      0750 caddy caddy - -"
    "d /persistent/caddy/Caddy 0750 caddy caddy - -"
  ];
}
