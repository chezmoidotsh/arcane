# oripathy: type=nixpkg pkg=opentelemetry-collector-contrib upstream=github.com/open-telemetry/opentelemetry-collector-contrib tagPrefix=v
# ─────────────────────────────────────────────────────────────────────────────
# OTLP gateway — runs the OpenTelemetry Collector
# ─────────────────────────────────────────────────────────────────────────────
# The whole pipeline lives in ./fs/etc.otlp-gateway/config.yaml, installed as
# /etc/otlp-gateway/config.yaml; this module only validates it at build time
# and runs it as a service.
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, ... }:

let
  dataDir = "/persistent/o11y/otlp-gateway";

  # `otelcol-contrib validate` needs the file_storage directory to exist, so the
  # check runs on a copy pointing to a temporary directory.
  configFile = pkgs.runCommand "otlp-gateway.yaml"
    { nativeBuildInputs = [ pkgs.opentelemetry-collector-contrib ]; }
    ''
      cp ${./fs/etc.otlp-gateway/config.yaml} $out
      mkdir -p "$TMPDIR/storage"
      sed "s#${dataDir}#$TMPDIR/storage#" $out > "$TMPDIR/check.yaml"
      otelcol-contrib validate --config=file:$TMPDIR/check.yaml
    '';
in
{
  environment.etc."otlp-gateway/config.yaml".source = configFile;

  systemd.services.otlp-gateway = {
    description = "OTLP gateway — OpenTelemetry Collector (JSON/protobuf → Victoria stores)";
    documentation = [ "https://opentelemetry.io/docs/collector/" ];
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" "victoriametrics.service" "victorialogs.service" "victoriatraces.service" ];
    wants = [ "network-online.target" ];
    restartTriggers = [ configFile ];

    serviceConfig = {
      ExecStart = "${pkgs.opentelemetry-collector-contrib}/bin/otelcol-contrib --config=file:/etc/otlp-gateway/config.yaml";

      User = "o11y";
      Group = "o11y";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";
      WorkingDirectory = dataDir;

      NoNewPrivileges = true;
      RestrictSUIDSGID = true;
      RestrictRealtime = true;
      LockPersonality = true;
      SystemCallArchitectures = "native";
      LimitNOFILE = 65536;
    };
  };
}
