# Observability agent for the OCI registry LXC: journald logs, Zot and node
# metrics, shipped as OTLP to data.o11y.chezmoi.sh. hostsOverride resolves the
# appliance to its Proxmox bridge IP (10.0.0.22) to avoid hairpin NAT.
{ ... }: {
  catalog.o11yAgent = {
    enable = true;
    o11y.endpoint = "https://data.o11y.chezmoi.sh:4318";
    logs.parsers = [ "caddy" "zot" ];

    metrics = {
      enable = true;
      scrapeTargets = [
        { jobName = "zot"; targets = [ "127.0.0.1:5000" ]; }
      ];
    };

    hostsOverride = {
      "10.0.0.22" = [ "data.o11y.chezmoi.sh" ];
    };
  };
}
