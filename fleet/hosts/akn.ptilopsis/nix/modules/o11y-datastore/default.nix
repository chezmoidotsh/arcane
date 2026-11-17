# ─────────────────────────────────────────────────────────────────────────────
# o11y-datastore — the observability stack of ptilopsis.akn (launchd daemons)
# ─────────────────────────────────────────────────────────────────────────────
# Where the observability data lives (ADR-022). Everything listens on loopback;
# Caddy is the only public surface, and the pf anchor limits it to the LAN.
#
#   stores.nix        VictoriaMetrics :8428, VictoriaLogs :9428,
#                     VictoriaTraces :10428, vmalert :8880
#   alertmanager.nix  Alertmanager :9093 (/alerts), Dead-Man's-Switch heartbeat
#   gateway.nix       OTLP gateway :14318 (OpenTelemetry Collector)
#   caddy.nix         Caddy :80 :443 :4318 (TLS, routing)
#   firewall.nix      pf anchor: 443 and 4318 from the LAN only
#   agent.nix         what the host agent scrapes and tails
#
# One write path, OTLP/HTTP on :4318; :443 is read-only. This file holds what
# the others share: the options, the accounts, the directories, the log files
# and the launchd helper. The Caddyfile, the landing page, the gateway pipeline
# and the vmalert rules are plain files in ./fs, installed as-is except for the
# paths (see caddy.nix and gateway.nix).
#
# macOS specifics:
#
#   * accounts: `_o11y` runs the stores, vmalert, Alertmanager and the gateway;
#     `_caddy` runs Caddy and alone reads the TLS secret. Fixed uids, declared
#     in users.knownUsers so nix-darwin creates them.
#   * secrets: read from files at runtime (sops-nix), never baked in the store.
#   * memory: no cgroups, no MemoryMax. The stores' own flags
#     (-memory.allowedBytes, per-query limits) are the only limits: `limits`.
#   * supervision: launchd KeepAlive restarts a daemon 5 s after it exits.
#     launchd has no ordering: every daemon tolerates a missing peer (Caddy and
#     the gateway retry their upstreams, vmalert retries the datasource, the
#     gateway queues on disk).
#   * logs: stdout/stderr to `logDir/<service>.log`, capped by darwin-log-trim.
#   * :80/:443: Caddy binds the wildcard address as `_caddy`, without root:
#     macOS (10.14+) has no privileged-port restriction on wildcard binds.
# ─────────────────────────────────────────────────────────────────────────────
{ config, lib, pkgs, ... }:

let
  # ── Paths ─────────────────────────────────────────────────────────────
  cfg = config.services.o11yDatastore;
  stack = import ./flags.nix;

  stateDir = "${cfg.dataDir}/o11y"; # stores, Alertmanager, gateway queues (`_o11y`)
  caddyDir = "${cfg.dataDir}/caddy"; # certificates (`_caddy`)
  logDir = "/var/log/o11y-datastore";
  log = name: "${logDir}/${name}.log";

  # ── Log files ─────────────────────────────────────────────────────────
  # Every daemon's log file name; the host agent tails them with the parsers of
  # the same name.
  logFiles = [ "victoria-metrics" "victoria-logs" "victoria-traces" "vmalert" "alertmanager" "otelcol-contrib" "caddy" ];

  # ── launchd daemon helper ─────────────────────────────────────────────
  # One launchd daemon. `interactive` = no launchd CPU/IO throttling and
  # performance cores (the default class throttles daemons, Background pins
  # them to E-cores).
  daemon = { name, user ? "_o11y", args, workdir ? null, interactive ? false }: {
    serviceConfig = {
      ProgramArguments = args;
      UserName = user;
      GroupName = user;
      RunAtLoad = true;
      KeepAlive = true;
      ThrottleInterval = 5;
      ExitTimeOut = 30;
      StandardOutPath = log name;
      StandardErrorPath = log name;
      SoftResourceLimits.NumberOfFiles = 65536;
      HardResourceLimits.NumberOfFiles = 65536;
      ProcessType = if interactive then "Interactive" else "Standard";
    } // lib.optionalAttrs (workdir != null) { WorkingDirectory = workdir; };
  };
in
{
  imports = [ ./stores.nix ./alertmanager.nix ./gateway.nix ./caddy.nix ./firewall.nix ./agent.nix ];

  # ── Options ───────────────────────────────────────────────────────────────
  options.services.o11yDatastore = {
    dataDir = lib.mkOption {
      type = lib.types.str;
      description = ''
        Data root: the stores, Alertmanager and the gateway queues in ./o11y
        (`_o11y`), Caddy's certificates in ./caddy (`_caddy`).
      '';
    };

    retention = lib.mkOption {
      type = lib.types.submodule {
        options = lib.genAttrs [ "metrics" "logs" "traces" ] (s: lib.mkOption {
          type = lib.types.strMatching stack.retentionPattern;
          example = "30d";
          description = "Retention of ${s}: <n>d, <n>w or <n>M (months of 30 days), nothing else.";
        });
      };
      description = "Retention per store, converted to days for the stores.";
    };

    limits = lib.mkOption {
      type = lib.types.attrs;
      default = stack.defaultLimits;
      defaultText = lib.literalExpression "(import ./flags.nix).defaultLimits";
      description = "Memory and query limits of the stores (same shape as flags.nix's defaultLimits).";
    };

    allowedSources = lib.mkOption {
      type = lib.types.nonEmptyListOf lib.types.str;
      description = "Source CIDRs allowed on TCP 443 and 4318.";
    };
  };

  config = {
    # ── Shared with the other files of this module ──────────────────────────
    # What the other files of this module share.
    _module.args.o11y = {
      inherit stack stateDir caddyDir logDir log logFiles daemon;
      flags = stack.mkFlags { dataDir = stateDir; inherit (cfg) retention limits; };
    };

    # ── Accounts ────────────────────────────────────────────────────────────
    users.knownUsers = [ "_o11y" "_caddy" ];
    users.knownGroups = [ "_o11y" "_caddy" ];
    users.users._o11y = {
      uid = 480;
      gid = 480;
      home = stateDir;
      shell = "/usr/bin/false";
      description = "Observability stack service account";
    };
    users.users._caddy = {
      uid = 481;
      gid = 481;
      home = caddyDir;
      shell = "/usr/bin/false";
      description = "Observability stack Caddy";
    };
    users.groups._o11y = {
      gid = 480;
      description = "Observability stack";
      # The agent tails the daemons' logs.
      members = lib.optional config.catalog.o11yAgent.enable "_o11yagent";
    };
    users.groups._caddy = { gid = 481; description = "Observability stack Caddy"; };

    # ── Directories ─────────────────────────────────────────────────────────
    # Before the launchd step; users and groups exist by then. Log files are
    # created up front so they belong to the daemon and stay group-readable.
    system.activationScripts.launchd.text = lib.mkBefore ''
      install -d -m 0755 -o root -g wheel ${cfg.dataDir}
      install -d -m 0750 -o _o11y -g _o11y ${stateDir}
      for d in metrics logs traces alertmanager otlp-gateway; do
        install -d -m 0750 -o _o11y -g _o11y ${stateDir}/$d
      done
      install -d -m 0750 -o _caddy -g _caddy ${caddyDir}
      install -d -m 0750 -o root -g _o11y ${logDir}
      for f in ${lib.concatStringsSep " " (lib.remove "caddy" logFiles)}; do
        [ -e ${logDir}/$f.log ] || install -m 0640 -o _o11y -g _o11y /dev/null ${logDir}/$f.log
      done
      [ -e ${log "caddy"} ] || install -m 0640 -o _caddy -g _o11y /dev/null ${log "caddy"}
    '';

    # ── Log cap ─────────────────────────────────────────────────────────────
    # Log files capped by darwin-log-trim (catalog), pf's included.
    catalog.darwinLogTrim.files = map log (logFiles ++ [ "pf" ]);
  };
}
