# Observability agent for the PVE exporter LXC.
# Ships systemd logs, PVE-host syslog, and PVE exporter metrics to o11y via
# catalog.lxcAgent.
#
# The PVE exporter uses a multi-target URL (query params instead of /metrics),
# so the target is passed as a path — catalog.lxcAgent prefixes http:// without
# appending /metrics when the string contains a slash.
#
# Syslog ingest (logs.extraTransforms)
# ────────────────────────────────────
# This LXC owns PVE-host/LXC syslog ingest (the o11y appliance no longer listens
# on :5140). The PVE host forwards RFC 5424 syslog here via rsyslog omfwd; the
# in_syslog source + syslog_to_o11y transform parse it into the OTLP-style format
# and the catalog out_logs sink ships it to o11y over the Vector native protocol.
#
# Because logs.extraTransforms is non-empty, catalog.lxcAgent omits its automatic
# journald passthrough — transforms.journald.yaml restores it explicitly so the
# journal still reaches o11y alongside syslog. Both fragments expose a *_to_o11y
# component consumed by the out_logs sink.
#
# hostsOverride resolves o11y.chezmoi.sh to the Proxmox bridge IP (10.0.0.252).
{ pveHost, ... }: {
  catalog.lxcAgent = {
    enable = true;

    o11y = {
      logsAddress = "o11y.chezmoi.sh:6000";
      metricsUrl = "https://o11y.chezmoi.sh/metrics/api/v1/write";
    };

    logs.extraTransforms = [
      {
        name = "sources.syslog.yaml";
        content = builtins.readFile ./o11y.extraTransforms/sources.syslog.yaml;
      }
      {
        name = "transforms.journald.yaml";
        content = builtins.readFile ./o11y.extraTransforms/transforms.journald.yaml;
      }
    ];

    metrics = {
      enable = true;
      scrapeTargets = [
        {
          jobName = "pve_exporter";
          targets = [ "127.0.0.1:9221/pve?target=${pveHost}&cluster=1&node=1" ];
        }
      ];
    };

    nodeExporter.enable = true;

    hostsOverride = {
      "10.0.0.252" = [ "o11y.chezmoi.sh" ];
    };
  };
}
