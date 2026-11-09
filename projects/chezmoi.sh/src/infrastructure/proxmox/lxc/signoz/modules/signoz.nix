# ─────────────────────────────────────────────────────────────────────────────
# SigNoz — ClickHouse, keeper, schema migrator, OTel collector, query service
# ─────────────────────────────────────────────────────────────────────────────
# Transposition of Foundry's `systemd/binary` flavor (SigNoz's supported
# bare-metal install) with two deliberate differences: SQLite instead of
# PostgreSQL for the SigNoz metadata (single node, nothing to share), and every
# internal listener bound to loopback.
#
#   clickhouse-keeper ─┐
#                      ├─> clickhouse ─> signoz-migrator ─> signoz-collector
#                      └─────────────────────────────────> signoz (UI + API)
#
# Public surface: Caddy (:443 → signoz :8080 and OTLP/HTTP :4318) and OTLP/gRPC
# :4317 directly. Everything else stays on 127.0.0.1.
#
# Authentication: SigNoz' own login only (first visitor creates the admin
# account). No SSO yet.
#
# Persistent state lives on the mp0 volume under /persistent/<service>; fixed
# UIDs keep the Proxmox uid-map trivial (host uid = 100000 + uid).
#
# Build args (flake.nix → _module.args):
#   signozPackage, collectorPackage (catalog/nix/pkgs/by-name/si/)
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, signozPackage, collectorPackage, ... }:

let
  yaml = pkgs.formats.yaml { };

  clickhouse = pkgs.clickhouse;
  chDsn = "tcp://127.0.0.1:9000";

  # ── ClickHouse keeper (embedded in the clickhouse binary) ──────────────────
  keeperConfig = yaml.generate "keeper.yaml" {
    keeper_server = {
      server_id = 0;
      tcp_port = 9181;
      log_storage_path = "/persistent/keeper/coordination/log";
      snapshot_storage_path = "/persistent/keeper/coordination/snapshots";
      four_letter_word_white_list = "*";
      coordination_settings = {
        force_sync = false;
        operation_timeout_ms = 10000;
        raft_logs_level = "warning";
        session_timeout_ms = 30000;
        snapshot_distance = 100000;
        snapshots_to_keep = 3;
      };
      raft_configuration.server = [{ id = 0; hostname = "localhost"; port = 9234; }];
    };
    listen_host = "127.0.0.1";
    logger = { console = true; level = "information"; };
  };

  # ── ClickHouse server ──────────────────────────────────────────────────────
  # System log tables are kept one day: they are the main source of disk churn
  # on a single node and nobody reads them here.
  oneDay = { ttl = "event_date + INTERVAL 1 DAY DELETE"; };

  functionsConfig = yaml.generate "functions.yaml" {
    functions = {
      type = "executable";
      name = "histogramQuantile";
      return_type = "Float64";
      format = "CSV";
      argument = [
        { type = "Array(Float64)"; name = "buckets"; }
        { type = "Array(Float64)"; name = "counts"; }
        { type = "Float64"; name = "quantile"; }
      ];
      command = "./histogramQuantile";
    };
  };

  clickhouseConfigPath = "/etc/clickhouse-server/config.yaml";
  clickhouseConfig = yaml.generate "clickhouse.yaml" ({
    path = "/persistent/clickhouse/";
    tmp_path = "/persistent/clickhouse/tmp/";
    user_files_path = "/persistent/clickhouse/user_files/";
    format_schema_path = "/persistent/clickhouse/format_schemas/";
    user_scripts_path = "${signozPackage}/user_scripts/";
    user_defined_executable_functions_config = "${functionsConfig}";

    display_name = "cluster";
    listen_host = "127.0.0.1";
    http_port = 8123;
    tcp_port = 9000;
    interserver_http_port = 9009;

    logger = { console = 1; level = "information"; formatting.type = "console"; };
    macros = { shard = "00"; replica = "00"; };
    distributed_ddl.path = "/clickhouse/task_queue/ddl";
    zookeeper.node = [{ host = "127.0.0.1"; port = 9181; }];
    remote_servers.cluster.shard = [{ replica = [{ host = "127.0.0.1"; port = 9000; }]; }];

    # SigNoz connects as `default` over loopback only.
    user_directories.users_xml.path = clickhouseConfigPath;
    profiles.default = { load_balancing = "random"; log_queries = 1; };
    quotas.default.interval = {
      duration = 3600;
      queries = 0;
      errors = 0;
      result_rows = 0;
      read_rows = 0;
      execution_time = 0;
    };
    users.default = {
      password = "";
      profile = "default";
      quota = "default";
      networks.ip = "127.0.0.1";
      access_management = 1;
      named_collection_control = 1;
    };

    asynchronous_metric_log = oneDay;
    error_log = oneDay;
    latency_log = oneDay;
    metric_log = oneDay // { flush_interval_milliseconds = 30000; };
    part_log = oneDay;
    processors_profile_log = oneDay // { flush_interval_milliseconds = 30000; };
    query_log = oneDay // { flush_interval_milliseconds = 30000; partition_by = "toYYYYMM(event_date)"; };
    query_metric_log = oneDay;
    query_thread_log = oneDay;
    query_views_log = oneDay;
    session_log = oneDay;
    text_log = oneDay // { flush_interval_milliseconds = 30000; };
    trace_log = oneDay // { flush_interval_milliseconds = 30000; };
    zookeeper_log = oneDay;
  });

  # ── OTel collector ("ingester") ────────────────────────────────────────────
  # Identical to Foundry's default pipeline; only the ClickHouse DSNs, the
  # pprof/health endpoints (loopback) and the opamp target differ.
  ingesterConfig = yaml.generate "ingester.yaml" {
    connectors.signozmeter = {
      dimensions = [
        { name = "service.name"; }
        { name = "deployment.environment"; }
        { name = "host.name"; }
      ];
      metrics_flush_interval = "1h";
    };

    exporters = {
      clickhouselogsexporter = {
        dsn = "${chDsn}/signoz_logs";
        timeout = "45s";
        use_new_schema = true;
        sending_queue.enabled = false;
      };
      clickhousetraces = {
        datasource = "${chDsn}/signoz_traces";
        low_cardinal_exception_grouping = "\${env:LOW_CARDINAL_EXCEPTION_GROUPING}";
        timeout = "45s";
        use_new_schema = true;
        sending_queue.enabled = false;
      };
      metadataexporter = {
        dsn = "${chDsn}/signoz_metadata";
        enabled = true;
        timeout = "45s";
        cache.provider = "in_memory";
      };
      signozclickhousemeter = {
        dsn = "${chDsn}/signoz_meter";
        timeout = "45s";
        sending_queue.enabled = false;
      };
      signozclickhousemetrics = {
        dsn = "${chDsn}/signoz_metrics";
        timeout = "45s";
        sending_queue.enabled = false;
      };
    };

    extensions = {
      pprof.endpoint = "127.0.0.1:1777";
      signoz_health_check.endpoint = "127.0.0.1:13133";
    };

    processors = {
      batch = { send_batch_size = 50000; send_batch_max_size = 55000; timeout = "5s"; };
      "batch/meter" = { send_batch_size = 20000; send_batch_max_size = 25000; timeout = "5s"; };
      "filter/drop_stale" = {
        error_mode = "ignore";
        logs.log_record = [
          ''time_unix_nano != 0 and time < Now() - Duration("360h")''
          ''time_unix_nano == 0 and observed_time_unix_nano != 0 and observed_time < Now() - Duration("360h")''
        ];
        metrics.datapoint = [ ''time_unix_nano != 0 and time < Now() - Duration("360h")'' ];
        traces.span = [ ''start_time_unix_nano != 0 and start_time < Now() - Duration("360h")'' ];
      };
      signozllmpricing = {
        attrs = {
          model = "gen_ai.request.model";
          "in" = "gen_ai.usage.input_tokens";
          out = "gen_ai.usage.output_tokens";
          cache_read = "gen_ai.usage.cache_read.input_tokens";
          cache_write = "gen_ai.usage.cache_creation.input_tokens";
        };
        default_pricing.rules = [ ];
        output_attrs = {
          "in" = "signoz.gen_ai.usage.input_tokens.cost";
          out = "signoz.gen_ai.usage.output_tokens.cost";
          cache_read = "signoz.gen_ai.usage.cache_read.input_tokens.cost";
          cache_write = "signoz.gen_ai.usage.cache_write.input_tokens.cost";
          total = "signoz.gen_ai.usage.tokens.cost";
        };
      };
      signozlogsnormalizer = { };
      signozspanmapper.groups = [ ];
      "signozspanmetrics/delta" = {
        aggregation_temporality = "AGGREGATION_TEMPORALITY_DELTA";
        dimensions = [
          { name = "service.namespace"; default = "default"; }
          { name = "deployment.environment"; default = "default"; }
          { name = "signoz.collector.id"; }
          { name = "service.version"; }
        ];
        dimensions_cache_size = 100000;
        enable_exp_histogram = true;
        latency_histogram_buckets = [
          "100us" "1ms" "2ms" "6ms" "10ms" "50ms" "100ms" "250ms" "500ms"
          "1000ms" "1400ms" "2000ms" "5s" "10s" "20s" "40s" "60s"
        ];
        metrics_exporter = "signozclickhousemetrics";
        metrics_flush_interval = "60s";
      };
    };

    receivers.otlp.protocols = {
      grpc.endpoint = "0.0.0.0:4317";
      http.endpoint = "127.0.0.1:4318"; # Caddy terminates TLS in front
    };

    service = {
      extensions = [ "signoz_health_check" "pprof" ];
      telemetry.logs.encoding = "json";
      pipelines = {
        logs = {
          receivers = [ "otlp" ];
          processors = [ "signozlogsnormalizer" "filter/drop_stale" "batch" ];
          exporters = [ "clickhouselogsexporter" "signozmeter" "metadataexporter" ];
        };
        metrics = {
          receivers = [ "otlp" ];
          processors = [ "filter/drop_stale" "batch" ];
          exporters = [ "signozclickhousemetrics" "signozmeter" "metadataexporter" ];
        };
        "metrics/meter" = {
          receivers = [ "signozmeter" ];
          processors = [ "batch/meter" ];
          exporters = [ "signozclickhousemeter" ];
        };
        traces = {
          receivers = [ "otlp" ];
          processors = [
            "signozspanmetrics/delta"
            "signozspanmapper"
            "signozllmpricing"
            "filter/drop_stale"
            "batch"
          ];
          exporters = [ "clickhousetraces" "signozmeter" "metadataexporter" ];
        };
      };
    };
  };

  # The collector's OpAMP client; SigNoz hosts the server on :4320.
  opampConfig = pkgs.writeText "opamp.yaml" ''
    server_endpoint: ws://127.0.0.1:4320/v1/opamp
  '';

  collector = "${collectorPackage}/bin/signoz-otel-collector";

  migratorEnv = {
    SIGNOZ_OTEL_COLLECTOR_CLICKHOUSE_DSN = chDsn;
    SIGNOZ_OTEL_COLLECTOR_TIMEOUT = "10m";
  };

  # Shared by the ClickHouse server and keeper units.
  clickhouseUnit = {
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    wantedBy = [ "multi-user.target" ];
    serviceConfig = {
      Type = "simple";
      User = "clickhouse";
      Group = "clickhouse";
      Restart = "always";
      RestartSec = 30;
      LimitNOFILE = 500000;
      LimitCORE = "infinity";
    };
  };
in
{
  # ── Users (fixed UIDs → host uid 100000 + uid) ─────────────────────────────
  users.users = {
    clickhouse = { isSystemUser = true; uid = 990; group = "clickhouse"; };
    signoz = { isSystemUser = true; uid = 991; group = "signoz"; };
  };
  users.groups = {
    clickhouse.gid = 990;
    signoz.gid = 991;
  };

  environment.etc."clickhouse-server/config.yaml".source = clickhouseConfig;

  systemd.services = {
    signoz-keeper = lib.recursiveUpdate clickhouseUnit {
      description = "ClickHouse Keeper (SigNoz coordination)";
      serviceConfig.ExecStart = "${clickhouse}/bin/clickhouse keeper --config=${keeperConfig}";
    };

    signoz-clickhouse = lib.recursiveUpdate clickhouseUnit {
      description = "ClickHouse server (SigNoz telemetry store)";
      after = [ "signoz-keeper.service" ];
      requires = [ "signoz-keeper.service" ];
      serviceConfig.ExecStart = "${clickhouse}/bin/clickhouse server --config-file=${clickhouseConfigPath}";
    };

    # Creates/updates the signoz_* databases and tables. Idempotent: re-run on
    # every boot so an upgraded collector migrates its schema.
    signoz-migrator = {
      description = "SigNoz telemetry store migrator";
      after = [ "signoz-clickhouse.service" ];
      requires = [ "signoz-clickhouse.service" ];
      wantedBy = [ "multi-user.target" ];
      environment = migratorEnv;
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        User = "signoz";
        Group = "signoz";
        Restart = "on-failure";
        RestartSec = 5;
        ExecStartPre = "${collector} migrate ready";
        ExecStart = pkgs.writeShellScript "signoz-migrate" ''
          set -euo pipefail
          ${collector} migrate bootstrap
          ${collector} migrate sync up
          ${collector} migrate async up
        '';
      };
    };

    signoz-collector = {
      description = "SigNoz OTel collector";
      after = [ "signoz-migrator.service" "signoz.service" ];
      requires = [ "signoz-migrator.service" ];
      wantedBy = [ "multi-user.target" ];
      environment = migratorEnv // { LOW_CARDINAL_EXCEPTION_GROUPING = "false"; };
      serviceConfig = {
        Type = "simple";
        User = "signoz";
        Group = "signoz";
        Restart = "on-failure";
        RestartSec = 5;
        KillMode = "mixed";
        StateDirectory = "signoz-collector";
        ExecStartPre = "${collector} migrate sync check";
        ExecStart = lib.concatStringsSep " " [
          collector
          "--config=${ingesterConfig}"
          "--manager-config=${opampConfig}"
          "--copy-path=/var/lib/signoz-collector/ingester.yaml"
        ];
      };
    };

    signoz = {
      description = "SigNoz (query service + UI)";
      after = [ "signoz-migrator.service" ];
      requires = [ "signoz-migrator.service" ];
      wantedBy = [ "multi-user.target" ];
      environment = {
        SIGNOZ_TELEMETRYSTORE_PROVIDER = "clickhouse";
        SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_DSN = chDsn;
        SIGNOZ_SQLSTORE_PROVIDER = "sqlite";
        SIGNOZ_SQLSTORE_SQLITE_PATH = "/persistent/signoz/signoz.db";
        SIGNOZ_WEB_DIRECTORY = "${signozPackage}/web";
        SIGNOZ_ALERTMANAGER_SIGNOZ_TEMPLATES = "${signozPackage}/templates/alertmanager/*.gotmpl";
        SIGNOZ_EMAILING_TEMPLATES_DIRECTORY = "${signozPackage}/templates/email";
        SIGNOZ_APISERVER_ADDRESS = "127.0.0.1:8080";
        SIGNOZ_GLOBAL_EXTERNAL_URL = "https://signoz.chezmoi.sh";
        SIGNOZ_GLOBAL_INGESTION_URL = "https://signoz.chezmoi.sh";
        SIGNOZ_PPROF_ENABLED = "false";
        SIGNOZ_ANALYTICS_ENABLED = "false";
        SIGNOZ_STATSREPORTER_ENABLED = "false";
      };
      serviceConfig = {
        Type = "simple";
        User = "signoz";
        Group = "signoz";
        Restart = "on-failure";
        RestartSec = 5;
        KillMode = "mixed";
        WorkingDirectory = "${signozPackage}";
        ExecStart = "${signozPackage}/bin/signoz server";
      };
    };
  };

  systemd.tmpfiles.rules = [
    "d /persistent/clickhouse 0750 clickhouse clickhouse - -"
    "d /persistent/keeper 0750 clickhouse clickhouse - -"
    "d /persistent/signoz 0750 signoz signoz - -"
  ];
}
