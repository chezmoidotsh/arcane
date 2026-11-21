# ─────────────────────────────────────────────────────────────────────────────
# o11y-agent — options shared by the NixOS (./default.nix) and nix-darwin
# (./darwin.nix) agents
# ─────────────────────────────────────────────────────────────────────────────
# What an agent ships and where: the OTLP endpoint, application log parsers,
# metrics (host metrics, scrape targets) and resource attributes. Options that
# only make sense on one OS (journald/syslog, launchd files, macmon power, …)
# are declared by that OS's module.
# ─────────────────────────────────────────────────────────────────────────────
{ lib, ... }:

let
  common = import ./lib.nix { inherit lib; };
in
{
  options.catalog.o11yAgent = {
    enable = lib.mkEnableOption "observability agent (OpenTelemetry Collector → o11y over OTLP)";


    o11y = {
      endpoint = lib.mkOption {
        type = lib.types.str;
        description = "OTLP/HTTP base URL of the o11y appliance (signal paths /v1/* are appended).";
        example = "https://data.o11y.chezmoi.sh:4318";
      };
    };

    logs.parsers = lib.mkOption {
      type = lib.types.listOf (lib.types.enum common.availableParsers);
      default = [ ];
      example = [ "caddy" ];
      description = ''
        Log parsers to enable, one per application (files in ./parsers). Each
        maps that application's logs to OTel SemConv attributes and runs before
        the user processors.
      '';
    };

    metrics = {
      enable = lib.mkEnableOption "metrics shipping (host metrics + scrape targets)";

      hostMetrics = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Collect host metrics with the OTel hostmetrics receiver.";
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
  };
}
