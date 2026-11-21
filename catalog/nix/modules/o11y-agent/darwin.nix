{ config, lib, pkgs, ... }:

# ─────────────────────────────────────────────────────────────────────────────
# macOS observability agent — OpenTelemetry Collector as a launchd daemon
# ─────────────────────────────────────────────────────────────────────────────
# nix-darwin twin of ./default.nix (NixOS). Same contract: the single producer
# of the host, everything leaves as OTLP/HTTP to the o11y appliance.
#
#   log files (filelog, one per service) ─▶ app parsers ───────────┐
#   unified log (log stream as root, errors/faults) ───────────────┤
#   host_metrics (cpu, load, memory, network, paging, ─────────────┤
#                 processes, system, disk, filesystem) ────────────┤
#   prometheus scrape (per job) ─▶ groupbyattrs ───────────────────┤
#   macmon (*_power) ─▶ signal_to_metrics ─▶ hw.power ─────────────┤
#                                                                  ▼
#            host.name (insert) ─▶ resource ─▶ batch ─▶ otlphttp ─▶ o11y
#
# What differs from Linux, and why:
#   * no journald: daemons log to files (launchd StandardOutPath), tailed with
#     filelog; each file names its service.name (logs.files).
#   * the unified log: `log` refuses non-admin users, so the collector's
#     macos_unified_logging receiver (it runs `log show` as the agent user)
#     gets nothing. A root daemon runs `log stream` (ndjson) into a file the
#     agent tails instead, filtered to errors and faults: the default level is
#     thousands of lines a minute.
#   * every host_metrics scraper used here was checked on Apple Silicon with
#     this collector build (0.151.0): cpu, load, memory, network, paging,
#     processes, system, disk and filesystem all report.
#   * power draw (watts): macmon reads the SoC/system power sensors through
#     IOReport, without root (powermetrics needs root; there is no battery
#     sensor on a desktop Mac). Its JSON lines are turned into gauges by the
#     signal_to_metrics connector: one hw.power gauge (W) per sensor, with
#     hw.id / hw.name / hw.type / hw.parent (whole machine: no hw.type; then
#     soc, cpu, gpu, ane, gpu_ram, ram). IOReport is
#     a private Apple API: macmon may break on a macOS update; the gauges then
#     stop, nothing else does.
#
# Shared with the NixOS agent through ./lib.nix: scrape targets, application
# parsers (./parsers), exporter and collector telemetry.
# ─────────────────────────────────────────────────────────────────────────────

let
  # ── Settings ──────────────────────────────────────────────────────────
  cfg = config.catalog.o11yAgent;
  user = "_o11yagent";
  dataDir = "/var/lib/o11y-agent";
  logDir = "/var/log/o11y-agent";
  powerFile = "${logDir}/power.jsonl";
  unifiedLogFile = "${logDir}/unified-log.jsonl";
  hostName = config.networking.hostName;
  scrape = cfg.metrics.enable && cfg.metrics.scrapeTargets != [ ];
  hostMetrics = cfg.metrics.enable && cfg.metrics.hostMetrics;
  power = cfg.metrics.enable && cfg.metrics.power.enable;
  unifiedLog = cfg.logs.unifiedLog.enable;

  # ── Shared pieces (./lib.nix) and log parsers ─────────────────────────
  common = import ./lib.nix { inherit lib; };
  parserIds = map (name: "transform/parser-${name}") cfg.logs.parsers;
  parserConfigs = common.mkParserConfigs cfg.logs.parsers;

  # ── Receivers ─────────────────────────────────────────────────────────
  fileReceiverId = f: "filelog/${f.serviceName}";
  fileReceivers = lib.listToAttrs (map
    (f: {
      name = fileReceiverId f;
      value = {
        include = [ f.path ];
        # Cursor in file_storage: a restart resumes where it left off.
        start_at = "beginning";
        storage = "file_storage";
        resource."service.name" = f.serviceName;
      } // lib.optionalAttrs (f.firstLinePattern != null) {
        # Continuation lines (stack traces) join the record they follow.
        operators = [{
          type = "recombine";
          combine_field = "body";
          # One receiver per file, but without it the operator warns on every entry that it may pool sources.
          source_identifier = ''attributes["log.file.name"]'';
          is_first_entry = ''body matches "${f.firstLinePattern}"'';
        }];
      };
    })
    cfg.logs.files);

  tail = [ "resource/hostname" "resource" "batch" ];

  # ── Collector configuration ───────────────────────────────────────────
  collectorConfig = {
    extensions.file_storage = {
      directory = dataDir;
      create_directory = false;
    };

    receivers = fileReceivers
      // lib.optionalAttrs unifiedLog {
      "filelog/unified-log" = {
        include = [ unifiedLogFile ];
        start_at = "beginning";
        storage = "file_storage";
        # `log stream` opens with a "Filtering the log data using …" line.
        operators = [{ type = "filter"; expr = ''body matches "^Filtering "''; }];
      };
    } // lib.optionalAttrs scrape {
      prometheus.config.scrape_configs = map (common.scrapeConfig cfg.metrics.scrapeInterval) cfg.metrics.scrapeTargets;
    } // lib.optionalAttrs hostMetrics {
      hostmetrics = {
        collection_interval = "${toString cfg.metrics.scrapeInterval}s";
        scrapers = {
          cpu = { };
          load = { };
          memory = { };
          network = { };
          paging = { };
          processes = { };
          system = { };
          disk = { };
          filesystem.exclude_fs_types = {
            fs_types = [ "devfs" "autofs" "nullfs" ];
            match_type = "strict";
          };
        };
      };
    } // lib.optionalAttrs power {
      "filelog/power" = {
        include = [ powerFile ];
        start_at = "end";
        operators = [{ type = "json_parser"; }];
        resource."service.name" = "macmon";
      };
    };

    connectors = lib.optionalAttrs power {
      # One hw.power gauge (W) per macmon field, labelled with the semconv
      # hardware attributes: hw.id (the sensor), hw.name, hw.type, hw.parent.
      # The whole machine is the series with no hw.type (`hw_type=""`): sum or
      # filter on hw.type, since the SoC overlaps cpu + gpu + ane.
      signal_to_metrics.logs = lib.mapAttrsToList
        (field: m: {
          name = "hw.power";
          description = "Instantaneous power draw (macmon ${field})";
          unit = "W";
          conditions = [ ''attributes["${field}"] != nil'' ];
          attributes = [
            { key = "hw.id"; default_value = m.id; }
            { key = "hw.name"; default_value = m.name; }
          ]
          ++ lib.optional (m ? type) { key = "hw.type"; default_value = m.type; }
          ++ lib.optional (m ? parent) { key = "hw.parent"; default_value = m.parent; };
          gauge.value = ''Double(attributes["${field}"])'';
        })
        {
          sys_power = { id = "sys"; name = "Mac Studio"; };
          all_power = { id = "soc"; name = "SoC (CPU + GPU + ANE)"; type = "soc"; };
          cpu_power = { id = "cpu"; name = "CPU"; type = "cpu"; parent = "soc"; };
          gpu_power = { id = "gpu"; name = "GPU"; type = "gpu"; parent = "soc"; };
          ane_power = { id = "ane"; name = "Neural Engine"; type = "ane"; parent = "soc"; };
          gpu_ram_power = { id = "gpu_ram"; name = "GPU memory"; type = "memory"; parent = "gpu"; };
          ram_power = { id = "ram"; name = "RAM"; type = "memory"; };
        };
    };

    processors = {
      memory_limiter = { check_interval = "1s"; limit_mib = 128; };

      # Unified log record (ndjson body): the message becomes the body, the
      # emitting process the service.name, the subsystem an attribute.
      "transform/unified-log" = {
        error_mode = "ignore";
        log_statements = [{
          context = "log";
          statements = [
            ''merge_maps(cache, ParseJSON(body), "upsert") where IsString(body) and IsMatch(body, "^\\{")''
            ''set(time, Time(cache["timestamp"], "%Y-%m-%d %H:%M:%S.%f%z")) where cache["timestamp"] != nil''
            ''set(severity_number, SEVERITY_NUMBER_DEBUG) where cache["messageType"] == "Debug"''
            ''set(severity_number, SEVERITY_NUMBER_INFO) where cache["messageType"] == "Info" or cache["messageType"] == "Default"''
            ''set(severity_number, SEVERITY_NUMBER_ERROR) where cache["messageType"] == "Error"''
            ''set(severity_number, SEVERITY_NUMBER_FATAL) where cache["messageType"] == "Fault"''
            ''set(attributes["service.name"], cache["processImagePath"]) where cache["processImagePath"] != nil''
            ''replace_pattern(attributes["service.name"], "^.*/", "") where attributes["service.name"] != nil''
            ''set(attributes["macos.log.subsystem"], cache["subsystem"]) where cache["subsystem"] != nil and cache["subsystem"] != ""''
            ''set(attributes["process.pid"], Int(cache["processID"])) where cache["processID"] != nil''
            ''set(body, cache["eventMessage"]) where cache["eventMessage"] != nil''
          ];
        }];
      };
      "groupbyattrs/unified-log".keys = [ "service.name" ];

      "groupbyattrs/metrics".keys = [ "host_name" ];
      "transform/metrics".metric_statements = [{
        context = "resource";
        statements = [
          ''set(attributes["host.name"], attributes["host_name"]) where attributes["host_name"] != nil''
          ''delete_key(attributes, "host_name")''
        ];
      }];

      # The NixOS agent uses resourcedetection (os hostname); a Mac's OS
      # hostname varies with the network (foo.local, DHCP names), so the
      # configured one is inserted instead (a host_name scrape label wins).
      "resource/hostname".attributes = [
        { key = "host.name"; value = hostName; action = "insert"; }
      ];

      resource.attributes = [
        { key = "server.port"; action = "delete"; }
        { key = "url.scheme"; action = "delete"; }
      ]
      ++ lib.mapAttrsToList (key: value: { inherit key value; action = "upsert"; }) cfg.resourceAttributes;

      "resource/hostmetrics".attributes = [
        { key = "service.name"; value = "hostmetrics"; action = "insert"; }
      ];

      # signal_to_metrics adds the collector's own service.instance.id (a UUID
      # drawn at each start) as signal_to_metrics.service.instance.id: every
      # restart would start a new hw.power series per sensor.
      "resource/power".attributes = [
        { pattern = "^signal_to_metrics\\."; action = "delete"; }
      ];

      batch = { };
    } // parserConfigs;

    exporters.otlphttp = common.mkExporter cfg;

    service = {
      extensions = [ "file_storage" ];
      telemetry = common.mkTelemetry { inherit cfg hostName; };
      pipelines = lib.optionalAttrs (cfg.logs.files != [ ]) {
        "logs/files" = {
          receivers = map fileReceiverId cfg.logs.files;
          processors = [ "memory_limiter" ] ++ parserIds ++ tail;
          exporters = [ "otlphttp" ];
        };
      } // lib.optionalAttrs unifiedLog {
        "logs/unified" = {
          receivers = [ "filelog/unified-log" ];
          processors = [ "memory_limiter" "transform/unified-log" "groupbyattrs/unified-log" ] ++ tail;
          exporters = [ "otlphttp" ];
        };
      } // lib.optionalAttrs scrape {
        metrics = {
          receivers = [ "prometheus" ];
          processors = [ "memory_limiter" "groupbyattrs/metrics" "transform/metrics" ] ++ tail;
          exporters = [ "otlphttp" ];
        };
      } // lib.optionalAttrs hostMetrics {
        "metrics/host" = {
          receivers = [ "hostmetrics" ];
          processors = [ "memory_limiter" "resource/hostmetrics" ] ++ tail;
          exporters = [ "otlphttp" ];
        };
      } // lib.optionalAttrs power {
        "logs/power" = {
          receivers = [ "filelog/power" ];
          processors = [ "memory_limiter" ];
          exporters = [ "signal_to_metrics" ];
        };
        "metrics/power" = {
          receivers = [ "signal_to_metrics" ];
          processors = [ "memory_limiter" "resource/power" ] ++ tail;
          exporters = [ "otlphttp" ];
        };
      };
    };
  };

  # ── Build-time validation ─────────────────────────────────────────────
  # Validated at build time, like the NixOS agent.
  configFile = pkgs.runCommand "o11y-agent-otelcol.yaml"
    {
      nativeBuildInputs = [ pkgs.opentelemetry-collector-contrib ];
      config = builtins.toJSON collectorConfig;
      passAsFile = [ "config" ];
    }
    ''
      cp "$configPath" $out
      mkdir -p "$TMPDIR/storage"
      sed "s#\"${dataDir}\"#\"$TMPDIR/storage\"#" $out > "$TMPDIR/check.json"
      otelcol-contrib validate --config=file:$TMPDIR/check.json
    '';

  # ── Directories ───────────────────────────────────────────────────────
  # launchd has no StateDirectory/tmpfiles, so the activation script creates
  # them, and a root job does it again at every boot: a missing log directory
  # is made by launchd itself, as root, when it loads the daemons (a macOS
  # update removed it once), and the agent's account then cannot open its log
  # files (`Unable to open stdout path`, EX_CONFIG) until the next switch.
  prepareText = ''
    install -d -m 0750 -o ${user} -g ${user} ${dataDir}
    install -d -m 0750 -o ${user} -g ${user} ${logDir}
  '' + lib.optionalString unifiedLog ''
    # Written by root, read by the agent.
    [ -e ${unifiedLogFile} ] || install -m 0640 -o root -g ${user} /dev/null ${unifiedLogFile}
  '';

  # ── launchd ───────────────────────────────────────────────────────────
  daemonDefaults = {
    UserName = user;
    GroupName = user;
    RunAtLoad = true;
    KeepAlive = true;
    ThrottleInterval = 5;
    ExitTimeOut = 30;
    ProcessType = "Background";
  };
in
{
  imports = [ ./options.nix ../darwin-log-trim ];

  options.catalog.o11yAgent = {
    # (enable, o11y, logs.parsers, metrics.{enable,hostMetrics,scrapeInterval,scrapeTargets},
    # resourceAttributes: see ./options.nix)

    uid = lib.mkOption {
      type = lib.types.int;
      default = 482;
      description = "uid and gid of the `_o11yagent` service account.";
    };

    logs.files = lib.mkOption {
      type = lib.types.listOf (lib.types.submodule {
        options = {
          path = lib.mkOption {
            type = lib.types.str;
            description = "Log file (or glob) to tail; the agent user must be able to read it.";
          };
          serviceName = lib.mkOption {
            type = lib.types.strMatching "[a-z0-9-]+";
            description = "service.name of its records (the parsers match on it).";
          };
          firstLinePattern = lib.mkOption {
            type = lib.types.nullOr (lib.types.strMatching "[^\\\"]*");
            default = null;
            example = "^([{]|panic: )";
            description = ''
              Regex matching the first line of a record: the lines that do not
              match (stack traces) are appended to the record before them. No
              backslash or double quote (use `[{]` rather than `\{`).
            '';
          };
        };
      });
      default = [ ];
      description = "Log files to ship, one per service (launchd StandardOutPath/StandardErrorPath).";
    };

    logs.unifiedLog = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Ship the macOS unified log (filtered by `predicate`).";
      };
      predicate = lib.mkOption {
        type = lib.types.str;
        # avconferenced logs tens of thousands of media errors a minute while a
        # Screen Sharing session is open (96% of all errors on a headless Mac).
        default = "(logType == 'error' OR logType == 'fault') AND process != 'avconferenced'";
        description = "`log stream` predicate (passed as one argument, no shell).";
      };
    };

    metrics.power.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Power draw in watts (hw.power) from macmon, Apple Silicon only.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [{
      assertion = hostName != null;
      message = "catalog.o11yAgent needs networking.hostName (it becomes host.name).";
    }];

    users.knownUsers = [ user ];
    users.knownGroups = [ user ];
    users.users.${user} = {
      uid = cfg.uid;
      gid = cfg.uid;
      home = dataDir;
      shell = "/usr/bin/false";
      isHidden = true;
      description = "OpenTelemetry Collector macOS agent";
    };
    users.groups.${user} = { gid = cfg.uid; description = "OpenTelemetry Collector macOS agent"; };

    # Before the launchd step (users and groups exist by then).
    system.activationScripts.launchd.text = lib.mkBefore prepareText;

    # Waits for /nix: launchd gives up on an interval job at the first
    # "Missing executable", and it loads the daemons before /nix is mounted.
    launchd.daemons.o11y-agent-prepare.serviceConfig = {
      ProgramArguments = [
        "/bin/sh"
        "-c"
        "until [ -x \"$1\" ]; do /bin/sleep 2; done; exec \"$@\""
        "o11y-agent-prepare"
        "${pkgs.writeShellScript "o11y-agent-prepare" "set -eu\n${prepareText}"}"
      ];
      RunAtLoad = true;
      StartInterval = 60;
      ProcessType = "Background";
    };

    launchd.daemons.o11y-agent.serviceConfig = daemonDefaults // {
      ProgramArguments = [
        "${pkgs.opentelemetry-collector-contrib}/bin/otelcol-contrib"
        "--config=file:${configFile}"
      ];
      WorkingDirectory = dataDir;
      StandardOutPath = "${logDir}/otelcol-contrib.log";
      StandardErrorPath = "${logDir}/otelcol-contrib.log";
      SoftResourceLimits.NumberOfFiles = 65536;
      HardResourceLimits.NumberOfFiles = 65536;
    };

    launchd.daemons.o11y-agent-power = lib.mkIf power {
      serviceConfig = daemonDefaults // {
        ProgramArguments = [
          "${pkgs.macmon}/bin/macmon"
          "pipe"
          "--interval"
          (toString (cfg.metrics.scrapeInterval * 1000))
        ];
        StandardOutPath = powerFile;
        StandardErrorPath = "${logDir}/macmon.log";
      };
    };

    # Root: `log` refuses non-admin users.
    launchd.daemons.o11y-agent-unified-log = lib.mkIf unifiedLog {
      serviceConfig = daemonDefaults // {
        UserName = "root";
        GroupName = "wheel";
        ProgramArguments = [
          "/usr/bin/log"
          "stream"
          "--style"
          "ndjson"
          "--predicate"
          cfg.logs.unifiedLog.predicate
        ];
        StandardOutPath = unifiedLogFile;
        StandardErrorPath = "${logDir}/unified-log.err";
      };
    };

    catalog.darwinLogTrim.files = [ "${logDir}/otelcol-contrib.log" ]
      ++ lib.optionals power [ powerFile "${logDir}/macmon.log" ]
      ++ lib.optionals unifiedLog [ unifiedLogFile "${logDir}/unified-log.err" ];
  };
}
