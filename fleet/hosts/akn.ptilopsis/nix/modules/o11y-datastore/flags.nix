# oripathy: type=nixpkg pkg=caddy upstream=github.com/caddyserver/caddy tagPrefix=v
# ─────────────────────────────────────────────────────────────────────────────
# o11y-datastore — ports, command-line flags and Caddy build of the stack
# ─────────────────────────────────────────────────────────────────────────────
# Pure data, read by the other files of this module (launchd ProgramArguments =
# binary + these flags). `dataDir` is the stack's data root; each store gets its
# own subdirectory.
# ─────────────────────────────────────────────────────────────────────────────
rec {
  # ── Limits ────────────────────────────────────────────────────────────
  # Default memory limits. macOS has no cgroups (no MemoryMax): these
  # application-level limits are the only ones.
  defaultLimits = {
    victoriametrics = {
      allowedBytes = "1GiB"; # caches; RSS ~500 MiB at 9 GB of data
      maxMemoryPerQuery = "512MiB";
    };
    victorialogs = {
      # Also sizes the per-query state budget: 40% of it (5 GiB -> ~2 GiB per
      # query); heavier queries are rejected with "requires more than N MB".
      allowedBytes = "5GiB";
      # A single regex stats query over 4h took VL from 550 MiB to 1.2 GiB
      # in 30s; cap parallelism so a few of them cannot stack up.
      maxConcurrentRequests = 4;
      maxQueryDuration = "5m"; # wide 24h stats queries; the vMCP allows the same
    };
    victoriatraces = {
      allowedBytes = "256MiB";
    };
  };

  # ── Ports ─────────────────────────────────────────────────────────────
  # Loopback ports of the backends (Caddy is the only public surface).
  ports = {
    victoriametrics = 8428;
    victorialogs = 9428;
    victoriatraces = 10428;
    vmalert = 8880;
    alertmanager = 9093;
    otlpGateway = 14318;
  };

  # ── Retention ─────────────────────────────────────────────────────────
  # Retention as "<n>d", "<n>w" or "<n>M" (days, weeks, months of 30 days),
  # turned into the "<days>d" every store understands (VictoriaMetrics alone
  # reads a bare number as months, and none of them knows "M").
  retentionPattern = "[1-9][0-9]*[dwM]";
  retentionDays = value:
    let
      m = builtins.match "([1-9][0-9]*)([dwM])" value;
      factor = { d = 1; w = 7; M = 30; };
    in
    if m == null
    then throw "retention '${value}': expected <n>d, <n>w or <n>M (e.g. 30d, 2w, 18M)"
    else "${toString (builtins.fromJSON (builtins.elemAt m 0) * factor.${builtins.elemAt m 1})}d";

  # ── Flags ─────────────────────────────────────────────────────────────
  mkFlags =
    { dataDir
    , retention # { metrics, logs, traces }: "<n>d", "<n>w" or "<n>M"
    , limits ? defaultLimits
    }:
    let
      vmUrl = "http://127.0.0.1:${toString ports.victoriametrics}";
    in
    {
      victoriametrics = [
        "-storageDataPath=${dataDir}/metrics"
        "-httpListenAddr=127.0.0.1:${toString ports.victoriametrics}"
        "-retentionPeriod=${retentionDays retention.metrics}"
        "-memory.allowedBytes=${limits.victoriametrics.allowedBytes}"
        "-search.maxMemoryPerQuery=${limits.victoriametrics.maxMemoryPerQuery}"
        # OTLP is the only ingest path. Metric names become Prometheus-style
        # (system_cpu_time_seconds_total) but labels keep their OTel dots
        # (service.name, host.name), like the log fields; MetricsQL accepts
        # them unquoted: {service.name="zot"}.
        "-opentelemetry.convertMetricNamesToPrometheus"
        # Scope labels only name the producing receiver: noise.
        "-opentelemetry.promoteScopeMetadata=false"
        "-loggerFormat=json"
      ];

      victorialogs = [
        "-storageDataPath=${dataDir}/logs"
        "-httpListenAddr=127.0.0.1:${toString ports.victorialogs}"
        "-retentionPeriod=${retentionDays retention.logs}"
        "-memory.allowedBytes=${limits.victorialogs.allowedBytes}"
        "-search.maxConcurrentRequests=${toString limits.victorialogs.maxConcurrentRequests}"
        "-search.maxQueryDuration=${limits.victorialogs.maxQueryDuration}"
        "-loggerFormat=json"
      ];

      victoriatraces = [
        "-storageDataPath=${dataDir}/traces"
        "-httpListenAddr=127.0.0.1:${toString ports.victoriatraces}"
        "-retentionPeriod=${retentionDays retention.traces}"
        "-memory.allowedBytes=${limits.victoriatraces.allowedBytes}"
        "-loggerFormat=json"
      ];

      # Rule files: ./fs/etc.vmalert.rules, installed at /etc/vmalert/rules.
      # Alertmanager runs with --web.route-prefix=/alerts, so its API lives
      # under that path even over loopback.
      vmalert = [
        "-rule=/etc/vmalert/rules/*.yaml"
        "-datasource.url=${vmUrl}"
        "-remoteWrite.url=${vmUrl}"
        "-remoteRead.url=${vmUrl}"
        "-notifier.url=http://127.0.0.1:${toString ports.alertmanager}/alerts"
        "-evaluationInterval=30s"
        "-httpListenAddr=127.0.0.1:${toString ports.vmalert}"
        "-loggerFormat=json"
      ];

      alertmanager = [
        "--config.file=/etc/alertmanager/alertmanager.yml"
        "--storage.path=${dataDir}/alertmanager"
        "--web.listen-address=127.0.0.1:${toString ports.alertmanager}"
        # Exposed under /alerts/* via Caddy for operator UI/API access. The
        # appliance's vmalert reaches it over loopback (127.0.0.1:9093/alerts).
        # Per-cluster vmalerts notify their OWN Alertmanager — NOT this one. The
        # route-prefix applies to ALL paths: API at /alerts/api/v2, metrics at
        # /alerts/metrics — kept consistent in vmalert and the agent scrape.
        "--web.route-prefix=/alerts"
        "--web.external-url=https://data.o11y.chezmoi.sh/alerts"
        "--log.format=json"
      ];
    };

  # Caddy with the Cloudflare DNS plugin (ACME DNS-01). Refresh the hash when
  # bumping the plugin version:
  #   nix run nixpkgs#caddy.withPlugins -- <same-args> 2>&1 | grep hash
  caddyPackage = pkgs: pkgs.caddy.withPlugins {
    plugins = [ "github.com/caddy-dns/cloudflare@v0.2.4" ];
    hash = "sha256-QSiwKqKvSxhksWBF4/MlBOpyXba5xOQ2sRwA0R7399E=";
  };
}
