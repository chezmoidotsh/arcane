# ─────────────────────────────────────────────────────────────────────────────
# services.lxc-oci-registry.zot
# ─────────────────────────────────────────────────────────────────────────────
# Runs Zot (https://zotregistry.dev) as a system service listening on
# 127.0.0.1:5000 — never on the network directly. A reverse proxy
# (caddy.nix) handles TLS termination and external exposure.
#
# Layout:
#
#   /var/lib/zot         storage root          (mode 0750, owner zot:zot)
#   /etc/zot/config.json generated config      (world-readable, no secrets)
#   /etc/zot/htpasswd    optional bcrypt creds (mode 0400, owner zot:zot)
#
# The config file is built by `pkgs.formats.json` over a deep-merge of the
# module defaults and `services.lxc-oci-registry.zot.settings`, then placed
# into /etc via `environment.etc`. This keeps it inspectable from the host
# (useful for `zot scrub config /etc/zot/config.json`).
#
# The systemd unit is locked down via the LXC-compatible subset of
# systemd hardening directives (no PrivateDevices, no NoNewPrivileges
# conflicts with LXC namespaces — see hardening.nix).
# ─────────────────────────────────────────────────────────────────────────────
{ config, lib, pkgs, ... }:

let
  cfg = config.services.lxc-oci-registry.zot;

  # `pkgs.formats.json` gives us a deterministic JSON writer with proper
  # type checking on the settings tree.
  settingsFormat = pkgs.formats.json { };

  # ---------------------------------------------------------------------------
  # Sensible base settings — every value here is overridable via cfg.settings.
  # `lib.recursiveUpdate` does a deep merge where the right-hand side wins.
  # ---------------------------------------------------------------------------
  baseSettings = lib.recursiveUpdate
    (
      {
        # Pin the distribution-spec version so older clients negotiate cleanly.
        distSpecVersion = "1.1.1";

        storage = {
          rootDirectory = cfg.storageDir;
          commit = true; # fsync after blob writes (durability over throughput)
          dedupe = true; # cross-repo deduplication via content-addressable links
          gc = true; # background garbage collection of unreferenced blobs
        };

        http = {
          address = "127.0.0.1"; # loopback only — Caddy is the public surface
          port = "5000";
          realm = "zot";
        } // lib.optionalAttrs (cfg.htpasswdFile != null) {
          auth = {
            htpasswd.path = cfg.htpasswdFile;
            failDelay = 5;
          };
        };

        log.level = "info";
      }
      // lib.optionalAttrs cfg.enableManagementAPI {
        # Enabling `search` automatically activates the `mgmt` extension that
        # serves GET /v2/_zot/ext/mgmt (read-only configuration snapshot,
        # secrets stripped). See upstream swagger spec for the response schema.
        extensions = {
          search.enable = true;
          ui.enable = true;
        };
      }
    )
    cfg.settings;

  configFile = settingsFormat.generate "zot-config.json" baseSettings;
in
{
  options.services.lxc-oci-registry.zot = {

    package = lib.mkOption {
      type = lib.types.package;
      description = ''
        Zot binary package. Use the upstream variant
        (`zot.packages.<system>.zot`) when extensions (search, mgmt, ui,
        sync, …) are required; use `zot-minimal` for a pure distribution-spec
        binary.
      '';
      example = lib.literalExpression "pkgs.zot";
    };

    storageDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/zot";
      description = ''
        Filesystem root for blob storage and repository metadata. The
        directory is created automatically by systemd's `StateDirectory`
        with mode 0750 and ownership `zot:zot`.
      '';
    };

    enableManagementAPI = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Toggle the Zot management surface (`extensions.search.enable = true`
        which transitively activates `mgmt` and `ui`).

        The `mgmt` extension exposes a single read-only endpoint at
        `GET /v2/_zot/ext/mgmt?resource=config` that returns the running
        configuration with secrets stripped — handy for monitoring and
        documentation, but useless for write operations.

        Set to `false` to ship a minimum-surface registry; you can still
        opt back into individual extensions via `settings.extensions.*`.
      '';
    };

    htpasswdFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      example = "/etc/zot/htpasswd";
      description = ''
        Path to a bcrypt htpasswd file consumed by Zot's
        `http.auth.htpasswd`. When `null` (default), Zot starts with no
        authentication configured and access control falls back to whatever
        `settings.http.accessControl` defines (typically anonymous read).

        Generate entries with:

            htpasswd -bBn <user> <password> >> htpasswd
      '';
    };

    settings = lib.mkOption {
      type = settingsFormat.type;
      default = { };
      description = ''
        Free-form Zot configuration merged recursively over the module
        defaults. See <https://zotregistry.dev/?id=configuration> for the
        full schema. Anything you set here wins over the defaults.
      '';
      example = lib.literalExpression ''
        {
          extensions.sync.registries = [
            { urls = [ "https://docker.io" ]; onDemand = true; }
          ];
          storage.gcDelay = "1h";
        }
      '';
    };
  };

  config = {
    # ────────────────── User & storage ─────────────────────────────────────
    users.users.zot = {
      isSystemUser = true;
      group = "zot";
      home = cfg.storageDir;
      createHome = false; # StateDirectory below owns the lifecycle
      description = "Zot OCI registry service account";
    };
    users.groups.zot = { };

    # Make the generated config file inspectable from outside the unit
    # (no secrets are embedded — htpasswd lives at a separate path).
    environment.etc."zot/config.json".source = configFile;

    # ────────────────── systemd unit ───────────────────────────────────────
    systemd.services.zot = {
      description = "Zot OCI registry";
      documentation = [ "https://zotregistry.dev/" ];
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];

      serviceConfig = {
        ExecStart = "${lib.getExe cfg.package} serve /etc/zot/config.json";
        ExecReload = "${pkgs.coreutils}/bin/kill -HUP $MAINPID";

        User = "zot";
        Group = "zot";
        Type = "simple";
        Restart = "always";
        RestartSec = "5s";
        TimeoutStopSec = "30s";

        # ── State directory ──────────────────────────────────────────────
        # Drives creation, ownership and permissions of /var/lib/zot.
        StateDirectory = "zot";
        StateDirectoryMode = "0750";
        WorkingDirectory = cfg.storageDir;

        # ── systemd hardening (LXC-safe subset) ──────────────────────────
        # The following directives are known-good inside an unprivileged
        # Proxmox LXC. Several common hardening flags (PrivateDevices,
        # ProtectKernelModules, RestrictNamespaces, etc.) clash with the
        # container's restricted view of the host and are intentionally
        # omitted here — see hardening.nix for the broader LXC profile.
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

        ReadWritePaths = [ cfg.storageDir ];

        # File descriptor limit — Zot opens many files during sync; the
        # default 1024 trips under load.
        LimitNOFILE = 65536;
      };
    };
  };
}
