# ─────────────────────────────────────────────────────────────────────────────
# observability agent — ships journald logs and node metrics to o11y
# ─────────────────────────────────────────────────────────────────────────────
# hostsOverride pins o11y.chezmoi.sh to its talosnet IP to avoid a
# self-referential bootstrap-ordering dependency (dnsmasq resolving its own
# upstream target).
{ ... }: {
  catalog.lxcAgent = {
    enable = true;

    o11y = {
      logsAddress = "o11y.chezmoi.sh:6000";
      metricsUrl = "https://o11y.chezmoi.sh/metrics/api/v1/write";
    };

    metrics.enable = true;
    nodeExporter.enable = true;

    hostsOverride = {
      "10.128.0.5" = [ "o11y.chezmoi.sh" ];
    };
  };
}
