# ─────────────────────────────────────────────────────────────────────────────
# Parser: Dex logfmt logs → OTel SemConv attributes (logs.parsers = [ "dex" ])
# ─────────────────────────────────────────────────────────────────────────────
# A `transform` processor for Dex (service.name "dex"), which logs Go slog
# logfmt lines:
#   time=… level=INFO msg="login successful" connector_id=local username=admin
#   email=admin@chezmoi.sh request_id=…
#   time=… level=ERROR msg="failed to get signing algorithm" err="…"
# The body is kept as-is (original line).
# ─────────────────────────────────────────────────────────────────────────────
{ lib }:

{
  log_statements = [{
    context = "log";
    statements = [
      # ── 1. Parse the logfmt body ──────────────────────────────────────────
      ''merge_maps(cache, ParseKeyValue(body), "upsert") where resource.attributes["service.name"] == "dex" and IsString(body) and IsMatch(body, "^time=")''

      # ── 2. Severity ───────────────────────────────────────────────────────
      ''set(severity_number, SEVERITY_NUMBER_DEBUG) where cache["level"] == "DEBUG"''
      ''set(severity_number, SEVERITY_NUMBER_INFO) where cache["level"] == "INFO"''
      ''set(severity_number, SEVERITY_NUMBER_WARN) where cache["level"] == "WARN"''
      ''set(severity_number, SEVERITY_NUMBER_ERROR) where cache["level"] == "ERROR"''

      # ── 3. Error, user and request ────────────────────────────────────────
      ''set(attributes["exception.message"], cache["err"]) where cache["err"] != nil''
      ''set(attributes["user.name"], cache["username"]) where cache["username"] != nil''
      ''set(attributes["user.email"], cache["email"]) where cache["email"] != nil''
      ''set(attributes["dex.connector_id"], cache["connector_id"]) where cache["connector_id"] != nil''
      ''set(attributes["dex.request_id"], cache["request_id"]) where cache["request_id"] != nil''
    ];
  }];
}
