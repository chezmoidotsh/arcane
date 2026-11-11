# ─────────────────────────────────────────────────────────────────────────────
# Parser: journald records → OTLP log (always applied to the journald pipeline)
# ─────────────────────────────────────────────────────────────────────────────
# The journald receiver emits the whole journal entry as a map body. This keeps
# only what OTLP needs: MESSAGE as the body, SYSLOG_IDENTIFIER (fallback _COMM)
# as service.name, PRIORITY as the severity, plus the systemd unit and PID.
# ─────────────────────────────────────────────────────────────────────────────
{ lib }:

let
  # journald PRIORITY → OTel severity (RFC 5424 levels).
  severity = lib.mapAttrsToList
    (prio: sev: ''set(severity_number, SEVERITY_NUMBER_${sev}) where body["PRIORITY"] == "${prio}"'')
    { "0" = "FATAL"; "1" = "FATAL"; "2" = "FATAL"; "3" = "ERROR"; "4" = "WARN"; "5" = "INFO"; "6" = "INFO"; "7" = "DEBUG"; };
in
{
  log_statements = [{
    context = "log";
    statements = [
      ''set(attributes["service.name"], body["_COMM"]) where body["_COMM"] != nil''
      ''set(attributes["service.name"], body["SYSLOG_IDENTIFIER"]) where body["SYSLOG_IDENTIFIER"] != nil''
      ''set(attributes["systemd.unit"], body["_SYSTEMD_UNIT"]) where body["_SYSTEMD_UNIT"] != nil''
      ''set(attributes["process.pid"], Int(body["_PID"])) where body["_PID"] != nil''
    ] ++ severity ++ [
      ''set(body, body["MESSAGE"]) where IsMap(body)''
    ];
  }];
}
