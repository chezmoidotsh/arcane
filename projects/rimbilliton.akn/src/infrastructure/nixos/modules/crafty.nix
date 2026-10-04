# Crafty Controller (Minecraft server manager web UI) as a Podman container.
# Crafty bundles Java; servers (Paper, Fabric, ...) are created from its UI.
# The UI listens on 127.0.0.1:8443 only: it is exposed through oauth2-proxy
# (SSO) + Caddy, see ./sso.nix.
{ config, lib, pkgs, ... }:
let
  # TODO(pin): replace `latest` with a released tag from
  # https://gitlab.com/crafty-controller/crafty-4/container_registry before the first deploy.
  image = "registry.gitlab.com/crafty-controller/crafty-4:latest";
  dataDir = "/var/lib/crafty";
in
{
  virtualisation.podman.enable = true;
  virtualisation.oci-containers.backend = "podman";

  systemd.tmpfiles.rules = map (d: "d ${dataDir}/${d} 0755 root root -") [
    ""
    "backups"
    "logs"
    "servers"
    "config"
    "import"
  ];

  virtualisation.oci-containers.containers.crafty = {
    inherit image;
    environment.TZ = "UTC";
    ports = [
      "127.0.0.1:8443:8443"
      "25565:25565" # first Minecraft Java server created in Crafty
    ];
    volumes = [
      "${dataDir}/backups:/crafty/backups"
      "${dataDir}/logs:/crafty/logs"
      "${dataDir}/servers:/crafty/servers"
      "${dataDir}/config:/crafty/app/config"
      "${dataDir}/import:/crafty/import"
    ];
    # Leave ~1 GB to the OS; set the server's -Xmx to ~4G in the Crafty UI.
    extraOptions = [ "--memory=5g" ];
  };
}
