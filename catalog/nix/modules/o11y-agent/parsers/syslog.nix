# ─────────────────────────────────────────────────────────────────────────────
# Parser: RFC 5424 syslog → OTLP log (always applied to the syslog pipeline)
# ─────────────────────────────────────────────────────────────────────────────
# The syslog receiver already parses the header into attributes and sets the
# severity; this moves appname/hostname to service.name/host.name and the
# message to the body.
# ─────────────────────────────────────────────────────────────────────────────
{ lib }:

{
  log_statements = [{
    context = "log";
    statements = [
      ''set(attributes["service.name"], attributes["appname"]) where attributes["appname"] != nil''
      ''set(attributes["host.name"], attributes["hostname"]) where attributes["hostname"] != nil''
      ''set(body, attributes["message"]) where attributes["message"] != nil''
      ''delete_matching_keys(attributes, "^(appname|hostname|message)$")''
    ];
  }];
}
