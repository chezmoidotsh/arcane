# ─────────────────────────────────────────────────────────────────────────────
# Parser: OpenTelemetry Collector console logs → OTel SemConv attributes
#         (logs.parsers = [ "otelcol" ])
# ─────────────────────────────────────────────────────────────────────────────
# A `transform` processor for collectors logging to a file in the default
# console encoding (zap), whatever their service.name:
#   2026-11-18T00:30:29.051+0100<TAB>warn<TAB>builders/builders.go:40<TAB>
#     "otlphttp" alias is deprecated<TAB>{"resource": {…}, "error": "…"}
# The trailing JSON holds the structured fields; its `error` becomes
# exception.message. A stack trace may follow on the next lines (recombined by
# the receiver's firstLinePattern): the line is matched up to its first
# newline. The body is kept as-is.
# ─────────────────────────────────────────────────────────────────────────────
{ lib }:

let
  isConsole = ''IsString(body) and IsMatch(body, "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[^\\t]+\\t[a-z]+\\t")'';
in
{
  log_statements = [{
    context = "log";
    statements = [
      # ── 1. Split the line ─────────────────────────────────────────────────
      ''merge_maps(cache, ExtractPatterns(body, "^[^\\t]+\\t(?P<level>[a-z]+)\\t(?P<caller>[^\\t]+)\\t(?P<msg>[^\\t\\n]*)(?:\\t(?P<fields>\\{[^\\n]*\\}))?"), "upsert") where ${isConsole}''
      ''merge_maps(cache, ParseJSON(cache["fields"]), "upsert") where cache["fields"] != nil and cache["fields"] != ""''

      # ── 2. Severity ───────────────────────────────────────────────────────
      ''set(severity_number, SEVERITY_NUMBER_DEBUG) where cache["level"] == "debug"''
      ''set(severity_number, SEVERITY_NUMBER_INFO) where cache["level"] == "info"''
      ''set(severity_number, SEVERITY_NUMBER_WARN) where cache["level"] == "warn"''
      ''set(severity_number, SEVERITY_NUMBER_ERROR) where cache["level"] == "error"''
      ''set(severity_number, SEVERITY_NUMBER_FATAL) where cache["level"] == "dpanic" or cache["level"] == "panic" or cache["level"] == "fatal"''
      # A bare Go panic (the collector crashed before zap): its first line.
      ''set(severity_number, SEVERITY_NUMBER_FATAL) where IsString(body) and IsMatch(body, "^panic: ")''

      # ── 3. Source location and error (warnings and above) ─────────────────
      ''merge_maps(cache, ExtractPatterns(cache["caller"], "^(?P<file>[^:]+):(?P<line>[0-9]+)$"), "upsert") where cache["caller"] != nil and severity_number >= SEVERITY_NUMBER_WARN''
      ''set(attributes["code.file.path"], cache["file"]) where cache["file"] != nil''
      ''set(attributes["code.line.number"], Int(cache["line"])) where cache["line"] != nil''
      ''set(attributes["exception.message"], cache["error"]) where IsString(cache["error"])''
    ];
  }];
}
