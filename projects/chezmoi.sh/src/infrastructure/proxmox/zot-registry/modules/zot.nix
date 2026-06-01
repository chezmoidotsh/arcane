# ─────────────────────────────────────────────────────────────────────────────
# Zot OCI registry — systemd service
# ─────────────────────────────────────────────────────────────────────────────
# Runs Zot on 127.0.0.1:5000 (loopback only). Caddy is the sole public
# surface. Configuration is written to /etc/zot/config.json via
# `environment.etc` so it is inspectable from the console without
# entering the unit's network namespace.
#
# Pull-through upstreams live in ../upstreams.nix. Retention policy and
# storage settings are defined below alongside the rest of the config.
#
# Build arg:
#   zotPackage  — Zot binary, forwarded from flake.nix via _module.args.
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, zotPackage, ... }:

let
  upstreams = import ../upstreams.nix { inherit lib; };

  settingsFormat = pkgs.formats.json { };

  settings = {
    distSpecVersion = "1.1.1";

    storage = {
      rootDirectory = "/var/lib/zot";
      commit = true; # fsync after blob writes
      dedupe = true; # cross-repo deduplication via content-addressable links
      gc = true; # background GC of unreferenced blobs

      gcDelay = "1h"; # how long a blob must be unreferenced before GC eligibility
      gcInterval = "24h"; # how often the GC worker runs

      # ── Retention policy ────────────────────────────────────────────────
      # Two tiers:
      #   * ghcr.io/chezmoidotsh/** — first-party images, keep last 3 tags.
      #   * Everything else         — pull-through cache, keep last 5 tags
      #                               pulled within the past 6 months.
      retention = {
        dryRun = false;
        delay = "24h";
        policies = [
          {
            repositories = [ "ghcr.io/chezmoidotsh/**" ];
            deleteReferrers = false;
            deleteUntagged = true;
            keepTags = [{ mostRecentlyPushedCount = 3; }];
          }
          {
            repositories = [ "**" ];
            deleteReferrers = false;
            deleteUntagged = true;
            keepTags = [{
              mostRecentlyPulledCount = 3;
              pulledWithin = "4380h"; # 6 months
            }];
          }
        ];
      };
    };

    http = {
      address = "127.0.0.1"; # loopback only — Caddy is the public surface
      port = "5000";
      realm = "zot";
      externalUrl = "https://oci.chezmoi.sh";
      compat = [ "docker2s2" ]; # keep fat-manifest clients happy

      # Anonymous read for everyone. Pushes are not exposed — first-party
      # images are pushed from a maintainer workstation over a localhost
      # tunnel (`ssh -L 5000:127.0.0.1:5000 <pve-host> pct exec 102 …`).
      accessControl.repositories."**".anonymousPolicy = [ "read" ];
    };

    log.level = "info";

    extensions = {
      # search activates mgmt + ui transitively.
      search.enable = true;
      ui.enable = true;

      # Periodic integrity check on stored blobs.
      scrub = {
        enable = true;
        interval = "24h";
      };

      sync = {
        enable = true;
        registries = upstreams.registries;
      };
    };
  };

  configFile = settingsFormat.generate "zot-config.json" settings;
in
{
  users.users.zot = {
    isSystemUser = true;
    group = "zot";
    home = "/var/lib/zot";
    createHome = false; # StateDirectory owns the lifecycle
    description = "Zot OCI registry service account";
  };
  users.groups.zot = { };

  # World-readable — no secrets embedded; htpasswd lives at a separate path.
  environment.etc."zot/config.json".source = configFile;

  systemd.services.zot = {
    description = "Zot OCI registry";
    documentation = [ "https://zotregistry.dev/" ];
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];

    serviceConfig = {
      ExecStart = "${lib.getExe zotPackage} serve /etc/zot/config.json";
      ExecReload = "${pkgs.coreutils}/bin/kill -HUP $MAINPID";

      User = "zot";
      Group = "zot";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";

      StateDirectory = "zot";
      StateDirectoryMode = "0750";
      WorkingDirectory = "/var/lib/zot";

      # ── systemd hardening (LXC-safe subset) ──────────────────────────
      # PrivateDevices / ProtectKernelModules / RestrictNamespaces clash
      # with the LXC's restricted view of the host — intentionally omitted.
      NoNewPrivileges = true;
      PrivateTmp = true;
      ProtectSystem = "strict";
      ProtectHome = true;
      ProtectControlGroups = true;
      ProtectKernelLogs = true;
      ProtectClock = true;
      RestrictSUIDSGID = true;
      RestrictRealtime = true;
      LockPersonality = true;
      MemoryDenyWriteExecute = true;
      SystemCallArchitectures = "native";

      ReadWritePaths = [ "/var/lib/zot" ];

      # Zot opens many files during sync; the default 1024 trips under load.
      LimitNOFILE = 65536;
    };
  };
}
