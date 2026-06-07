# Observability agent for the PVE exporter LXC.
# Ships systemd logs and PVE exporter metrics to o11y via catalog.lxcAgent.
#
# The PVE exporter uses a multi-target URL (query params instead of /metrics),
# so the target is passed as a path — catalog.lxcAgent prefixes http:// without
# appending /metrics when the string contains a slash.
#
# hostsOverride resolves o11y.chezmoi.sh to the Proxmox bridge IP (10.0.0.252).
{ pveHost, ... }: {
  catalog.lxcAgent = {
    enable = true;
    clusterName = "pve";

    o11y = {
      logsAddress = "o11y.chezmoi.sh:6000";
      metricsUrl = "https://o11y.chezmoi.sh/metrics/api/v1/write";
    };

    metrics = {
      enable = true;
      scrapeTargets = [
        {
          jobName = "pve_exporter";
          targets = [ "127.0.0.1:9221/pve?target=${pveHost}&cluster=1&node=1" ];
        }
      ];
    };

    hostsOverride = {
      "10.0.0.252" = [ "o11y.chezmoi.sh" ];
    };
  };
}
