# ─────────────────────────────────────────────────────────────────────────────
# prometheus-pve-exporter — scrape PVE API and expose Prometheus metrics
# ─────────────────────────────────────────────────────────────────────────────
# Queries the Proxmox VE API using an API token (no agent on the PVE host).
# Exposes metrics at 127.0.0.1:9221. Vector scrapes the /pve endpoint with
# ?target=<host>&cluster=1&node=1 and pushes via remote_write to the o11y
# appliance.
#
# Neither prometheus-pve-exporter nor proxmoxer are in nixpkgs, so both are
# packaged inline from PyPI sdists.
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, pveHost, pveTokenValue, ... }:

let
  pythonPkgs = pkgs.python312.pkgs;

  proxmoxer = pythonPkgs.buildPythonPackage rec {
    pname = "proxmoxer";
    version = "2.3.0";
    src = pkgs.fetchPypi {
      inherit pname version;
      hash = "sha256-CwsgZxh68fxtQlekasaMj9ecwl0oE2N82uepqY+/0R8=";
    };
    propagatedBuildInputs = [ pythonPkgs.requests ];
    doCheck = false;
  };

  pveExporter = pythonPkgs.buildPythonPackage rec {
    pname = "prometheus-pve-exporter";
    version = "3.9.0";
    src = pkgs.fetchPypi {
      inherit pname version;
      hash = "sha256-ctK2lf7GflF1T2evlwZBZ0xjkNbOHfKMTkaqzxb7TMg=";
    };
    propagatedBuildInputs = [
      pythonPkgs.prometheus-client
      proxmoxer
      pythonPkgs.requests
    ];
    doCheck = false;
  };

  pythonEnv = pkgs.python312.withPackages (ps: [ pveExporter ]);
in
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
        "${pythonEnv}/bin/pve_exporter"
        "--address=127.0.0.1"
        "--port=9221"
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
