{ config, lib, pkgs, ... }:

# ─────────────────────────────────────────────────────────────────────────────
# LXC observability agent — Vector (journald + metrics → o11y)
# ─────────────────────────────────────────────────────────────────────────────
# Pipeline:
#
#   systemd journal
#       ↓ Vector journald source (current boot only)
#   journald_to_semconv              ← conf.d/sources.journald.yaml
#       │  maps fields → OTel SemConv; stamps resources.host.name and
#       │  resources.axnic.infra.kind (source provenance)
#       ↓
#   route_builtin                      ← conf.d/transforms.builtin-route.yaml (built-in)
#       ├── .caddy → caddy_parse → caddy_to_o11y   (OTEL HTTP SemConv)
#       └── ._unmatched
#           ↓
#   [logs.extraTransforms, if any]   ← conf.d/transforms.*.yaml (user-provided)
#    OR journald_to_o11y (passthrough) ← conf.d/transforms.passthrough.json (auto)
#       ↓ glob: *_to_o11y
#   out_logs (vector native)         → o11y in_vector  (logs, SemConv)
#
#   in_internal_metrics → tag_internal ──┐  (always shipped)
#   scrape_<job>        → tag_<job> ─────┤  (per job, adds `job` label)
#       ← conf.d/sources.prometheus.json (generated)
#   out_metrics (prometheus_remote_write) → o11y VictoriaMetrics
#
# Config directory layout (baked into the Nix store):
#   conf.d/sources.journald.yaml       — static: journald source + semconv remap
#   conf.d/transforms.builtin-route.yaml — static: built-in service routing
#   conf.d/transforms.builtin-caddy.yaml — static: caddy parse (built-in parser)
#   conf.d/sources.prometheus.json     — generated: internal metrics + scrape targets
#   conf.d/sinks.vector.json           — generated: vector native log sink
#   conf.d/sinks.prometheus.json       — generated (metrics.enable only)
#   conf.d/transforms.passthrough.json — generated (logs.extraTransforms = [] only)
#   conf.d/<name>                      — generated from each logs.extraTransforms entry
#
# SemConv validation is intentionally absent — it runs on the o11y side
# (transforms.validate_semconv in the o11y Vector pipeline).
# ─────────────────────────────────────────────────────────────────────────────

let
  cfg = config.catalog.lxcAgent;

  # `node` identifies the originating machine following the node_exporter
  # convention — it refers to the host rather than the scrape endpoint.
  # The (job, node) pair uniquely identifies a series for remote_write.
  metricProvenance = ''
    .tags.node = get_hostname!()
  '';

  # When nodeExporter is enabled, inject its scrape target automatically so
  # callers don't need to wire it up manually in scrapeTargets.
  effectiveScrapeTargets =
    cfg.metrics.scrapeTargets
    ++ lib.optional cfg.nodeExporter.enable {
      jobName = "node_exporter";
      targets = [ "127.0.0.1:${toString cfg.nodeExporter.port}" ];
    };

  # ── Prometheus: sources + tag transforms (generated when metrics.enable) ──
  prometheusConfig = lib.optionalAttrs cfg.metrics.enable {
    sources = {
      in_internal_metrics = {
        type = "internal_metrics";
        scrape_interval_secs = 30;
      };
    } // lib.listToAttrs (map
      (target: {
        name = "scrape_${target.jobName}";
        value = {
          type = "prometheus_scrape";
          endpoints = map
            (t:
              if lib.hasInfix "://" t then t
              else if lib.hasInfix "/" t then "http://${t}"
              else "http://${t}/metrics"
            )
            target.targets;
          scrape_interval_secs = cfg.metrics.scrapeInterval;
        };
      })
      effectiveScrapeTargets);

    # Every series carries the (job, node) pair. Per-job scrapes use the
    # configured job name; internal metrics get job="vector-agent" explicitly.
    transforms = {
      tag_internal = {
        type = "remap";
        inputs = [ "in_internal_metrics" ];
        source = ''.tags.job = "vector-agent"'' + "\n" + metricProvenance;
      };
    } // lib.listToAttrs (
      map
        (target: {
          name = "tag_${target.jobName}";
          value = {
            type = "remap";
            inputs = [ "scrape_${target.jobName}" ];
            source = ''.tags.job = "${target.jobName}"'' + "\n" + metricProvenance;
          };
        })
        effectiveScrapeTargets
    );
  };

  # in_internal_metrics is always shipped (via tag_internal); per-job scrapes
  # go through their tag_<job> transform. All carry provenance tags.
  metricOutputs =
    [ "tag_internal" ]
    ++ map (t: "tag_${t.jobName}") effectiveScrapeTargets;

  # ── Sinks ─────────────────────────────────────────────────────────────────
  vectorSinkConfig = {
    sinks.out_logs = {
      type = "vector";
      inputs = [ "*_to_o11y" ];
      address = cfg.o11y.logsAddress;
      version = "2";
      buffer = {
        type = "disk";
        max_size = 268435488; # 256 MiB — absorbs o11y outages
        when_full = "block";
      };
    };
  };

  metricsSinkConfig = lib.optionalAttrs cfg.metrics.enable {
    sinks.out_metrics = {
      type = "prometheus_remote_write";
      inputs = metricOutputs;
      endpoint = cfg.o11y.metricsUrl;
      buffer = {
        type = "disk";
        max_size = 268435488; # 256 MiB
        when_full = "drop_newest";
      };
    };
  };

  # ── Passthrough: route_builtin._unmatched → journald_to_o11y ────────────────
  # Injected automatically when no extraTransforms are configured.
  # A filter transform with `true` is the cleanest Vector passthrough.
  passthroughConfig = {
    transforms.journald_to_o11y = {
      type = "filter";
      inputs = [ "route_builtin._unmatched" ];
      condition = {
        type = "vrl";
        source = "true";
      };
    };
  };

  dataDir = "/var/lib/lxc-agent";

  # journald source + semconv transform + built-in caddy route/parse.
  # The static journald file ships kind = "lxc" (so it stays self-contained
  # and `vector test`-able); rewrite the injected resource only when this
  # agent runs on another entity type.
  journaldSourceFile =
    if cfg.o11y.sourceKind == "lxc"
    then ./config/vector/sources.journald.yaml
    else
      pkgs.writeText "sources.journald.yaml"
        (builtins.replaceStrings
          [ ''"axnic":   {"infra": {"kind": "lxc"}}'' ]
          [ ''"axnic":   {"infra": {"kind": "${cfg.o11y.sourceKind}"}}'' ]
          (builtins.readFile ./config/vector/sources.journald.yaml));

  # ── Config directory: static YAML + generated JSON merged into conf.d/ ────
  # Vector loads all files in the dir; cross-file references (e.g.
  # journald_to_semconv defined in sources.journald.yaml, consumed by
  # sinks.vector.json via the *_to_o11y glob) resolve at startup.
  #
  # configLinkFarm assembles the files; configDir wraps it with a build-time
  # `vector validate` so any consumer (including the systemd service) implicitly
  # requires validation to pass.
  configLinkFarm = pkgs.linkFarm "lxc-agent-config" (
    [
      {
        name = "conf.d/root.yaml";
        path = ./config/vector/root.yaml;
      }
      {
        name = "conf.d/sources.journald.yaml";
        path = journaldSourceFile;
      }
      {
        name = "conf.d/transforms.builtin-route.yaml";
        path = ./config/vector/transforms.route.yaml;
      }
      {
        name = "conf.d/transforms.builtin-caddy.yaml";
        path = ./config/vector/transforms.caddy.yaml;
      }
      {
        name = "conf.d/sinks.vector.json";
        path = pkgs.writeText "lxc-agent-sinks-vector.json"
          (builtins.toJSON vectorSinkConfig);
      }
    ]
    ++ lib.optional cfg.metrics.enable {
      name = "conf.d/sources.prometheus.json";
      path = pkgs.writeText "lxc-agent-sources-prometheus.json"
        (builtins.toJSON prometheusConfig);
    }
    ++ lib.optional cfg.metrics.enable {
      name = "conf.d/sinks.prometheus.json";
      path = pkgs.writeText "lxc-agent-sinks-prometheus.json"
        (builtins.toJSON metricsSinkConfig);
    }
    ++ map
      (t: {
        name = "conf.d/${t.name}";
        path = pkgs.writeText "lxc-agent-transform-${t.name}" t.content;
      })
      cfg.logs.extraTransforms
    ++ lib.optional (cfg.logs.extraTransforms == [ ]) {
      name = "conf.d/transforms.passthrough.json";
      path = pkgs.writeText "lxc-agent-transforms-passthrough.json"
        (builtins.toJSON passthroughConfig);
    }
  );

  # Validated config dir: build-time schema check via `vector validate`.
  # The systemd service depends on this derivation, so validation is implicit
  # in every NixOS build.
  configDir = pkgs.runCommand "lxc-agent-config-validated"
    { nativeBuildInputs = [ pkgs.vector ]; }
    ''
      export VECTOR_DATA_DIR="$(mktemp -d "$TMPDIR/vector-data.XXXXXX")"

      vector test --config-dir "${configLinkFarm}/conf.d"
      vector validate --no-environment --config-dir "${configLinkFarm}/conf.d"

      unset VECTOR_DATA_DIR

      ln -s ${configLinkFarm} $out
    '';

in
{
  options.catalog.lxcAgent = {
    enable = lib.mkEnableOption "LXC observability agent (Vector journald → o11y)";

    o11y = {
      logsAddress = lib.mkOption {
        type = lib.types.str;
        description = "Vector native address on the o11y appliance (host:port).";
        example = "10.0.0.252:6000";
      };
      metricsUrl = lib.mkOption {
        type = lib.types.str;
        description = "Prometheus remote_write endpoint on the o11y appliance.";
        example = "https://o11y.chezmoi.sh/metrics/api/v1/write";
      };
      sourceKind = lib.mkOption {
        type = lib.types.str;
        default = "lxc";
        example = "vm";
        description = ''
          Infrastructure category this agent runs on, stamped on every signal
          so telemetry traces back to its origin entity type:
            - logs:    resources.axnic.infra.kind  (OTel resource attribute)
            - metrics: axnic_infra_kind            (label)
          Identity (which machine) is carried by host.name / host_name; this
          option sets only the *category*. Override for VM / device reuse.
        '';
      };
    };

    logs = {
      extraTransforms = lib.mkOption {
        type = lib.types.listOf (lib.types.submodule {
          options = {
            name = lib.mkOption {
              type = lib.types.str;
              description = ''
                Filename placed under conf.d/ (e.g. "transforms.parse-nginx.yaml").
                Must be unique across all extraTransforms entries.
              '';
            };
            content = lib.mkOption {
              type = lib.types.str;
              description = ''
                Full YAML (or JSON) content of a Vector config fragment.

                Contract: the fragment must expose at least one component
                named `*_to_o11y`. The log sink consumes all components
                matching that glob. The upstream component produced by this
                module is `route_builtin._unmatched` (the non-caddy branch of
                the built-in caddy router).

                When extraTransforms is empty, an auto-generated passthrough
                `journald_to_o11y` is inserted so the pipeline is complete.
              '';
            };
          };
        });
        default = [ ];
        description = ''
          Additional Vector config fragments injected into conf.d/. When
          non-empty, the auto-generated passthrough is omitted — the caller
          is responsible for providing a component named `*_to_o11y`.
        '';
        example = lib.literalExpression ''
          [{
            name = "transforms.filter-debug.yaml";
            content = ""
              transforms:
                journald_to_o11y:
                  type: filter
                  inputs: [route_builtin._unmatched]
                  condition:
                    type: vrl
                    source: .["attr.syslog.severity.text"] != "debug"
            "";
          }]
        '';
      };
    };

    metrics = {
      enable = lib.mkEnableOption "Prometheus metrics scraping";

      scrapeInterval = lib.mkOption {
        type = lib.types.ints.positive;
        default = 30;
        description = "Global scrape interval in seconds.";
      };

      scrapeTargets = lib.mkOption {
        type = lib.types.listOf (lib.types.submodule {
          options = {
            jobName = lib.mkOption {
              type = lib.types.str;
              description = ''
                Job name — becomes the `job` label on all scraped series. Must
                be a valid Nix identifier (alphanumeric + underscore).
              '';
            };
            targets = lib.mkOption {
              type = lib.types.listOf lib.types.str;
              description = ''
                Scrape endpoints. Three forms are accepted:
                  "host:port"         → http://host:port/metrics (default)
                  "host:port/path"    → http://host:port/path    (custom path)
                  "http://..."        → used verbatim            (full URL)
              '';
              example = [ "127.0.0.1:5000" "127.0.0.1:9221/pve?target=pve&cluster=1&node=1" ];
            };
          };
        });
        default = [ ];
        description = "Prometheus scrape targets, one entry per job.";
        example = lib.literalExpression ''
          [{ jobName = "zot"; targets = [ "127.0.0.1:5000" ]; }]
        '';
      };
    };

    nodeExporter = {
      enable = lib.mkEnableOption ''
        LXC-aware node-exporter for local resource monitoring.
        Starts prometheus-node-exporter on loopback with only the collectors
        that work correctly in an unprivileged LXC: cpu, filesystem, loadavg,
        meminfo, netdev, netstat, processes, sockstat, stat, systemd, time,
        uname, vmstat. Hardware-specific collectors (diskstats, hwmon, nvme,
        rapl, wifi) are excluded. The scrape target is injected into the
        Vector metrics pipeline automatically. Requires
        catalog.lxcAgent.metrics.enable = true
      '';
      port = lib.mkOption {
        type = lib.types.port;
        default = 9100;
        description = "Loopback port for the node-exporter instance.";
      };
    };

    hostsOverride = lib.mkOption {
      type = lib.types.attrsOf (lib.types.listOf lib.types.str);
      default = { };
      description = ''
        Static /etc/hosts entries added via networking.hosts. Use when the o11y
        hostname resolves publicly but must be reached over a private bridge
        (e.g. Proxmox bridge) to avoid hairpin NAT.
      '';
      example = lib.literalExpression ''{ "10.0.0.252" = [ "o11y.chezmoi.sh" ]; }'';
    };
  };

  config = lib.mkIf cfg.enable {

    assertions = lib.optional cfg.nodeExporter.enable {
      assertion = cfg.metrics.enable;
      message = ''
        catalog.lxcAgent.nodeExporter.enable = true requires
        catalog.lxcAgent.metrics.enable = true to ship the scraped data.
      '';
    };

    # ── node-exporter: LXC-safe collector subset, loopback only ─────────────
    # Disable all defaults; re-enable only collectors that function correctly
    # in an unprivileged LXC (no raw disk access, no hardware sensors/RAPL).
    services.prometheus.exporters.node = lib.mkIf cfg.nodeExporter.enable {
      enable = true;
      listenAddress = "127.0.0.1";
      port = cfg.nodeExporter.port;
      extraFlags = [ "--collector.disable-defaults" ];
      enabledCollectors = [
        "cpu"
        "filesystem"
        "loadavg"
        "meminfo"
        "netdev"
        "netstat"
        "processes"
        "sockstat"
        "stat"
        "systemd"
        "time"
        "uname"
        "vmstat"
      ];
    };

    # ── Vector: journald reader + metrics scraper → o11y ────────────────────
    users.users.lxc-agent = {
      isSystemUser = true;
      group = "lxc-agent";
      extraGroups = [ "systemd-journal" ]; # required to read the journal
      description = "Vector LXC agent service account";
    };
    users.groups.lxc-agent = { };

    systemd.services.lxc-agent = {
      description = "Vector LXC agent — journald reader + metrics scraper → o11y";
      documentation = [ "https://vector.dev/docs/" ];
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" "systemd-journald.service" ];
      wants = [ "network-online.target" ];

      environment.VECTOR_DATA_DIR = dataDir;

      serviceConfig = {
        ExecStart = "${pkgs.vector}/bin/vector --config-dir ${configDir}/conf.d";

        User = "lxc-agent";
        Group = "lxc-agent";
        Type = "simple";

        Restart = "always";
        RestartSec = "5s";
        TimeoutStopSec = "30s";
        StateDirectory = "lxc-agent";
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
