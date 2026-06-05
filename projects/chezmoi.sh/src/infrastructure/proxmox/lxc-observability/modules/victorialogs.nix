# ─────────────────────────────────────────────────────────────────────────────
# VictoriaLogs — central log store
# ─────────────────────────────────────────────────────────────────────────────
# Receives logs from every cluster's Vector pipeline. Logs carry a `cluster`
# stream field set by the sending Vector instance — same correlation model as
# metrics, no hard tenancy.
#
# HTTP binds 127.0.0.1:9428 only — Caddy (path routing, no auth) is the public
# surface; access control is the Proxmox host firewall by source CIDR. Vector
# ships to the Elasticsearch-compatible ingest API under /insert/* (routed by Caddy).
# Syslog TCP listens on :5140 (all interfaces) for PVE host/LXC log forwarding
# via rsyslog omfwd — restricted to the LXC bridge network by the NixOS firewall.
#
# NOTE: `pkgs.victorialogs` must exist on the pinned nixpkgs. If the channel
# only ships the binary under a different attribute, adjust the ExecStart path
# (see README "Known gaps / follow-ups").
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, ... }:

let
  listenAddr = "127.0.0.1:9428";
  syslogTcpAddr = ":5140"; # reachable from PVE hosts on the LXC bridge network
  dataDir = "/var/lib/victoria/logs";
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
        "-syslog.listenAddr.tcp=${syslogTcpAddr}"
        "-retentionPeriod=30d" # homelab baseline; raise per disk budget
        "-loggerFormat=json"
      ];

      User = "victoria";
      Group = "victoria";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";
      StateDirectory = "victoria/logs";
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
