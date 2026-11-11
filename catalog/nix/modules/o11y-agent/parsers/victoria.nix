# ─────────────────────────────────────────────────────────────────────────────
# Parser: VictoriaMetrics/Logs/Traces + vmalert JSON logs → OTel SemConv
#         attributes (logs.parsers = [ "victoria" ])
# ─────────────────────────────────────────────────────────────────────────────
# A `transform` processor for the Victoria binaries (service.name
# "victoria-metrics", "victoria-logs", "victoria-traces", "vmalert") started
# with -loggerFormat=json:
#   {"ts":"…","level":"info","caller":"VictoriaLogs/app/…/main.go:44","msg":"…"}
# Failed HTTP requests are logged as warnings whose msg carries the client and
# the request:
#   remoteAddr: "127.0.0.1:36732, X-Forwarded-For: 192.168.10.34";
#   requestURI: /select/logsql/query?query=foo:(; cannot parse `query` arg …
# The body is kept as-is (original JSON).
# ─────────────────────────────────────────────────────────────────────────────
{ lib }:

let
  hasRequest = ''cache["remote"] != nil'';
in
{
  log_statements = [{
    context = "log";
    statements = [
      # ── 1. Parse the JSON body ────────────────────────────────────────────
      ''merge_maps(cache, ParseJSON(body), "upsert") where IsMatch(resource.attributes["service.name"], "^(victoria-|vmalert)") and IsString(body) and IsMatch(body, "^\\{")''

      # ── 2. Severity ───────────────────────────────────────────────────────
      ''set(severity_number, SEVERITY_NUMBER_INFO) where cache["level"] == "info"''
      ''set(severity_number, SEVERITY_NUMBER_WARN) where cache["level"] == "warn"''
      ''set(severity_number, SEVERITY_NUMBER_ERROR) where cache["level"] == "error"''
      ''set(severity_number, SEVERITY_NUMBER_FATAL) where cache["level"] == "fatal" or cache["level"] == "panic"''

      # ── 3. Source location (errors only) ──────────────────────────────────
      ''merge_maps(cache, ExtractPatterns(cache["caller"], "^(?P<file>[^:]+):(?P<line>[0-9]+)$"), "upsert") where cache["caller"] != nil and severity_number >= SEVERITY_NUMBER_ERROR''
      ''set(attributes["code.file.path"], cache["file"]) where cache["file"] != nil''
      ''set(attributes["code.line.number"], Int(cache["line"])) where cache["line"] != nil''

      # ── 4. Failed request: client, URL and error ──────────────────────────
      ''merge_maps(cache, ExtractPatterns(cache["msg"], "^remoteAddr: \"(?P<remote>[^\"]*)\"; requestURI: (?P<uri>[^ ;]*); (?P<err>.*)$"), "upsert") where cache["msg"] != nil and IsMatch(cache["msg"], "^remoteAddr: ")''
      ''merge_maps(cache, ExtractPatterns(cache["remote"], "^(?P<peer_addr>[^,]+):(?P<peer_port>[0-9]+)(?:, X-Forwarded-For: (?P<xff>.+))?$"), "upsert") where ${hasRequest}''
      ''set(attributes["network.peer.address"], cache["peer_addr"]) where ${hasRequest} and cache["peer_addr"] != nil''
      ''set(attributes["network.peer.port"], Int(cache["peer_port"])) where ${hasRequest} and cache["peer_port"] != nil''
      # X-Forwarded-For may be a list: the first entry is the original client.
      ''set(attributes["client.address"], Trim(Split(cache["xff"], ",")[0])) where ${hasRequest} and cache["xff"] != nil and cache["xff"] != ""''
      ''merge_maps(cache, ExtractPatterns(cache["uri"], "^(?P<path>[^?#]*)(?:\\?(?P<query>[^#]*))?"), "upsert") where ${hasRequest}''
      ''set(attributes["url.path"], cache["path"]) where ${hasRequest}''
      ''set(attributes["url.query"], cache["query"]) where ${hasRequest} and cache["query"] != nil and cache["query"] != ""''
      ''set(attributes["exception.message"], cache["err"]) where ${hasRequest}''
    ];
  }];
}
