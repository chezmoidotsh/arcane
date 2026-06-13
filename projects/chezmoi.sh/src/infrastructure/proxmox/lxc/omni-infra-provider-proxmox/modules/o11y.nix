# Observability agent for the Omni Proxmox infrastructure provider LXC.
# Ships the systemd journal (omni-infra-provider-proxmox unit) to o11y via
# catalog.lxcAgent over the Vector native protocol.
#
# No log parsing yet — catalog.lxcAgent's automatic journald passthrough
# (journald_to_o11y) ships the raw journal until enough volume accumulates to
# identify the provider's log patterns and a VRL transform can be written under
# o11y.extraTransforms/. Metrics scraping is left disabled until a verified
# Prometheus endpoint is identified.
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

    hostsOverride = {
      "10.0.0.252" = [ "o11y.chezmoi.sh" ];
    };
  };
}
