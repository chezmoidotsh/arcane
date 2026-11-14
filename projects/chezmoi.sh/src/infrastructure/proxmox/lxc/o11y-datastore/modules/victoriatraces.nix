# oripathy: type=nixpkg pkg=victoriatraces upstream=github.com/VictoriaMetrics/VictoriaTraces tagPrefix=v
# ─────────────────────────────────────────────────────────────────────────────
# VictoriaTraces — central distributed-tracing store
# ─────────────────────────────────────────────────────────────────────────────
# Ingests OTLP only, via Caddy :4318/v1/traces → /insert/opentelemetry/v1/traces.
# Grafana queries it via the Jaeger API under Caddy :443 /traces/select/*.
#
# Binds 127.0.0.1:10428 only — Caddy (path routing, no auth) is the sole public
# surface; access control is the Proxmox host firewall by source CIDR + tailnet.
#
# NOTE: `pkgs.victoriatraces` is recent; verify the attribute/binary name on the
# pinned nixpkgs (see README "Known gaps"). If absent, package the upstream
# release binary with autoPatchelfHook (same pattern as the zot LXC).
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, retention, ... }:

let
  listenAddr = "127.0.0.1:10428";
  dataDir = "/persistent/o11y/traces";
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
        "-retentionPeriod=${retention.traces}" # set in configuration.nix
        "-memory.allowedBytes=256MiB"
        "-loggerFormat=json"
      ];

      User = "o11y";
      Group = "o11y";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";
      StateDirectory = lib.mkForce ""; # directory managed by tmpfiles.d (/persistent/o11y/traces)
      WorkingDirectory = dataDir;

      NoNewPrivileges = true;
      RestrictSUIDSGID = true;
      RestrictRealtime = true;
      LockPersonality = true;
      SystemCallArchitectures = "native";
      LimitNOFILE = 65536;

      # Memory budget of the 8 GiB CT (see README "Memory budget"): a runaway
      # query gets this service OOM-killed and restarted instead of starving
      # the whole CT into thrashing (2026-11-14 freeze).
      MemoryMax = "512M";
    };
  };
}
