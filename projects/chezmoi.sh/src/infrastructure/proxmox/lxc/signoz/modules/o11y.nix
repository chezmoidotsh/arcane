# Observability agent for the SigNoz LXC.
# SigNoz watches the other workloads; this agent only ships the LXC's own
# systemd logs and node metrics to the Victoria stack (data.o11y.chezmoi.sh),
# so SigNoz itself is not monitored by itself.
{ ... }: {
  catalog.lxcAgent = {
    enable = true;

    o11y = {
      logsAddress = "data.o11y.chezmoi.sh:6000";
      metricsUrl = "https://data.o11y.chezmoi.sh/metrics/api/v1/write";
    };

    # Node metrics only: no application scrape target on this LXC.
    metrics.enable = true;
    nodeExporter.enable = true;

    hostsOverride = {
      "10.0.0.22" = [ "data.o11y.chezmoi.sh" ];
    };
  };
}
