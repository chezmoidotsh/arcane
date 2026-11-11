# Observability agent for the PVE host: journald logs, PVE-host syslog and
# PVE-host node metrics, shipped as OTLP to data.o11y.chezmoi.sh. (The PVE API
# metrics come from the PVE OpenTelemetry metric server, not from here.)
#
# Syslog: the PVE host forwards RFC 5424 syslog here over TCP :5140 (rsyslog
# omfwd); the agent's syslog receiver parses it (appname → service.name,
# hostname → host.name). :5140 is opened in hardening.nix.
#
# node_exporter_pve scrapes the PVE host itself: `host_name` attributes those
# series to pve-01 (same host.name as its syslog) instead of this LXC.
#
# hostsOverride resolves the appliance to its Proxmox bridge IP (10.0.0.22).
{ ... }: {
  catalog.o11yAgent = {
    enable = true;
    o11y.endpoint = "https://data.o11y.chezmoi.sh:4318";

    logs.syslog.enable = true;

    metrics = {
      enable = true;
      scrapeTargets = [
        {
          jobName = "node_exporter_pve";
          targets = [ "10.0.0.11:9100" ];
          extraLabels = { host_name = "pve-01"; };
        }
      ];
    };

    hostsOverride = {
      "10.0.0.22" = [ "data.o11y.chezmoi.sh" ];
    };
  };
}
