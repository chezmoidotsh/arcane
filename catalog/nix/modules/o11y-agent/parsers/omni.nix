# ─────────────────────────────────────────────────────────────────────────────
# Parser: Omni zap JSON logs → OTel SemConv attributes (logs.parsers = [ "omni" ])
# ─────────────────────────────────────────────────────────────────────────────
# A `transform` processor for Omni (service.name "omni"), which logs zap JSON:
#   {"level":"warn","ts":…,"caller":"omni/etcd_backup.go:438","msg":"…",
#    "component":"omni_runtime","controller":"EtcdBackupController",
#    "cluster":"lungmen-akn","error":"…"}
# gRPC call logs add "system":"grpc","grpc.service","grpc.method","grpc.code",
# "peer.address","user_agent". COSI controller logs add the resource being
# reconciled: "namespace","type","id". The Omni infra providers
# (service.name "omni-infra-provider-*") log the same zap JSON, and print a
# plain `Error: …` line when they exit on a fatal error. The body is kept as-is
# (original JSON).
# ─────────────────────────────────────────────────────────────────────────────
{ lib }:

let
  isOmni = ''IsMatch(resource.attributes["service.name"], "^omni(-infra-provider-.+)?$") and IsString(body)'';
  isOmniJson = ''${isOmni} and IsMatch(body, "^\\{")'';
  isGrpc = ''cache["system"] == "grpc"'';
in
{
  log_statements = [{
    context = "log";
    statements = [
      # ── 1. Parse the JSON body ────────────────────────────────────────────
      ''merge_maps(cache, ParseJSON(body), "upsert") where ${isOmniJson}''

      # ── 2. Severity ───────────────────────────────────────────────────────
      ''set(severity_number, SEVERITY_NUMBER_DEBUG) where cache["level"] == "debug"''
      ''set(severity_number, SEVERITY_NUMBER_INFO) where cache["level"] == "info"''
      ''set(severity_number, SEVERITY_NUMBER_WARN) where cache["level"] == "warn"''
      ''set(severity_number, SEVERITY_NUMBER_ERROR) where cache["level"] == "error"''
      ''set(severity_number, SEVERITY_NUMBER_FATAL) where cache["level"] == "dpanic" or cache["level"] == "panic" or cache["level"] == "fatal"''

      # ── 3. Error, and source location of errors only ──────────────────────
      ''set(attributes["exception.message"], cache["error"]) where cache["error"] != nil''
      ''merge_maps(cache, ExtractPatterns(cache["caller"], "^(?P<file>[^:]+):(?P<line>[0-9]+)$"), "upsert") where cache["caller"] != nil and severity_number >= SEVERITY_NUMBER_ERROR''
      ''set(attributes["code.file.path"], cache["file"]) where cache["file"] != nil''
      ''set(attributes["code.line.number"], Int(cache["line"])) where cache["line"] != nil''

      # ── 4. Omni context (vendor namespace) ────────────────────────────────
      ''set(attributes["omni.component"], cache["component"]) where cache["component"] != nil''
      ''set(attributes["omni.controller"], cache["controller"]) where cache["controller"] != nil''
      ''set(attributes["omni.cluster"], cache["cluster"]) where cache["cluster"] != nil''
      ''set(attributes["omni.resource.namespace"], cache["namespace"]) where cache["namespace"] != nil''
      ''set(attributes["omni.resource.type"], cache["type"]) where cache["type"] != nil''
      ''set(attributes["omni.resource.id"], cache["id"]) where cache["id"] != nil''

      # ── 4b. Fatal exit of an infra provider (plain text) ──────────────────
      ''set(severity_number, SEVERITY_NUMBER_FATAL) where ${isOmni} and IsMatch(body, "^Error: ")''
      ''set(attributes["exception.message"], Substring(body, 7, Len(body) - 7)) where ${isOmni} and IsMatch(body, "^Error: ")''

      # ── 5. rpc.* (gRPC call logs) ─────────────────────────────────────────
      ''set(attributes["rpc.system"], "grpc") where ${isGrpc}''
      ''set(attributes["rpc.service"], cache["grpc.service"]) where ${isGrpc} and cache["grpc.service"] != nil''
      ''set(attributes["rpc.method"], cache["grpc.method"]) where ${isGrpc} and cache["grpc.method"] != nil''
      ''set(attributes["rpc.grpc.status_code_name"], cache["grpc.code"]) where ${isGrpc} and cache["grpc.code"] != nil''
      ''set(attributes["user_agent.original"], cache["user_agent"]) where ${isGrpc} and cache["user_agent"] != nil''
      ''set(attributes["client.address"], cache["peer.address"]) where ${isGrpc} and cache["peer.address"] != nil''
    ];
  }];
}
