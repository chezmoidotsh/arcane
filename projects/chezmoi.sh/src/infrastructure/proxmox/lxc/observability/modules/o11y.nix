# Self-observability: ship o11y's own journal logs and scrape all local services.
# Uses catalog.lxcAgent with logsAddress pointing to the local in_vector listener
# (127.0.0.1:6000) and metricsUrl pointing to the local VictoriaMetrics instance.
#
# clusterName = "o11y-appliance" matches the label used by existing vmalert rules
# (previously set by VictoriaMetrics' -promscrape.config external_labels block,
# now removed — lxcAgent is the single scraper for all local services).
#
# The alertmanager target uses a custom path (/alerts/metrics) because AM runs
# with --web.route-prefix=/alerts (see alertmanager.nix). The catalog.lxcAgent
# module recognises the slash and builds http://127.0.0.1:9093/alerts/metrics
# without appending /metrics.
{ ... }: {
  catalog.lxcAgent = {
    enable = true;
    o11y = {
      logsAddress = "127.0.0.1:6000";
      metricsUrl = "http://127.0.0.1:8428/api/v1/write";
    };

    metrics = {
      enable = true;
      scrapeTargets = [
        { jobName = "victoriametrics"; targets = [ "127.0.0.1:8428" ]; }
        { jobName = "victorialogs"; targets = [ "127.0.0.1:9428" ]; }
        { jobName = "victoriatraces"; targets = [ "127.0.0.1:10428" ]; }
        { jobName = "vmalert"; targets = [ "127.0.0.1:8880" ]; }
        { jobName = "alertmanager"; targets = [ "127.0.0.1:9093/alerts/metrics" ]; }
      ];
    };

    logs.extraTransforms = [
      { name = "transforms.route.yaml"; content = builtins.readFile ./o11y.extraTransforms/transforms.route.yaml; }
      { name = "transforms.victoria.yaml"; content = builtins.readFile ./o11y.extraTransforms/transforms.victoria.yaml; }
      { name = "transforms.alertmanager.yaml"; content = builtins.readFile ./o11y.extraTransforms/transforms.alertmanager.yaml; }
      { name = "transforms.caddy.yaml"; content = builtins.readFile ./o11y.extraTransforms/transforms.caddy.yaml; }
    ];
  };
}
