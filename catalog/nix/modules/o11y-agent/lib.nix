# ─────────────────────────────────────────────────────────────────────────────
# o11y-agent — pieces shared by the NixOS (./default.nix) and nix-darwin
# (./darwin.nix) agents
# ─────────────────────────────────────────────────────────────────────────────
# Pure functions: what does not depend on the OS (scrape targets, application
# parsers, exporter, collector telemetry). Everything OS-specific (receivers,
# service manager, pipelines) stays in the two modules.
# ─────────────────────────────────────────────────────────────────────────────
{ lib }:

rec {
  # ── Scrape targets ─────────────────────────────────────────────────────────
  # "host:port" | "host:port/path?query" | "scheme://host:port/path?query"
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

  # ponytail: path/query/scheme are taken from the job's first target; split the
  # job if its targets ever need different paths.
  scrapeConfig = scrapeInterval: target:
    let first = parseTarget (builtins.head target.targets);
    in
    {
      job_name = target.jobName;
      scrape_interval = "${toString scrapeInterval}s";
      scheme = first.scheme;
      metrics_path = first.path;
      static_configs = [{
        targets = map (t: (parseTarget t).host) target.targets;
        labels = target.extraLabels;
      }];
    } // lib.optionalAttrs (first.params != { }) { params = first.params; };

  # ── Application log parsers ────────────────────────────────────────────────
  # One file per application in ./parsers; journald and syslog are the NixOS
  # receivers' own mapping, every other file is an opt-in application parser.
  receiverParsers = [ "journald" "syslog" ];
  availableParsers = lib.subtractLists receiverParsers
    (map (lib.removeSuffix ".nix") (builtins.attrNames (builtins.readDir ./parsers)));

  # error_mode ignore: a record a statement fails on (e.g. a truncated JSON
  # line) keeps its raw body instead of the whole batch being dropped.
  mkParserConfigs = names: lib.listToAttrs (map
    (name: { name = "transform/parser-${name}"; value = import ./parsers/${name}.nix { inherit lib; } // { error_mode = "ignore"; }; })
    names);

  # ── Exporter and collector telemetry ───────────────────────────────────────
  # `otlphttp`: the id accepted by every pinned collector version (0.144+).
  mkExporter = cfg: {
    endpoint = cfg.o11y.endpoint;
    compression = "gzip";
    sending_queue.storage = "file_storage";
  };

  # The collector's own metrics, pushed as OTLP (no self-scrape).
  mkTelemetry = { cfg, hostName }: {
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
}
