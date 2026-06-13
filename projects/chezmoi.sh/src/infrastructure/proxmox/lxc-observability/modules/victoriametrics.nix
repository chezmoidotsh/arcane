# ─────────────────────────────────────────────────────────────────────────────
# VictoriaMetrics — single-node metrics TSDB
# ─────────────────────────────────────────────────────────────────────────────
# The central metrics store. Receives remote_write from every cluster's agent
# and from every LXC's catalog.lxcAgent (Vector prometheus_remote_write).
# Every series carries a `cluster` external label injected by the sender;
# one flat store keeps cross-cluster correlation trivial. See ADR-013.
#
# Self-scrape is handled by catalog.lxcAgent (modules/o11y.nix) — it scrapes
# all local services and remote_writes here with cluster=o11y-appliance.
#
# Binds 127.0.0.1:8428 only — Caddy (path routing, no auth) is the sole public
# surface; access control is the Proxmox host firewall by source CIDR.
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, ... }:

let
  listenAddr = "127.0.0.1:8428";
  dataDir = "/var/lib/o11y/metrics";
in
{
  systemd.services.victoriametrics = {
    description = "VictoriaMetrics — single-node metrics TSDB";
    documentation = [ "https://docs.victoriametrics.com/" ];
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];

    serviceConfig = {
      ExecStart = lib.concatStringsSep " " [
        "${pkgs.victoriametrics}/bin/victoria-metrics"
        "-storageDataPath=${dataDir}"
        "-httpListenAddr=${listenAddr}"
        "-retentionPeriod=18" # months — homelab baseline; raise per disk budget
        "-memory.allowedPercent=60"
        "-loggerFormat=json"
      ];

      User = "o11y";
      Group = "o11y";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";
      StateDirectory = "o11y/metrics";
      WorkingDirectory = dataDir;

      # ── systemd hardening (LXC-safe subset) ──────────────────────────────
      # Mount-namespace options (PrivateTmp, ProtectSystem, …) are omitted —
      # they fail with "step NAMESPACE … Permission denied" in an unprivileged
      # LXC. Compensated by PVE + NixOS firewalls and loopback-only binding.
      NoNewPrivileges = true;
      RestrictSUIDSGID = true;
      RestrictRealtime = true;
      LockPersonality = true;
      SystemCallArchitectures = "native";
      LimitNOFILE = 65536;
    };
  };
}
