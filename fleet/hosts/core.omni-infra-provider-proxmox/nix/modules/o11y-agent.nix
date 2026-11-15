# Observability agent for the Omni Proxmox infrastructure provider LXC: journald
# logs (zap JSON parsed by the omni parser) and node metrics, shipped as OTLP to data.o11y.chezmoi.sh.
# hostsOverride resolves the appliance to its Proxmox bridge IP (10.0.0.22) to
# avoid hairpin NAT.
{ ... }: {
  catalog.o11yAgent = {
    enable = true;
    o11y.endpoint = "https://data.o11y.chezmoi.sh:4318";

    logs.parsers = [ "omni" ];
    metrics.enable = true;
    hostsOverride = {
      "10.0.0.22" = [ "data.o11y.chezmoi.sh" ];
    };
  };
}
