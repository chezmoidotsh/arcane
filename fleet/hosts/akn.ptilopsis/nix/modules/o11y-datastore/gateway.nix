# oripathy: type=nixpkg pkg=opentelemetry-collector-contrib upstream=github.com/open-telemetry/opentelemetry-collector-contrib tagPrefix=v
# ─────────────────────────────────────────────────────────────────────────────
# OTLP gateway — an OpenTelemetry Collector between Caddy and the stores.
# ─────────────────────────────────────────────────────────────────────────────
# The stores only ingest OTLP protobuf, while some senders emit OTLP/JSON. The
# gateway accepts both and always sends protobuf; it also normalises the logs'
# severity and adds the job/instance labels to the metrics. The pipeline is
# ./fs/etc.otlp-gateway/config.yaml. Build-time: the paths and the gateway's
# own host.name are filled in (@STATE_DIR@, @HOST_NAME@) and the result is
# validated by the collector itself.
# ─────────────────────────────────────────────────────────────────────────────
{ config, pkgs, o11y, ... }:

let
  gatewayConfig = pkgs.runCommand "otlp-gateway.yaml"
    { nativeBuildInputs = [ pkgs.opentelemetry-collector-contrib ]; }
    ''
      substitute ${./fs/etc.otlp-gateway/config.yaml} $out \
        --subst-var-by STATE_DIR ${o11y.stateDir} \
        --subst-var-by HOST_NAME ${config.networking.hostName}
      mkdir -p "$TMPDIR/storage"
      sed "s#${o11y.stateDir}/otlp-gateway#$TMPDIR/storage#" $out > "$TMPDIR/check.yaml"
      otelcol-contrib validate --config=file:$TMPDIR/check.yaml
    '';
in
{
  launchd.daemons.o11y-otlp-gateway = o11y.daemon {
    name = "otelcol-contrib";
    args = [ "${pkgs.opentelemetry-collector-contrib}/bin/otelcol-contrib" "--config=file:${gatewayConfig}" ];
    workdir = "${o11y.stateDir}/otlp-gateway";
    interactive = true;
  };
}
