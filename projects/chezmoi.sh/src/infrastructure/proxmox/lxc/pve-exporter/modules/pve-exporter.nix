# ─────────────────────────────────────────────────────────────────────────────
# prometheus-pve-exporter — scrape PVE API and expose Prometheus metrics
# ─────────────────────────────────────────────────────────────────────────────
# Queries the Proxmox VE API using an API token (no agent on the PVE host).
# Exposes metrics at 127.0.0.1:9221. Vector scrapes the /pve endpoint with
# ?target=<host>&cluster=1&node=1 and pushes via remote_write to the o11y
# appliance.
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, pveHost, pveTokenValue, ... }:

{
  environment.etc."pve-exporter/secrets".text = ''
    PVE_TOKEN_VALUE=${pveTokenValue}
  '';

  systemd.services.pve-exporter = {
    description = "Prometheus PVE Exporter";
    documentation = [ "https://github.com/prometheus-pve/prometheus-pve-exporter" ];
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];

    serviceConfig = {
      ExecStart = lib.concatStringsSep " " [
        "${pkgs.prometheus-pve-exporter}/bin/pve_exporter"
        "--web.listen-address=127.0.0.1:9221"
      ];

      EnvironmentFile = "/etc/pve-exporter/secrets";
      Environment = [
        "PVE_SERVER=${pveHost}"
        "PVE_USER=prometheus@pve"
        "PVE_TOKEN_NAME=exporter"
      ];

      User = "pve-exporter";
      Group = "pve-exporter";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";

      NoNewPrivileges = true;
      RestrictSUIDSGID = true;
      RestrictRealtime = true;
      LockPersonality = true;
      SystemCallArchitectures = "native";
      LimitNOFILE = 65536;
    };
  };

  users.users.pve-exporter = {
    isSystemUser = true;
    group = "pve-exporter";
    description = "PVE exporter service account";
  };
  users.groups.pve-exporter = { };
}
