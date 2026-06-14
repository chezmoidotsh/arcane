# Observability agent for the Omni LXC.
# Ships the systemd journal (Omni + Dex units) to o11y via catalog.lxcAgent
# over the Vector native protocol. Zap JSON logs are parsed in-agent by the
# extraTransform before shipping:
#   - common Zap fields (ts, level, msg, caller) → OTLP SemConv
#   - gRPC call logs → rpc.*, network.*, enduser.* attrs (SIEM-ready)
#   - reconcile logs → omni.controller / omni.resource.* attrs
#   - remaining fields → attributes."omni.json" blob
# See o11y.extraTransforms/README.md for available fields and query examples.
#
# Metrics: Omni exposes Prometheus metrics on 127.0.0.1:2122 (services.metrics,
# --metrics-bind-addr). Vector scrapes that endpoint and ships to VictoriaMetrics.
#
# hostsOverride resolves o11y.chezmoi.sh to the Proxmox bridge IP (10.0.0.252)
# — same trick used by the other proxmox/lxc appliances to avoid hairpin NAT.
{ ... }: {
  catalog.lxcAgent = {
    enable = true;

    o11y = {
      logsAddress = "o11y.chezmoi.sh:6000";
      metricsUrl = "https://o11y.chezmoi.sh/metrics/api/v1/write";
    };

    logs.extraTransforms = [
      { name = "transforms.route.yaml"; content = builtins.readFile ./o11y.extraTransforms/transforms.route.yaml; }
      { name = "transforms.omni.yaml"; content = builtins.readFile ./o11y.extraTransforms/transforms.omni.yaml; }
    ];

    metrics = {
      enable = true;
      scrapeTargets = [
        { jobName = "omni"; targets = [ "127.0.0.1:2122" ]; }
      ];
    };

    hostsOverride = {
      "10.0.0.252" = [ "o11y.chezmoi.sh" ];
    };
  };
}
