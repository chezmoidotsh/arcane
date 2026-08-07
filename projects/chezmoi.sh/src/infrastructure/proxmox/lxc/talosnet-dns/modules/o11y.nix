# ─────────────────────────────────────────────────────────────────────────────
# observability agent — ships journald logs and node metrics to o11y
# ─────────────────────────────────────────────────────────────────────────────
# hostsOverride pins data.o11y.chezmoi.sh to its talosnet IP as a static
# /etc/hosts entry, so log/metric shipping doesn't depend on BIND already being
# up and serving its own zone (this LXC is its own DNS server, so that
# dependency would otherwise be self-referential at boot).
{ ... }: {
  catalog.lxcAgent = {
    enable = true;

    o11y = {
      logsAddress = "data.o11y.chezmoi.sh:6000";
      metricsUrl = "https://data.o11y.chezmoi.sh/metrics/api/v1/write";
    };

    metrics.enable = true;
    nodeExporter.enable = true;

    hostsOverride = {
      "10.128.0.5" = [ "data.o11y.chezmoi.sh" ];
    };
  };
}
