# Observability agent for the Omni Proxmox infrastructure provider LXC.
# Ships the systemd journal (omni-infra-provider-proxmox unit) to o11y via
# catalog.lxcAgent over the Vector native protocol. Zap JSON logs are parsed
# in-agent by the extraTransform before shipping:
#   - common Zap fields (ts, level, msg, caller) → OTLP SemConv
#   - remaining fields → attributes."omni-provider.json" blob
# See o11y.extraTransforms/README.md for available fields and query examples.
#
# Metrics scraping is left disabled until a verified Prometheus endpoint is
# identified.
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
      { name = "transforms.omni-provider.yaml"; content = builtins.readFile ./o11y.extraTransforms/transforms.omni-provider.yaml; }
    ];

    hostsOverride = {
      "10.0.0.252" = [ "o11y.chezmoi.sh" ];
    };
  };
}
