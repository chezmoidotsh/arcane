{ config, lib, pkgs, ... }:

# ─────────────────────────────────────────────────────────────────────────────
# LXC observability agent — OpenTelemetry Collector (journald + metrics → OTLP)
# ─────────────────────────────────────────────────────────────────────────────
# The o11y appliance only accepts OTLP/HTTP (data.o11y.chezmoi.sh:4318). This
# agent is the single producer on each LXC: everything leaves it as OTLP, no
# custom intermediate format.
#
#   journald ─▶ parsers/journald ─▶ groupbyattrs ───┐
#   syslog   ─▶ parsers/syslog   ─▶ groupbyattrs ───┤ (optional, logs.syslog)
#   hostmetrics ─▶ service.name=hostmetrics ────────┤ (metrics.hostMetrics)
#   prometheus scrape (per job) ─▶ groupbyattrs ────┤ (metrics.scrapeTargets)
#                                                   ▼
#               resourcedetection (host.name, no override) ─▶ resource
#               (drop scrape noise) ─▶ batch ─▶ otlphttp ─▶ o11y
#
# Logs: the journald body (a map of journal fields) is reduced to MESSAGE;
# SYSLOG_IDENTIFIER (fallback _COMM) becomes the service.name resource
# attribute, PRIORITY the OTel severity. No per-service parsing: raw messages.
#
# Metrics: OTel-native first. Host metrics come from the hostmetrics receiver
# and the collector pushes its own telemetry over OTLP. Prometheus scraping is
# kept only for applications that expose nothing else (scrapeTargets, one scrape
# config per job). A `host_name` extraLabel is promoted to the host.name
# resource attribute so a job scraping a remote machine is attributed to it;
# otherwise host.name is the LXC hostname. Scrape-only resource attributes
# (server.port, url.scheme) and os.type are dropped.
#
# The exporter queue and the journald cursor are persisted with file_storage
# (/var/lib/o11y-agent): telemetry survives an appliance restart or outage and
# an agent restart. It lives on the rootfs, so a rootfs-swap upgrade drops
# whatever was still queued (seconds of data at most).
# ─────────────────────────────────────────────────────────────────────────────

let
  cfg = config.catalog.o11yAgent;
  dataDir = "/var/lib/o11y-agent";
  hostName = config.networking.hostName;
  scrape = cfg.metrics.enable && cfg.metrics.scrapeTargets != [ ];
  hostMetrics = cfg.metrics.enable && cfg.metrics.hostMetrics;

  # "host:port" | "host:port/path?query" | "scheme://host:port/path?query"
  # ponytail: path/query/scheme are taken from the job's first target; split the
  # job if its targets ever need different paths.
  parseTarget = t:
    let
      m = builtins.match "(([a-z]+)://)?([^/?]+)(/[^?]*)?(\\?(.*))?" t;
      query = builtins.elemAt m 5;
    in
    {
      scheme = if builtins.elemAt m 1 == null then "http" else builtins.elemAt m 1;
      host = builtins.elemAt m 2;
      path = if builtins.elemAt m 3 == null then "/metrics" else builtins.elemAt m 3;
      params =
        if query == null then { }
        else
          lib.listToAttrs (map
            (kv:
              let p = lib.splitString "=" kv;
              in { name = builtins.head p; value = [ (lib.concatStringsSep "=" (builtins.tail p)) ]; })
            (lib.splitString "&" query));
    };

  scrapeConfig = target:
    let first = parseTarget (builtins.head target.targets);
    in
    {
      job_name = target.jobName;
      scrape_interval = "${toString cfg.metrics.scrapeInterval}s";
      scheme = first.scheme;
      metrics_path = first.path;
      static_configs = [{
        targets = map (t: (parseTarget t).host) target.targets;
        labels = target.extraLabels;
      }];
    } // lib.optionalAttrs (first.params != { }) { params = first.params; };


  logPipelines =
    [ "logs/journald" ] ++ lib.optional cfg.logs.syslog.enable "logs/syslog";

  commonProcessors = [ "resourcedetection" "resource" "batch" ];

  # User processors (processors.<signal>), inserted after the built-in mapping
  # and before resource detection. Ids are prefixed so they cannot collide.
  # Opt-in log parsers (logs.parsers), one file per application in ./parsers.
  # journald and syslog are the receivers' own mapping, always applied to their
  # pipeline; every other file is an opt-in application parser.
  receiverParsers = [ "journald" "syslog" ];
  availableParsers = lib.subtractLists receiverParsers
    (map (lib.removeSuffix ".nix") (builtins.attrNames (builtins.readDir ./parsers)));
  parserConfigs = lib.listToAttrs (map
    # error_mode ignore: a record a statement fails on (e.g. a truncated JSON
    # line) keeps its raw body instead of the whole batch being dropped.
    (name: { name = "transform/parser-${name}"; value = import ./parsers/${name}.nix { inherit lib; } // { error_mode = "ignore"; }; })
    (receiverParsers ++ cfg.logs.parsers));

  userProcessorIds = signal:
    lib.optionals (signal == "logs") (map (name: "transform/parser-${name}") cfg.logs.parsers)
    ++ map (p: "${p.type}/user-${p.name}") cfg.processors.${signal};
  userProcessorConfigs = lib.listToAttrs (lib.concatMap
    (signal: map (p: { name = "${p.type}/user-${p.name}"; value = p.config; }) cfg.processors.${signal})
    [ "logs" "metrics" ]);

  collectorConfig = {
    extensions.file_storage = {
      directory = dataDir;
      create_directory = false;
    };

    receivers = {
      # The cursor is saved in file_storage: a restart resumes where it left
      # off. Without a cursor (first start, or a fresh rootfs after an
      # upgrade, whose journal is new too) it reads from the beginning, so the
      # boot and upgrade logs are shipped as well.
      journald = { start_at = "beginning"; storage = "file_storage"; };
    } // lib.optionalAttrs cfg.logs.syslog.enable {
      syslog = {
        protocol = "rfc5424";
        tcp.listen_address = cfg.logs.syslog.listenAddress;
      };
    } // lib.optionalAttrs scrape {
      prometheus.config.scrape_configs = map scrapeConfig cfg.metrics.scrapeTargets;
    } // lib.optionalAttrs hostMetrics {
      # LXC-safe scrapers only (no disk: /proc/diskstats is host-wide).
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
          filesystem.exclude_fs_types = {
            fs_types = [ "fuse.lxcfs" "tmpfs" "devtmpfs" "proc" "sysfs" "cgroup2" "devpts" "mqueue" ];
            match_type = "strict";
          };
        };
      };
    };

    processors = {
      memory_limiter = { check_interval = "1s"; limit_mib = 128; };


      # The syslog receiver parses RFC 5424 into attributes (appname, hostname,
      # message, …) and sets the severity itself.

      # Move per-record identity to the resource, where OTLP expects it.
      "groupbyattrs/logs".keys = [ "service.name" "host.name" ];
      "groupbyattrs/metrics".keys = [ "host_name" ];
      "transform/metrics".metric_statements = [{
        context = "resource";
        statements = [
          ''set(attributes["host.name"], attributes["host_name"]) where attributes["host_name"] != nil''
          ''delete_key(attributes, "host_name")''
        ];
      }];

      resourcedetection = {
        detectors = [ "system" ];
        system = {
          hostname_sources = [ "os" ];
          resource_attributes."os.type".enabled = false;
        };
        override = false;
      };

      resource.attributes = [
        # Added by the prometheus receiver; noise once stored as labels.
        { key = "server.port"; action = "delete"; }
        { key = "url.scheme"; action = "delete"; }
      ]
      # Static attributes on every signal (like Prometheus external_labels).
      ++ lib.mapAttrsToList (key: value: { inherit key value; action = "upsert"; }) cfg.resourceAttributes;

      "resource/hostmetrics".attributes = [
        { key = "service.name"; value = "hostmetrics"; action = "insert"; }
      ];


      batch = { };
    } // parserConfigs // userProcessorConfigs;

    # `otlphttp`: the id accepted by every pinned collector version (0.144+).
    exporters.otlphttp = {
      endpoint = cfg.o11y.endpoint;
      compression = "gzip";
      sending_queue.storage = "file_storage";
    };

    service = {
      extensions = [ "file_storage" ];
      # The collector's own metrics, pushed as OTLP (no self-scrape).
      telemetry = {
        resource = { "host.name" = hostName; } // cfg.resourceAttributes;
        metrics.readers = [{
          periodic = {
            interval = cfg.metrics.scrapeInterval * 1000;
            exporter.otlp = {
              protocol = "http/protobuf";
              endpoint = "${cfg.o11y.endpoint}/v1/metrics";
            };
          };
        }];
      };
      pipelines = {
        "logs/journald" = {
          receivers = [ "journald" ];
          processors = [ "memory_limiter" "transform/parser-journald" "groupbyattrs/logs" ] ++ userProcessorIds "logs" ++ commonProcessors;
          exporters = [ "otlphttp" ];
        };
      } // lib.optionalAttrs cfg.logs.syslog.enable {
        "logs/syslog" = {
          receivers = [ "syslog" ];
          processors = [ "memory_limiter" "transform/parser-syslog" "groupbyattrs/logs" ] ++ userProcessorIds "logs" ++ commonProcessors;
          exporters = [ "otlphttp" ];
        };
      } // lib.optionalAttrs scrape {
        metrics = {
          receivers = [ "prometheus" ];
          processors = [ "memory_limiter" "groupbyattrs/metrics" "transform/metrics" ] ++ userProcessorIds "metrics" ++ commonProcessors;
          exporters = [ "otlphttp" ];
        };
      } // lib.optionalAttrs hostMetrics {
        # Own pipeline: the hostmetrics receiver sets no service.name, so it is
        # named here, at the source (the prometheus receiver uses the job name).
        "metrics/host" = {
          receivers = [ "hostmetrics" ];
          processors = [ "memory_limiter" "resource/hostmetrics" ] ++ userProcessorIds "metrics" ++ commonProcessors;
          exporters = [ "otlphttp" ];
        };
      };
    };
  };

  # JSON is valid YAML. Validated at build time so a broken config fails the
  # image build instead of the service.
  configFile = pkgs.runCommand "o11y-agent-otelcol.yaml"
    {
      nativeBuildInputs = [ pkgs.opentelemetry-collector-contrib ];
      config = builtins.toJSON collectorConfig;
      passAsFile = [ "config" ];
    }
    ''
      cp "$configPath" $out
      # file_storage requires its directory to exist, even for `validate`.
      mkdir -p "$TMPDIR/storage"
      sed "s#\"${dataDir}\"#\"$TMPDIR/storage\"#" $out > "$TMPDIR/check.json"
      otelcol-contrib validate --config=file:$TMPDIR/check.json
    '';
in
{
  options.catalog.o11yAgent = {
    enable = lib.mkEnableOption "LXC observability agent (OpenTelemetry Collector → o11y over OTLP)";

    o11y = {
      endpoint = lib.mkOption {
        type = lib.types.str;
        description = "OTLP/HTTP base URL of the o11y appliance (signal paths /v1/* are appended).";
        example = "https://data.o11y.chezmoi.sh:4318";
      };
    };

    processors = {
      logs = lib.mkOption {
        type = lib.types.listOf (lib.types.submodule {
          options = {
            name = lib.mkOption {
              type = lib.types.strMatching "[a-z0-9-]+";
              description = "Short unique name (the processor id becomes <type>/user-<name>).";
            };
            type = lib.mkOption {
              type = lib.types.str;
              example = "transform";
              description = "Collector processor type (transform, filter, attributes, …).";
            };
            config = lib.mkOption {
              type = lib.types.attrs;
              default = { };
              description = "Processor configuration, as in the collector YAML.";
            };
          };
        });
        default = [ ];
        description = "Extra collector processors for every log pipeline, in order.";
        example = lib.literalExpression ''
          [{
            name = "drop-debug";
            type = "filter";
            config.logs.log_record = [ "severity_number < SEVERITY_NUMBER_INFO" ];
          }]
        '';
      };
      metrics = lib.mkOption {
        type = lib.types.listOf (lib.types.submodule {
          options = {
            name = lib.mkOption {
              type = lib.types.strMatching "[a-z0-9-]+";
              description = "Short unique name (the processor id becomes <type>/user-<name>).";
            };
            type = lib.mkOption {
              type = lib.types.str;
              example = "transform";
              description = "Collector processor type (transform, filter, attributes, …).";
            };
            config = lib.mkOption {
              type = lib.types.attrs;
              default = { };
              description = "Processor configuration, as in the collector YAML.";
            };
          };
        });
        default = [ ];
        description = "Extra collector processors for the metrics pipeline, in order.";
      };
    };

    logs.parsers = lib.mkOption {
      type = lib.types.listOf (lib.types.enum availableParsers);
      default = [ ];
      example = [ "caddy" ];
      description = ''
        Log parsers to enable, one per application (files in ./parsers). Each
        maps that application's logs to OTel SemConv attributes and runs before
        the user processors.
      '';
    };

    logs.syslog = {
      enable = lib.mkEnableOption "an RFC 5424 syslog TCP listener forwarded as OTLP logs";
      listenAddress = lib.mkOption {
        type = lib.types.str;
        default = "0.0.0.0:5140";
        description = "Syslog TCP listen address (open it in the firewall yourself).";
      };
    };

    metrics = {
      enable = lib.mkEnableOption "metrics shipping (host metrics + scrape targets)";

      hostMetrics = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Collect LXC host metrics with the OTel hostmetrics receiver.";
      };

      scrapeInterval = lib.mkOption {
        type = lib.types.ints.positive;
        default = 30;
        description = "Collection / scrape interval in seconds.";
      };

      scrapeTargets = lib.mkOption {
        type = lib.types.listOf (lib.types.submodule {
          options = {
            jobName = lib.mkOption {
              type = lib.types.str;
              description = "Prometheus job name (OTel service.name of the scraped series).";
            };
            targets = lib.mkOption {
              type = lib.types.listOf lib.types.str;
              description = ''
                Scrape endpoints: "host:port" (→ /metrics), "host:port/path?query"
                or a full URL. All targets of a job share the first one's path.
              '';
              example = [ "127.0.0.1:5000" "127.0.0.1:9221/pve?target=pve&cluster=1&node=1" ];
            };
            extraLabels = lib.mkOption {
              type = lib.types.attrsOf lib.types.str;
              default = { };
              description = ''
                Static labels on every series of this job. `host_name` is special:
                it becomes the host.name resource attribute (use it when scraping
                a remote machine).
              '';
              example = lib.literalExpression ''{ host_name = "pve-01"; }'';
            };
          };
        });
        default = [ ];
        description = ''
          Prometheus scrape targets, one entry per job. Only for applications
          that expose nothing but Prometheus metrics: prefer OTLP otherwise.
        '';
      };
    };

    resourceAttributes = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      example = { "deployment.environment.name" = "homelab"; "cloud.region" = "home"; };
      description = ''
        Static OTel resource attributes added to every signal this agent ships
        (logs, metrics and its own telemetry) — the equivalent of Prometheus
        external_labels. They override values set by the receivers.
      '';
    };

    hostsOverride = lib.mkOption {
      type = lib.types.attrsOf (lib.types.listOf lib.types.str);
      default = { };
      description = ''
        Static /etc/hosts entries. Use when the o11y hostname must be reached
        over a private bridge (e.g. the Proxmox bridge) to avoid hairpin NAT.
      '';
      example = lib.literalExpression ''{ "10.0.0.22" = [ "data.o11y.chezmoi.sh" ]; }'';
    };
  };

  config = lib.mkIf cfg.enable {
    users.users.o11y-agent = {
      isSystemUser = true;
      group = "o11y-agent";
      extraGroups = [ "systemd-journal" ]; # required to read the journal
      description = "OpenTelemetry Collector LXC agent service account";
    };
    users.groups.o11y-agent = { };

    systemd.services.o11y-agent = {
      description = "OpenTelemetry Collector LXC agent — journald + metrics → o11y (OTLP)";
      documentation = [ "https://opentelemetry.io/docs/collector/" ];
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" "systemd-journald.service" ];
      wants = [ "network-online.target" ];
      path = [ pkgs.systemd ]; # the journald receiver shells out to journalctl

      serviceConfig = {
        ExecStart = "${pkgs.opentelemetry-collector-contrib}/bin/otelcol-contrib --config=file:${configFile}";

        User = "o11y-agent";
        Group = "o11y-agent";
        Type = "simple";

        Restart = "always";
        RestartSec = "5s";
        TimeoutStopSec = "30s";
        StateDirectory = "o11y-agent";
        WorkingDirectory = dataDir;

        # systemd hardening — LXC-safe subset (mount-namespace options omitted)
        NoNewPrivileges = true;
        RestrictSUIDSGID = true;
        RestrictRealtime = true;
        LockPersonality = true;
        SystemCallArchitectures = "native";
        LimitNOFILE = 65536;
      };
    };

    networking.hosts = cfg.hostsOverride;
  };
}
