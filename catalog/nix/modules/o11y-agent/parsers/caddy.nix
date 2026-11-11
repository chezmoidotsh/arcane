# ─────────────────────────────────────────────────────────────────────────────
# Parser: Caddy JSON logs → OTel SemConv attributes (logs.parsers = [ "caddy" ])
# ─────────────────────────────────────────────────────────────────────────────
# A `transform` processor. Only Caddy records (service.name "caddy") with a JSON
# body are touched, and the body itself is kept as-is (original JSON, still
# unpackable at query time). Step 1 parses the JSON into `cache`; every other
# statement reads from `cache`.
#
# Access logs ("logger": "http.log.access") look like:
#   {"level":"info","logger":"http.log.access","status":200,"size":78,
#    "bytes_read":79,"duration":0.0017,"user_id":"",
#    "request":{"method":"GET","host":"…","uri":"/a?b=c","proto":"HTTP/2.0",
#               "client_ip":"…","remote_ip":"…","remote_port":"…",
#               "headers":{"User-Agent":["…"]},"tls":{"version":772,"server_name":"…"}}}
# ─────────────────────────────────────────────────────────────────────────────
{ lib }:

let
  isCaddyJson = ''resource.attributes["service.name"] == "caddy" and IsString(body) and IsMatch(body, "^\\{")'';
  isAccess = ''cache["logger"] == "http.log.access"'';
  hasTls = ''cache["logger"] == "http.log.access" and cache["request"]["tls"] != nil'';
in
{
  log_statements = [{
    context = "log";
    statements = [
      # ── 1. Parse the JSON body ────────────────────────────────────────────
      ''merge_maps(cache, ParseJSON(body), "upsert") where ${isCaddyJson}''

      # ── 2. Severity (every Caddy log) ─────────────────────────────────────
      ''set(severity_number, SEVERITY_NUMBER_DEBUG) where cache["level"] == "debug"''
      ''set(severity_number, SEVERITY_NUMBER_INFO) where cache["level"] == "info"''
      ''set(severity_number, SEVERITY_NUMBER_WARN) where cache["level"] == "warn"''
      ''set(severity_number, SEVERITY_NUMBER_ERROR) where cache["level"] == "error"''
      ''set(severity_number, SEVERITY_NUMBER_FATAL) where cache["level"] == "panic" or cache["level"] == "fatal"''
      ''set(attributes["exception.message"], cache["error"]) where cache["error"] != nil''

      # ── 3. http.* ─────────────────────────────────────────────────────────
      ''set(attributes["http.request.method"], cache["request"]["method"]) where ${isAccess}''
      ''set(attributes["http.response.status_code"], Int(cache["status"])) where ${isAccess}''
      ''set(attributes["http.request.body.size"], Int(cache["bytes_read"])) where ${isAccess}''
      ''set(attributes["http.response.body.size"], Int(cache["size"])) where ${isAccess}''
      ''set(attributes["caddy.request.duration"], cache["duration"]) where ${isAccess}''

      # ── 4. url.* — uri split into path and query ──────────────────────────
      ''merge_maps(cache, ExtractPatterns(cache["request"]["uri"], "^(?P<path>[^?#]*)(?:\\?(?P<query>[^#]*))?"), "upsert") where ${isAccess}''
      ''set(attributes["url.path"], cache["path"]) where ${isAccess}''
      ''set(attributes["url.query"], cache["query"]) where ${isAccess} and cache["query"] != ""''
      ''set(attributes["url.scheme"], "http") where ${isAccess}''
      ''set(attributes["url.scheme"], "https") where ${hasTls}''
      ''set(attributes["url.full"], Concat([attributes["url.scheme"], "://", cache["request"]["host"], cache["request"]["uri"]], "")) where ${isAccess}''

      # ── 5. user_agent.* and user.* ────────────────────────────────────────
      ''set(attributes["user_agent.original"], cache["request"]["headers"]["User-Agent"][0]) where ${isAccess} and cache["request"]["headers"]["User-Agent"] != nil''
      ''set(attributes["user.id"], cache["user_id"]) where ${isAccess} and cache["user_id"] != ""''

      # ── 6. client / server / network.* ────────────────────────────────────
      ''set(attributes["server.address"], cache["request"]["host"]) where ${isAccess}''
      ''set(attributes["client.address"], cache["request"]["client_ip"]) where ${isAccess}''
      ''set(attributes["network.peer.address"], cache["request"]["remote_ip"]) where ${isAccess}''
      ''set(attributes["network.peer.port"], Int(cache["request"]["remote_port"])) where ${isAccess}''
      ''merge_maps(cache, ExtractPatterns(cache["request"]["proto"], "^(?P<proto_name>[A-Za-z]+)/(?P<proto_version>[0-9.]+)$"), "upsert") where ${isAccess}''
      ''set(attributes["network.protocol.name"], ToLowerCase(cache["proto_name"])) where ${isAccess}''
      ''set(attributes["network.protocol.version"], cache["proto_version"]) where ${isAccess}''

      # ── 7. tls.* ──────────────────────────────────────────────────────────
      ''set(attributes["tls.protocol.name"], "tls") where ${hasTls}''
      ''set(attributes["tls.protocol.version"], "1.2") where ${hasTls} and Int(cache["request"]["tls"]["version"]) == 771''
      ''set(attributes["tls.protocol.version"], "1.3") where ${hasTls} and Int(cache["request"]["tls"]["version"]) == 772''
      ''set(attributes["tls.client.server_name"], cache["request"]["tls"]["server_name"]) where ${hasTls} and cache["request"]["tls"]["server_name"] != ""''
    ];
  }];
}
