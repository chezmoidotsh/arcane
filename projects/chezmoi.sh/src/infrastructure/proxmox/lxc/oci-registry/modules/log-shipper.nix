# ─────────────────────────────────────────────────────────────────────────────
# Log shipper — journald → o11y Vector syslog ingest
# ─────────────────────────────────────────────────────────────────────────────
# rsyslog reads the local journal via imjournal and forwards every record to
# the o11y appliance on TCP/5140 (Vector's syslog source). Same recipe as the
# PVE host's rsyslog omfwd → o11y, so a single Vector pipeline ingests host,
# PVE, and LXC logs.
#
# Format: RFC 5424 (RSYSLOG_SyslogProtocol23Format) — what Vector's syslog
# source expects. Plaintext over the Proxmox bridge network; the appliance is
# reachable only inside the bridge and protected by the PVE host firewall.
#
# Network: o11y.chezmoi.sh resolves publicly to the home WAN IP. We override
# it to the bridge IP (10.0.0.252) so the LXC reaches o11y across the bridge
# directly — same trick PVE itself uses (cf. /etc/hosts on the host).
# vmagent.nix reuses the same hostname for TLS SNI when pushing metrics.
#
# Buffering: in-memory queue with disk overflow under /var/spool/rsyslog
# (volatile tmpfs is fine — journald itself is volatile here, see hardening.nix).
# action.resumeRetryCount=-1 retries forever on o11y outage; queue.saveOnShutdown
# is on so we don't lose what's already in the in-memory queue at shutdown.
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, ... }:

let
  target = "o11y.chezmoi.sh";
  port = 5140;
in
{
  services.rsyslogd = {
    enable = true;
    # Override the upstream module's default rules (mail.* → /var/log/mail,
    # *.* → /var/log/messages, …). Local files would catch every imjournal
    # record and fill the 1 GiB root disk; journald itself is volatile here.
    defaultConfig = "";
    # imjournal pulls from the systemd journal; omfwd sends over TCP in RFC5424.
    # Ratelimit guards against journald firehose during boot storms.
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

  # imjournal StateFile is resolved relative to rsyslog's WorkDirectory.
  # /var/spool/rsyslog persists across the unit's lifetime so the cursor and
  # the disk-overflow queue survive restarts.
  systemd.tmpfiles.rules = [
    "d /var/spool/rsyslog 0700 root root - -"
  ];

  # Bridge-local override for o11y.chezmoi.sh. See header.
  networking.hosts."10.0.0.252" = [ "o11y.chezmoi.sh" ];
}
