# ─────────────────────────────────────────────────────────────────────────────
# Parser: Alertmanager JSON logs → OTel SemConv attributes
#         (logs.parsers = [ "alertmanager" ])
# ─────────────────────────────────────────────────────────────────────────────
# A `transform` processor for Alertmanager (service.name "alertmanager")
# started with --log.format=json (slog):
#   {"time":"…","level":"INFO","source":"cluster.go:707","msg":"…","err":"…"}
# A few lines bypass slog and come from the standard Go logger, prefixed by
# their package:
#   spec:2026/11/18 00:05:25 warning: could not resolve current working …
# The body is kept as-is.
# ─────────────────────────────────────────────────────────────────────────────
{ lib }:

let
  isAlertmanager = ''resource.attributes["service.name"] == "alertmanager" and IsString(body)'';
in
{
  log_statements = [{
    context = "log";
    statements = [
      # ── 1. Parse the JSON body ────────────────────────────────────────────
      ''merge_maps(cache, ParseJSON(body), "upsert") where ${isAlertmanager} and IsMatch(body, "^\\{")''

      # ── 2. Severity ───────────────────────────────────────────────────────
      ''set(severity_number, SEVERITY_NUMBER_DEBUG) where cache["level"] == "DEBUG"''
      ''set(severity_number, SEVERITY_NUMBER_INFO) where cache["level"] == "INFO"''
      ''set(severity_number, SEVERITY_NUMBER_WARN) where cache["level"] == "WARN"''
      ''set(severity_number, SEVERITY_NUMBER_ERROR) where cache["level"] == "ERROR"''
      # Standard Go logger lines: "<pkg>:<date> <time> warning: …".
      ''set(severity_number, SEVERITY_NUMBER_WARN) where ${isAlertmanager} and IsMatch(body, "^[a-z]+:[0-9/]+ [0-9:]+ warning: ")''
      ''set(severity_number, SEVERITY_NUMBER_ERROR) where ${isAlertmanager} and IsMatch(body, "^[a-z]+:[0-9/]+ [0-9:]+ error: ")''

      # ── 3. Source location and error (warnings and above) ─────────────────
      ''merge_maps(cache, ExtractPatterns(cache["source"], "^(?P<file>[^:]+):(?P<line>[0-9]+)$"), "upsert") where cache["source"] != nil and severity_number >= SEVERITY_NUMBER_WARN''
      ''set(attributes["code.file.path"], cache["file"]) where cache["file"] != nil''
      ''set(attributes["code.line.number"], Int(cache["line"])) where cache["line"] != nil''
      ''set(attributes["exception.message"], cache["err"]) where IsString(cache["err"])''
    ];
  }];
}
