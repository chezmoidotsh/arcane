# ─────────────────────────────────────────────────────────────────────────────
# What the host agent (catalog.o11yAgent) collects from the stack itself: the
# daemons' log files and the metrics of the components that cannot push OTLP.
# ─────────────────────────────────────────────────────────────────────────────
{ o11y, ... }:

{
  catalog.o11yAgent = {
    logs.files = map (s: { path = o11y.log s; serviceName = s; }) o11y.logFiles;
    logs.parsers = [ "caddy" "victoria" ];
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
