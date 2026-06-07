# ─────────────────────────────────────────────────────────────────────────────
# VictoriaLogs — central log store
# ─────────────────────────────────────────────────────────────────────────────
# Receives processed logs from the local Vector pipeline (loopback :9428 only).
# Vector owns all ingest: syslog TCP :5140, OTLP HTTP :4318, Vector native :6000.
# VictoriaLogs serves HTTP for both ingest (Vector → ES-compatible API) and
# query (Caddy → /logs/* → :9428).
#
# Access control: Caddy (path routing, no auth) is the sole public surface;
# the Proxmox host firewall restricts by source CIDR. No syslog listener here —
# Vector handles protocol conversion and SemConv validation before forwarding.
#
# NOTE: `pkgs.victorialogs` must exist on the pinned nixpkgs. If the channel
# only ships the binary under a different attribute, adjust the ExecStart path
# (see README "Known gaps / follow-ups").
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, ... }:

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
        "-retentionPeriod=30d" # homelab baseline; raise per disk budget
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
    };
  };
}
