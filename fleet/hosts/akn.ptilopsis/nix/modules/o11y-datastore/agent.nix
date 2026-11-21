# ─────────────────────────────────────────────────────────────────────────────
# What the host agent (catalog.o11yAgent) collects from the stack itself: the
# daemons' log files and the metrics of the components that cannot push OTLP.
# ─────────────────────────────────────────────────────────────────────────────
{ o11y, ... }:

let
  # A record starts with JSON (Victoria, Caddy, Alertmanager), a collector's
  # timestamp, a Go logger prefix (`spec:2026/…`) or a panic; anything else is
  # a stack trace line of the record before it.
  firstLinePattern = "^([{]|[0-9]{4}-[0-9]{2}-[0-9]{2}T|[a-z]+:[0-9]{4}/|panic: )";
in
{
  catalog.o11yAgent = {
    logs.files = map (s: { path = o11y.log s; serviceName = s; inherit firstLinePattern; }) o11y.logFiles
      ++ [{ path = "/var/log/o11y-agent/otelcol-contrib.log"; serviceName = "o11y-agent"; inherit firstLinePattern; }];
    logs.parsers = [ "alertmanager" "caddy" "otelcol" "victoria" ];
    metrics.scrapeTargets = [
      { jobName = "victoriametrics"; targets = [ "127.0.0.1:${toString o11y.stack.ports.victoriametrics}" ]; }
      { jobName = "victorialogs"; targets = [ "127.0.0.1:${toString o11y.stack.ports.victorialogs}" ]; }
      { jobName = "victoriatraces"; targets = [ "127.0.0.1:${toString o11y.stack.ports.victoriatraces}" ]; }
      { jobName = "vmalert"; targets = [ "127.0.0.1:${toString o11y.stack.ports.vmalert}" ]; }
      { jobName = "alertmanager"; targets = [ "127.0.0.1:${toString o11y.stack.ports.alertmanager}/alerts/metrics" ]; }
      { jobName = "caddy"; targets = [ "127.0.0.1:2019" ]; }
    ];
  };
}
