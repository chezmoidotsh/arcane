# Observability agent for the Omni LXC: journald logs (Omni + Dex units, raw
# messages), Omni metrics (127.0.0.1:2122, --metrics-bind-addr) and node metrics,
# shipped as OTLP to data.o11y.chezmoi.sh. hostsOverride resolves the appliance
# to its Proxmox bridge IP (10.0.0.22) to avoid hairpin NAT.
{ ... }: {
  catalog.o11yAgent = {
    enable = true;
    o11y.endpoint = "https://data.o11y.chezmoi.sh:4318";
    logs.parsers = [ "caddy" "omni" "dex" ];

    metrics = {
      enable = true;
      scrapeTargets = [
        { jobName = "omni"; targets = [ "127.0.0.1:2122" ]; }
      ];
    };

    hostsOverride = {
      "10.0.0.22" = [ "data.o11y.chezmoi.sh" ];
    };
  };
}
