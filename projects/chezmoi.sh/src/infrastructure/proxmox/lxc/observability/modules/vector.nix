# ─────────────────────────────────────────────────────────────────────────────
# Vector — log processing middleware
# ─────────────────────────────────────────────────────────────────────────────
# Sits between every log source and VictoriaLogs. The appliance no longer
# ingests raw syslog — that listener moved to the pve-exporter LXC, which parses
# PVE host / LXC syslog into SemConv and forwards it here over the Vector native
# protocol (:6000). The o11y appliance now only ingests already-structured
# events and runs validation + loki-like conversion. Handles:
#
#   1. Structured ingest:
#        OTLP HTTP  :4318        — OpenTelemetry-native (loopback; via Caddy /logs/otlp/*)
#        OTLP gRPC  :4317        — OpenTelemetry-native (loopback)
#        Vector     :6000        — Vector-native from cluster + pve-exporter agents (loopback/bridge)
#
#   2. OTLP normalization to the internal OTLP-style format (sources.otlp.yaml)
#   3. SemConv validation; invalid events become queryable error records
#      (transforms.validate.yaml) — findable via:
#        service.name:vector-ingest attr.error.type:semconv_invalid
#   4. loki-like conversion + push to VictoriaLogs :9428 (sinks.victorialogs.yaml)
#
# Configuration lives under ../config/vector/ — YAML files are baked into the
# Nix store at build time and loaded via --config-dir. Inline `tests:` blocks in
# each file are run by `vector test` (mise run vector:test).
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

  dataDir = "/persistent/o11y/vector";
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
      StateDirectory = lib.mkForce ""; # directory managed by tmpfiles.d (/persistent/o11y/vector)
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
