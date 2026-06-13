# ─────────────────────────────────────────────────────────────────────────────
# Vector — log processing middleware
# ─────────────────────────────────────────────────────────────────────────────
# Sits between every log source and VictoriaLogs. Handles:
#
#   1. Multi-protocol ingest:
#        syslog TCP :5140        — PVE host / LXC rsyslog forwarding
#        OTLP HTTP  :4318        — OpenTelemetry-native (loopback; via Caddy /logs/otlp/*)
#        OTLP gRPC  :4317        — OpenTelemetry-native (loopback)
#        Vector     :6000        — Vector-native from cluster-side Vector agents (loopback)
#
#   2. Syslog → SemConv conversion (10-transforms-syslog.yaml)
#   3. OTLP normalization to loki-like layout (15-transforms-otlp.yaml)
#   4. SemConv loki-like validation; invalid events become queryable error records
#      (20-transforms-validate.yaml) — findable via:
#        service.name:vector-ingest attr.error.type:semconv_invalid
#   5. Ingestion timestamp enrichment (30-transforms-enrich.yaml)
#   6. Push to VictoriaLogs :9428 (40-sinks.yaml)
#
# Configuration lives under ../config/vector/ — YAML files are baked into the
# Nix store at build time and loaded via --config-dir. Tests in
# ../config/vector/tests/ are loaded alongside for `vector test`.
#
# NOTE: the syslog TCP listener (:5140) moves from VictoriaLogs to Vector.
# victorialogs.nix must NOT pass -syslog.listenAddr.tcp — Vector owns that port.
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, ... }:

let
  # Bake the YAML config files into the Nix store. The tests/ subdirectory is
  # excluded — Vector's --config-dir only reads the top-level YAML files, so
  # tests cannot accidentally be loaded as production config. Tests are passed
  # explicitly only when running `vector test`.
  configDir = pkgs.runCommand "vector-config"
    {
      nativeBuildInputs = [ pkgs.vector ];
    }
    ''
      mkdir -p $out
      for f in ${../config/vector}/*.yaml; do
        cp "$f" "$out/$(basename "$f")"
      done

      VECTOR_DATA_DIR="$(mktemp -d "$TMPDIR/vector-data.XXXXXX")" \
      vector validate --no-environment --config-dir "$out"
    '';

  dataDir = "/var/lib/o11y/vector";
in
{
  systemd.services.vector = {
    description = "Vector — log processing middleware";
    documentation = [ "https://vector.dev/docs/" ];
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" "victorialogs.service" ];
    wants = [ "network-online.target" ];
    # Ensure VictoriaLogs is up before Vector starts draining its disk buffer.

    environment = {
      # Tell Vector where to store its disk buffer (absorbs VLogs restarts).
      VECTOR_DATA_DIR = dataDir;
    };

    serviceConfig = {
      ExecStart = "${pkgs.vector}/bin/vector --config-dir ${configDir}";

      User = "o11y";
      Group = "o11y";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";
      StateDirectory = "o11y/vector";
      WorkingDirectory = dataDir;

      # ── systemd hardening (LXC-safe subset) ──────────────────────────────
      # Mount-namespace options omitted (fail in unprivileged LXC).
      NoNewPrivileges = true;
      RestrictSUIDSGID = true;
      RestrictRealtime = true;
      LockPersonality = true;
      SystemCallArchitectures = "native";
      LimitNOFILE = 65536;
    };
  };
}
