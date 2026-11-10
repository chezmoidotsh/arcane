# Self-observability: the appliance runs the same catalog.o11yAgent as every
# other LXC and ships its own journal + component metrics through its own OTLP
# endpoint. data.o11y.chezmoi.sh is pinned to loopback so the TLS certificate
# still matches.
#
# Scraped (Prometheus) because none of these can push OTLP metrics: the
# Victoria components, Alertmanager (custom /alerts/metrics path, see
# alertmanager.nix) and Caddy (admin endpoint :2019).
{ ... }: {
  catalog.o11yAgent = {
    enable = true;
    o11y.endpoint = "https://data.o11y.chezmoi.sh:4318";

    logs.parsers = [ "caddy" ];

    metrics = {
      enable = true;
      scrapeTargets = [
        { jobName = "victoriametrics"; targets = [ "127.0.0.1:8428" ]; }
        { jobName = "victorialogs"; targets = [ "127.0.0.1:9428" ]; }
        { jobName = "victoriatraces"; targets = [ "127.0.0.1:10428" ]; }
        { jobName = "vmalert"; targets = [ "127.0.0.1:8880" ]; }
        { jobName = "alertmanager"; targets = [ "127.0.0.1:9093/alerts/metrics" ]; }
        { jobName = "caddy"; targets = [ "127.0.0.1:2019" ]; }
      ];
    };

    hostsOverride = {
      "127.0.0.1" = [ "data.o11y.chezmoi.sh" ];
    };
  };
}
