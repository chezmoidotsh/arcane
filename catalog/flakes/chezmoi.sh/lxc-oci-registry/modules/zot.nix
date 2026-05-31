{ config, lib, pkgs, ... }:

let
  cfg = config.services.lxc-oci-registry.zot;
  settingsFormat = pkgs.formats.json { };

  baseSettings = {
    storage = {
      rootDirectory = cfg.storageDir;
      commit = true;
      dedupe = true;
      gc = true;
    };
    http = {
      address = "127.0.0.1";
      port = "5000";
    };
    log.level = "info";
  };

  mergedSettings = lib.recursiveUpdate baseSettings cfg.settings;
  configFile = settingsFormat.generate "zot-config.json" mergedSettings;
in
{
  options.services.lxc-oci-registry.zot = {
    package = lib.mkOption {
      type = lib.types.package;
      description = "Zot binary package to use.";
    };

    storageDir = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/zot";
      description = "Root directory for Zot image storage.";
    };

    settings = lib.mkOption {
      type = lib.types.attrs;
      default = { };
      description = ''
        Extra Zot configuration merged (recursively) over the base defaults.
        The base defaults set http.address=127.0.0.1, http.port=5000, and
        storage.rootDirectory. Override or extend any key here.
      '';
      example = lib.literalExpression ''
        {
          extensions.sync.enable = true;
          extensions.sync.registries = [ ... ];
        }
      '';
    };
  };

  config = {
    users.users.zot = {
      isSystemUser = true;
      group = "zot";
      home = cfg.storageDir;
      createHome = true;
      description = "Zot OCI registry service user";
    };
    users.groups.zot = { };

    systemd.services.zot = {
      description = "Zot OCI registry";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];

      serviceConfig = {
        ExecStart = "${cfg.package}/bin/zot serve ${configFile}";
        User = "zot";
        Group = "zot";
        Restart = "always";
        RestartSec = "5s";
        StateDirectory = "zot";
        StateDirectoryMode = "0750";

        # Hardening
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ReadWritePaths = [ cfg.storageDir ];
      };
    };
  };
}
