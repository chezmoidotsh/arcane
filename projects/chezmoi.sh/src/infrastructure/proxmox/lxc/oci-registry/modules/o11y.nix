# Observability agent for the OCI registry LXC.
# Ships systemd logs to o11y via Vector native protocol, and scrapes Zot
# metrics for remote_write. hostsOverride resolves o11y.chezmoi.sh to the
# Proxmox bridge IP (10.0.0.252) — same trick used by the previous vmagent.
{ ... }: {
  catalog.lxcAgent = {
    enable = true;

    o11y = {
      logsAddress = "o11y.chezmoi.sh:6000";
      metricsUrl = "https://o11y.chezmoi.sh/metrics/api/v1/write";
    };

    metrics = {
      enable = true;
      scrapeTargets = [
        { jobName = "zot"; targets = [ "127.0.0.1:5000" ]; }
      ];
    };

    nodeExporter.enable = true;

    logs.extraTransforms = [
      { name = "transforms.route.yaml"; content = builtins.readFile ./o11y.extraTransforms/transforms.route.yaml; }
      { name = "transforms.zot.yaml"; content = builtins.readFile ./o11y.extraTransforms/transforms.zot.yaml; }
    ];

    hostsOverride = {
      "10.0.0.252" = [ "o11y.chezmoi.sh" ];
    };
  };
}
