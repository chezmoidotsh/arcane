# ─────────────────────────────────────────────────────────────────────────────
# VictoriaMetrics — single-node metrics TSDB
# ─────────────────────────────────────────────────────────────────────────────
# The central metrics store. Receives remote_write from every cluster's vmagent
# and OTLP metrics from the Proxmox host's OpenTelemetry exporter (native
# /opentelemetry/v1/metrics endpoint), and self-scrapes the local stack so the
# appliance observes itself ("who watches the watchmen").
#
# Single-node by design — multi-tenancy is NOT used. Every series carries a
# `cluster` external label injected by the sender; one flat store keeps
# cross-cluster correlation trivial and the appliance light. See ADR-013.
#
# Binds 127.0.0.1:8428 only — Caddy (path routing, no auth) is the sole public
# surface; access control is the Proxmox host firewall by source CIDR.
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, ... }:

let
  listenAddr = "127.0.0.1:8428";
  dataDir = "/var/lib/victoria/metrics";

  # Self-scrape: the appliance monitors its own components. These targets are
  # all loopback; their `up` series feed the self.rules alerts (see ../alerts).
  scrapeConfig = pkgs.writeText "vm-selfscrape.yml" ''
    global:
      scrape_interval: 15s
      external_labels:
        cluster: o11y-appliance
    scrape_configs:
      - job_name: victoriametrics
        static_configs: [{ targets: ["127.0.0.1:8428"] }]
      - job_name: victorialogs
        static_configs: [{ targets: ["127.0.0.1:9428"] }]
      - job_name: victoriatraces
        static_configs: [{ targets: ["127.0.0.1:10428"] }]
      - job_name: vmalert
        static_configs: [{ targets: ["127.0.0.1:8880"] }]
      - job_name: alertmanager
        # AM runs with --web.route-prefix=/alerts, so /metrics moves too.
        metrics_path: /alerts/metrics
        static_configs: [{ targets: ["127.0.0.1:9093"] }]
  '';
in
{
  environment.etc."victoriametrics/selfscrape.yml".source = scrapeConfig;

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
        "-retentionPeriod=6" # months — homelab baseline; raise per disk budget
        "-promscrape.config=/etc/victoriametrics/selfscrape.yml"
        "-memory.allowedPercent=60"
        "-loggerFormat=json"
      ];

      User = "victoria";
      Group = "victoria";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";
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
