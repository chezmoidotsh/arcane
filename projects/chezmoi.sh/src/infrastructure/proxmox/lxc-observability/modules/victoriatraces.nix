# ─────────────────────────────────────────────────────────────────────────────
# VictoriaTraces — central distributed-tracing store
# ─────────────────────────────────────────────────────────────────────────────
# Receives traces (OTLP / Jaeger) from cluster pipelines (Vector or an OTEL
# collector) routed through Caddy under /traces/*. Same correlation model as
# metrics/logs: traces carry a `cluster` resource attribute set by the sender.
# Grafana queries it via the Jaeger/VictoriaTraces datasource.
#
# Binds 127.0.0.1:10428 only — Caddy (path routing, no auth) is the sole public
# surface; access control is the Proxmox host firewall by source CIDR + tailnet.
#
# NOTE: `pkgs.victoriatraces` is recent; verify the attribute/binary name on the
# pinned nixpkgs (see README "Known gaps"). If absent, package the upstream
# release binary with autoPatchelfHook (same pattern as the zot LXC).
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, ... }:

let
  listenAddr = "127.0.0.1:10428";
  dataDir = "/var/lib/o11y/traces";
in
{
  systemd.services.victoriatraces = {
    description = "VictoriaTraces — central tracing store";
    documentation = [ "https://docs.victoriametrics.com/victoriatraces/" ];
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];

    serviceConfig = {
      ExecStart = lib.concatStringsSep " " [
        "${pkgs.victoriatraces}/bin/victoria-traces"
        "-storageDataPath=${dataDir}"
        "-httpListenAddr=${listenAddr}"
        "-retentionPeriod=2d" # traces are voluminous; shorter than metrics/logs
        "-loggerFormat=json"
      ];

      User = "o11y";
      Group = "o11y";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";
      StateDirectory = "o11y/traces";
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
