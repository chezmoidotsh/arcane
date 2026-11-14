# oripathy: type=nixpkg pkg=victorialogs upstream=github.com/VictoriaMetrics/VictoriaLogs tagPrefix=v
# ─────────────────────────────────────────────────────────────────────────────
# VictoriaLogs — central log store
# ─────────────────────────────────────────────────────────────────────────────
# Ingests OTLP only, via the OTLP gateway → /insert/opentelemetry/v1/logs
# (the gateway pins VL-Stream-Fields, see etc.otlp-gateway/config.yaml).
# Queries come through Caddy :443 /logs/select/*. Binds loopback :9428 only.
#
# NOTE: `pkgs.victorialogs` must exist on the pinned nixpkgs. If the channel
# only ships the binary under a different attribute, adjust the ExecStart path
# (see README "Known gaps / follow-ups").
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, retention, ... }:

let
  listenAddr = "127.0.0.1:9428";
  dataDir = "/persistent/o11y/logs";
in
{
  systemd.services.victorialogs = {
    description = "VictoriaLogs — central log store";
    documentation = [ "https://docs.victoriametrics.com/victorialogs/" ];
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];

    serviceConfig = {
      ExecStart = lib.concatStringsSep " " [
        "${pkgs.victorialogs}/bin/victoria-logs"
        "-storageDataPath=${dataDir}"
        "-httpListenAddr=${listenAddr}"
        "-retentionPeriod=${retention.logs}" # set in configuration.nix
        "-memory.allowedBytes=1GiB" # caches; query buffers come on top
        # A single regex stats query over 4h took VL from 550 MiB to 1.2 GiB
        # in 30s; cap parallelism so a few of them cannot stack up.
        "-search.maxConcurrentRequests=4"
        "-search.maxQueryDuration=30s" # explicit: the default, relied upon
        "-loggerFormat=json"
      ];

      User = "o11y";
      Group = "o11y";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";
      StateDirectory = lib.mkForce ""; # directory managed by tmpfiles.d (/persistent/o11y/logs)
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
      MemoryMax = "3G";
    };
  };
}
