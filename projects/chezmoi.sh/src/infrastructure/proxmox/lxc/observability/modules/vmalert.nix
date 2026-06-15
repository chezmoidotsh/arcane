# ─────────────────────────────────────────────────────────────────────────────
# vmalert — EXISTENTIAL rule evaluation only
# ─────────────────────────────────────────────────────────────────────────────
# Scope (ADR-013): this evaluates ONLY the small, stable set of existential,
# cluster-independent rules in ../alerts/ — cluster-absent, Grafana-down,
# appliance self-monitoring, PVE host/guest/disk, OCI registry, and the Watchdog.
# These must fire even when amiya (or any observed cluster) is down.
#
# Per-cluster alerting AND recording rules (node/disk/PVC/crash-loop, recording
# rules) live as VMRule/PrometheusRule CRDs evaluated by that cluster's OWN
# vmalert (VM Operator), notifying the cluster's OWN Alertmanager — NOT this
# central one. Managed as-code per cluster, with no LXC rebuild.
#
# Because this existential rule set is rare-changing, it is baked into the image
# (code-reviewed, GPG-signed) rather than hot-loaded — the "rebuild to add a rule"
# cost that pushed per-cluster rules out to VMRule does not apply here.
#
# vmalert pushes firing alerts to the LOCAL Alertmanager (loopback). Alert state
# is written back to VictoriaMetrics so it survives a restart and is queryable
# from Grafana.
#
# Binds 127.0.0.1:8880 (loopback) — exposed for self-scrape only.
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, ... }:

let
  listenAddr = "127.0.0.1:8880";
  vmUrl = "http://127.0.0.1:8428";
  # Alertmanager runs with --web.route-prefix=/alerts (see alertmanager.nix),
  # so the API lives under that path even over loopback.
  amUrl = "http://127.0.0.1:9093/alerts";
in
{
  # Rule files live in ../alerts and are mounted read-only at /etc/vmalert/rules.
  # Adding a rule = drop a *.yaml file there and rebuild the image.
  environment.etc."vmalert/rules".source = ../alerts;

  systemd.services.vmalert = {
    description = "vmalert — rule evaluation → Alertmanager";
    documentation = [ "https://docs.victoriametrics.com/vmalert/" ];
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" "victoriametrics.service" ];
    wants = [ "network-online.target" ];

    serviceConfig = {
      ExecStart = lib.concatStringsSep " " [
        "${pkgs.victoriametrics}/bin/vmalert"
        "-rule=/etc/vmalert/rules/*.yaml"
        "-datasource.url=${vmUrl}"
        "-remoteWrite.url=${vmUrl}"
        "-remoteRead.url=${vmUrl}"
        "-notifier.url=${amUrl}"
        "-evaluationInterval=30s"
        "-httpListenAddr=${listenAddr}"
        "-loggerFormat=json"
      ];

      User = "o11y";
      Group = "o11y";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";

      NoNewPrivileges = true;
      RestrictSUIDSGID = true;
      RestrictRealtime = true;
      LockPersonality = true;
      MemoryDenyWriteExecute = true;
      SystemCallArchitectures = "native";
    };
  };
}
