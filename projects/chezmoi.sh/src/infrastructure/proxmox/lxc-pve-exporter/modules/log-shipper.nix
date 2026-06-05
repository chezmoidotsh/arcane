# ─────────────────────────────────────────────────────────────────────────────
# Log shipper — journald → o11y Vector syslog ingest
# ─────────────────────────────────────────────────────────────────────────────
# Identical to the oci-registry LXC log-shipper: rsyslog reads the local
# journal and forwards every record to o11y on TCP/5140.
#
# o11y.chezmoi.sh is overridden to the bridge IP (10.0.0.252) so the LXC
# reaches o11y across the bridge directly.
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, ... }:

let
  target = "o11y.chezmoi.sh";
  port = 5140;
in
{
  services.rsyslogd = {
    enable = true;
    defaultConfig = "";
    extraConfig = ''
      module(load="imjournal"
             StateFile="imjournal.state"
             Ratelimit.Burst="50000"
             Ratelimit.Interval="600")

      *.* action(type="omfwd"
                 target="${target}"
                 port="${toString port}"
                 protocol="tcp"
                 template="RSYSLOG_SyslogProtocol23Format"
                 queue.type="LinkedList"
                 queue.size="10000"
                 queue.filename="omfwd_o11y"
                 queue.maxDiskSpace="50m"
                 queue.saveOnShutdown="on"
                 action.resumeRetryCount="-1"
                 action.resumeInterval="30")
    '';
  };

  systemd.tmpfiles.rules = [
    "d /var/spool/rsyslog 0700 root root - -"
  ];

  networking.hosts."10.0.0.252" = [ "o11y.chezmoi.sh" ];
}
