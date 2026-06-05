# ─────────────────────────────────────────────────────────────────────────────
# Log shipper — o11y self-logs into local Vector syslog ingest
# ─────────────────────────────────────────────────────────────────────────────
# rsyslog reads the local journal via imjournal and forwards every record to
# Vector on 127.0.0.1:5140 (loopback). The same recipe runs on every shipping
# LXC (oci-registry, PVE host) — pointing at loopback here keeps the appliance
# observable end-to-end through the same pipeline.
#
# Feedback-loop guard: vector logs are dropped before omfwd. Otherwise every
# Vector log line would be forwarded back to Vector, ingested, re-emitted as
# a stream-write log, and re-forwarded — infinite amplification. Vector logs
# remain viewable locally via `journalctl -u vector`.
#
# Buffering identical to oci-registry: in-memory queue with 50 MiB disk
# overflow under /var/spool/rsyslog. Storage is the LXC's volatile journal
# tmpfs; restart loses queue state but never blocks on Vector.
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, ... }:

{
  services.rsyslogd = {
    enable = true;
    # Override the upstream module's default rules (mail.* → /var/log/mail,
    # *.* → /var/log/messages, …). Local files would catch every imjournal
    # record and grow without bound; journald is volatile (RAM tmpfs) and we
    # don't want to bypass that on disk.
    defaultConfig = "";
    extraConfig = ''
      module(load="imjournal"
             StateFile="imjournal.state"
             Ratelimit.Burst="50000"
             Ratelimit.Interval="600")

      # Drop Vector's own logs before forwarding — prevents an ingest feedback
      # loop. Visible locally via `journalctl -u vector`.
      if $programname == "vector" then stop

      *.* action(type="omfwd"
                 target="127.0.0.1"
                 port="5140"
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

  # No explicit After=vector.service: rsyslog already retries omfwd forever
  # (action.resumeRetryCount=-1, 30 s interval) so a few dropped frames at
  # boot are recovered automatically. Adding the dependency under the wrong
  # unit name (services.rsyslogd publishes `syslog.service`, not
  # `rsyslogd.service`) created an empty rsyslogd.service stub — keep it out.
}
