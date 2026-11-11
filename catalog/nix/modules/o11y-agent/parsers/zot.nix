# ─────────────────────────────────────────────────────────────────────────────
# Parser: Zot zerolog JSON logs → OTel SemConv attributes (logs.parsers = [ "zot" ])
# ─────────────────────────────────────────────────────────────────────────────
# A `transform` processor for Zot (service.name "zot"), which logs zerolog JSON:
#   {"time":"…","level":"info","message":"…","component":"cve",
#    "caller":"zotregistry.dev/zot/v2/pkg/…/scan.go:161","func":"…","error":"…"}
# Depending on the event, zot adds the image it is working on:
#   on-demand sync  {"message":"sync: syncing image","remote":"ghcr.io",
#                    "repo":"ghcr.io/stefanprodan/podinfo","reference":"6.7.1"}
#                   {"message":"syncing image","remote image":"…@sha256:…",
#                    "local image":"ghcr.io/stefanprodan/podinfo:6.7.1"}
#   retention / gc  {"module":"retention","repository":"…","tag":"v1.1.0",
#                    "digest":"sha256:…","decision":"keep","reason":"…"}
#   HTTP API        {"module":"http","clientIP":"127.0.0.1:35998","method":"GET",
#                    "path":"/v2/<repo>/manifests/<ref>","statusCode":200,
#                    "bodySize":2385,"headers":{"User-Agent":["…"]}}
# The image ends up in oci.repository / oci.reference / oci.manifest.digest,
# whatever field zot used, so one filter finds every event of an image.
# Non-JSON lines (download progress bars) are left untouched. The body is kept
# as-is (original JSON).
# ─────────────────────────────────────────────────────────────────────────────
{ lib }:

let
  isHttp = ''cache["module"] == "http" and cache["path"] != nil'';
in
{
  log_statements = [{
    context = "log";
    statements = [
      # ── 1. Parse the JSON body ────────────────────────────────────────────
      ''merge_maps(cache, ParseJSON(body), "upsert") where resource.attributes["service.name"] == "zot" and IsString(body) and IsMatch(body, "^\\{")''

      # ── 2. Severity ───────────────────────────────────────────────────────
      ''set(severity_number, SEVERITY_NUMBER_TRACE) where cache["level"] == "trace"''
      ''set(severity_number, SEVERITY_NUMBER_DEBUG) where cache["level"] == "debug"''
      ''set(severity_number, SEVERITY_NUMBER_INFO) where cache["level"] == "info"''
      ''set(severity_number, SEVERITY_NUMBER_WARN) where cache["level"] == "warn"''
      ''set(severity_number, SEVERITY_NUMBER_ERROR) where cache["level"] == "error"''
      ''set(severity_number, SEVERITY_NUMBER_FATAL) where cache["level"] == "fatal" or cache["level"] == "panic"''
      ''set(severity_text, ToUpperCase(cache["level"])) where cache["level"] != nil''

      # ── 3. Error and component ─────────────────────────────────────────────
      ''set(attributes["exception.message"], cache["error"]) where cache["error"] != nil''
      ''set(attributes["zot.component"], cache["component"]) where cache["component"] != nil''
      ''set(attributes["zot.module"], cache["module"]) where cache["module"] != nil''

      # ── 4. Image: repository, reference (tag or digest), digest ───────────
      # Trivy (CVE scan) logs its own "repository" (the distro release, e.g.
      # "3.16"): only zot's own callers name an image.
      ''set(attributes["oci.repository"], cache["repository"]) where cache["repository"] != nil and not IsMatch(cache["caller"], "aquasecurity/trivy")''
      ''set(attributes["oci.repository"], cache["repo"]) where cache["repo"] != nil''
      ''set(attributes["oci.reference"], cache["reference"]) where cache["reference"] != nil''
      ''set(attributes["oci.reference"], cache["tag"]) where cache["tag"] != nil''
      ''set(attributes["oci.manifest.digest"], cache["digest"]) where cache["digest"] != nil and cache["source"] == nil''

      # ── 5. Sync (mirroring): upstream registry and image ──────────────────
      ''set(attributes["zot.sync.remote"], cache["remote"]) where cache["remote"] != nil''
      ''set(attributes["zot.sync.remote_image"], cache["remote image"]) where cache["remote image"] != nil''
      ''set(attributes["zot.sync.remote_image"], cache["source"]) where cache["source"] != nil''

      # ── 6. Retention ──────────────────────────────────────────────────────
      ''set(attributes["zot.retention.decision"], cache["decision"]) where cache["decision"] != nil''
      ''set(attributes["zot.retention.reason"], cache["reason"]) where cache["reason"] != nil''
      ''set(attributes["zot.gc.count"], Int(cache["count"])) where cache["module"] == "gc" and cache["count"] != nil''

      # ── 7. HTTP API (the client is Caddy on loopback) ─────────────────────
      ''set(attributes["http.request.method"], cache["method"]) where ${isHttp}''
      ''set(attributes["url.path"], cache["path"]) where ${isHttp}''
      ''set(attributes["http.response.status_code"], Int(cache["statusCode"])) where ${isHttp} and cache["statusCode"] != nil''
      ''set(attributes["http.response.body.size"], Int(cache["bodySize"])) where ${isHttp} and cache["bodySize"] != nil''
      ''set(attributes["user_agent.original"], cache["headers"]["User-Agent"][0]) where ${isHttp} and cache["headers"]["User-Agent"] != nil''
      ''merge_maps(cache, ExtractPatterns(cache["clientIP"], "^(?P<peer_addr>.+):(?P<peer_port>[0-9]+)$"), "upsert") where ${isHttp} and cache["clientIP"] != nil''
      ''set(attributes["network.peer.address"], cache["peer_addr"]) where ${isHttp} and cache["peer_addr"] != nil''
      ''set(attributes["network.peer.port"], Int(cache["peer_port"])) where ${isHttp} and cache["peer_port"] != nil''
      ''merge_maps(cache, ExtractPatterns(cache["path"], "^/v2/(?P<api_repo>.+)/(?:manifests|blobs|tags)/(?P<api_ref>[^/]+)$"), "upsert") where ${isHttp}''
      ''set(attributes["oci.repository"], cache["api_repo"]) where ${isHttp} and cache["api_repo"] != nil''
      ''set(attributes["oci.reference"], cache["api_ref"]) where ${isHttp} and cache["api_ref"] != nil and IsMatch(cache["path"], "/manifests/")''
    ];
  }];
}
