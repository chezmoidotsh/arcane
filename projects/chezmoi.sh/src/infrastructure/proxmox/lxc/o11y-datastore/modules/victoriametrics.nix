# oripathy: type=nixpkg pkg=victoriametrics upstream=github.com/VictoriaMetrics/VictoriaMetrics tagPrefix=v
# ─────────────────────────────────────────────────────────────────────────────
# VictoriaMetrics — single-node metrics TSDB
# ─────────────────────────────────────────────────────────────────────────────
# The central metrics store. Ingests OTLP only, via Caddy :4318/v1/metrics →
# /opentelemetry/v1/metrics (OTel resource attributes become labels). Senders
# are every LXC's catalog.o11yAgent (OpenTelemetry Collector), including this
# appliance's own (modules/o11y-agent.nix).
#
# Binds 127.0.0.1:8428 only — Caddy (path routing, no auth) is the sole public
# surface; access control is the Proxmox host firewall by source CIDR.
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, retention, ... }:

let
  listenAddr = "127.0.0.1:8428";
  dataDir = "/persistent/o11y/metrics";
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
        "-retentionPeriod=${retention.metrics}" # set in configuration.nix
        "-memory.allowedBytes=1GiB" # caches; RSS ~500 MiB at 9 GB of data
        "-search.maxMemoryPerQuery=512MiB"
        # OTLP is the only ingest path. Metric names become Prometheus-style
        # (system_cpu_time_seconds_total) but labels keep their OTel dots
        # (service.name, host.name), like the log fields; MetricsQL accepts
        # them unquoted: {service.name="zot"}.
        "-opentelemetry.convertMetricNamesToPrometheus"
        # Scope labels only name the producing receiver: noise.
        "-opentelemetry.promoteScopeMetadata=false"
        "-loggerFormat=json"
      ];

      User = "o11y";
      Group = "o11y";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";
      StateDirectory = lib.mkForce ""; # directory managed by tmpfiles.d (/persistent/o11y/metrics)
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

      # Memory budget of the 8 GiB CT (see README "Memory budget"): a runaway
      # query gets this service OOM-killed and restarted instead of starving
      # the whole CT into thrashing (2026-11-14 freeze).
      MemoryMax = "2560M";
    };
  };
}
