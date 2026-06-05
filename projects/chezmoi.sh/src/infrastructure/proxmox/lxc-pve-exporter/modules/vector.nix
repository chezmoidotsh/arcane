# ─────────────────────────────────────────────────────────────────────────────
# Vector agent — scrape PVE exporter and push metrics to o11y
# ─────────────────────────────────────────────────────────────────────────────
# Scrapes the PVE exporter on loopback :9221 and pushes via
# prometheus_remote_write to the o11y appliance. Same push model as the
# oci-registry LXC (vmagent → remote_write).
#
# Pipeline:
#   prometheus_scrape (pve exporter) ──┐
#                                      ├── remap (add cluster=pve) ── remote_write → o11y
#   internal_metrics ──────────────────┘
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, pveHost, ... }:

let
  dataDir = "/var/lib/vector";
  remoteWriteUrl = "https://o11y.chezmoi.sh/metrics/api/v1/write";

  config = pkgs.writeText "vector.toml" ''
    [api]
      enabled = false

    [sources.pve_scrape]
      type = "prometheus_scrape"
      endpoints = ["http://127.0.0.1:9221/pve?target=${pveHost}&cluster=1&node=1"]
      scrape_interval_secs = 30
      instance_tag = "instance"

    [sources.internal_metrics]
      type = "internal_metrics"

    [transforms.add_cluster]
      type = "remap"
      inputs = ["pve_scrape", "internal_metrics"]
      source = '''
        .tags.cluster = "pve"
      '''

    [sinks.out_victoriametrics]
      type = "prometheus_remote_write"
      inputs = ["add_cluster"]
      endpoint = "${remoteWriteUrl}"
      healthcheck.enabled = false

      [sinks.out_victoriametrics.buffer]
        type = "memory"
        max_events = 1000
        when_full = "block"
  '';
in
{
  users.users.vector = {
    isSystemUser = true;
    group = "vector";
    home = dataDir;
    createHome = false;
    description = "Vector agent service account";
  };
  users.groups.vector = { };

  systemd.services.vector = {
    description = "Vector — PVE metrics collector";
    documentation = [ "https://vector.dev/" ];
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" "pve-exporter.service" ];
    wants = [ "network-online.target" ];

    serviceConfig = {
      ExecStart = "${pkgs.vector}/bin/vector --config ${config}";
      User = "vector";
      Group = "vector";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";
      StateDirectory = "vector";
      WorkingDirectory = dataDir;

      NoNewPrivileges = true;
      RestrictSUIDSGID = true;
      RestrictRealtime = true;
      LockPersonality = true;
      SystemCallArchitectures = "native";
      LimitNOFILE = 65536;
    };
  };
}
