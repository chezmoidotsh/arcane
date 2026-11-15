# oripathy: type=nixpkg pkg=victoriametrics upstream=github.com/VictoriaMetrics/VictoriaMetrics tagPrefix=v
# oripathy: type=nixpkg pkg=victorialogs upstream=github.com/VictoriaMetrics/VictoriaLogs tagPrefix=v
# oripathy: type=nixpkg pkg=victoriatraces upstream=github.com/VictoriaMetrics/VictoriaTraces tagPrefix=v
# ─────────────────────────────────────────────────────────────────────────────
# The stores and the rule evaluator: VictoriaMetrics, VictoriaLogs,
# VictoriaTraces and vmalert (flags in ./flags.nix, rules in ./fs).
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, o11y, ... }:

let
  inherit (o11y) daemon flags stateDir;
in
{
  # Installed at fixed /etc paths, which flags.nix refers to. Interpolated:
  # nix-darwin's etc module turns a path value into a string without copying
  # it to the store (no store reference).
  environment.etc."vmalert/rules".source = "${./fs/etc.vmalert.rules}";

  launchd.daemons = {
    o11y-victoriametrics = daemon {
      name = "victoria-metrics";
      args = [ "${pkgs.victoriametrics}/bin/victoria-metrics" ] ++ flags.victoriametrics;
      workdir = "${stateDir}/metrics";
      interactive = true;
    };
    o11y-victorialogs = daemon {
      name = "victoria-logs";
      args = [ "${pkgs.victorialogs}/bin/victoria-logs" ] ++ flags.victorialogs;
      workdir = "${stateDir}/logs";
      interactive = true;
    };
    o11y-victoriatraces = daemon {
      name = "victoria-traces";
      args = [ "${pkgs.victoriatraces}/bin/victoria-traces" ] ++ flags.victoriatraces;
      workdir = "${stateDir}/traces";
      interactive = true;
    };
    o11y-vmalert = daemon {
      name = "vmalert";
      args = [ "${pkgs.victoriametrics}/bin/vmalert" ] ++ flags.vmalert;
    };
  };
}
