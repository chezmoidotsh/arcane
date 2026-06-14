# ─────────────────────────────────────────────────────────────────────────────
# vmagent — push Zot metrics to the o11y appliance
# ─────────────────────────────────────────────────────────────────────────────
# Scrapes Zot's /metrics on 127.0.0.1:5000 every 30s and remote_writes to
# https://o11y.chezmoi.sh/metrics/api/v1/write (Caddy strips /metrics and
# forwards to VictoriaMetrics :8428).
#
# Replaces the previous pull model where VictoriaMetrics scraped oci.chezmoi.sh
# directly. Push lets oci-registry stay unreachable from the appliance and
# survives short o11y outages via vmagent's on-disk buffer (-remoteWrite.tmpDataPath).
#
# Trade-off: we lose the implicit external-path validation that the pull job
# provided (DNS + TLS + Caddy + Zot). Replace it with a synthetic blackbox probe
# from amiya if/when end-to-end TLS health monitoring becomes important.
#
# external_labels.cluster=oci-registry — every series carries the source
# cluster label, consistent with how other vmagents tag their data (see ADR-013).
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, ... }:

let
  remoteWriteUrl = "https://o11y.chezmoi.sh/metrics/api/v1/write";
  dataDir = "/var/lib/vmagent";

  scrapeConfig = pkgs.writeText "vmagent-scrape.yml" ''
    global:
      scrape_interval: 30s
      external_labels:
        cluster: oci-registry
    scrape_configs:
      - job_name: zot
        static_configs: [{ targets: ["127.0.0.1:5000"] }]
  '';
in
{
  users.users.vmagent = {
    isSystemUser = true;
    group = "vmagent";
    home = dataDir;
    createHome = false; # StateDirectory owns the lifecycle
    description = "vmagent service account";
  };
  users.groups.vmagent = { };

  systemd.services.vmagent = {
    description = "vmagent — scrape Zot and remote_write to o11y";
    documentation = [ "https://docs.victoriametrics.com/vmagent/" ];
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" "zot.service" ];
    wants = [ "network-online.target" ];

    serviceConfig = {
      ExecStart = pkgs.lib.concatStringsSep " " [
        "${pkgs.victoriametrics}/bin/vmagent"
        "-promscrape.config=${scrapeConfig}"
        "-remoteWrite.url=${remoteWriteUrl}"
        "-remoteWrite.tmpDataPath=${dataDir}/queue"
        "-remoteWrite.maxDiskUsagePerURL=200MB"
        "-httpListenAddr=127.0.0.1:8429"
        "-loggerFormat=json"
      ];

      User = "vmagent";
      Group = "vmagent";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";
      StateDirectory = "vmagent";
      WorkingDirectory = dataDir;

      # ── systemd hardening (LXC-safe subset) ──────────────────────────────
      NoNewPrivileges = true;
      RestrictSUIDSGID = true;
      RestrictRealtime = true;
      LockPersonality = true;
      SystemCallArchitectures = "native";
      LimitNOFILE = 65536;
    };
  };
}
