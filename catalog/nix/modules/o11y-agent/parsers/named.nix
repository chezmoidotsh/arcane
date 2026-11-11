# ─────────────────────────────────────────────────────────────────────────────
# Parser: BIND named text logs → OTel SemConv attributes (logs.parsers = [ "named" ])
# ─────────────────────────────────────────────────────────────────────────────
# A `transform` processor for BIND (service.name "named"). Almost every line is
# a zone transfer pulled by external-dns:
#   client @0x7237d5753c00 10.128.0.21#44296/key external-dns (chezmoi.sh):
#     transfer of 'chezmoi.sh/IN': AXFR ended: 1 messages, 20 records,
#     1040 bytes, 0.002 secs (520000 bytes/sec) (serial 15)
# and the rest are resolver failures:
#   timed out resolving 'github.com/A/IN': 1.1.1.1#53
# The body is kept as-is (original line).
# ─────────────────────────────────────────────────────────────────────────────
{ lib }:

let
  isNamed = ''resource.attributes["service.name"] == "named" and IsString(body)'';
  isClient = ''cache["client_addr"] != nil'';
  isXfr = ''cache["xfr_type"] != nil'';
in
{
  log_statements = [{
    context = "log";
    statements = [
      # ── 1. Client request: peer, TSIG key, zone ───────────────────────────
      ''merge_maps(cache, ExtractPatterns(body, "^client @0x[0-9a-f]+ (?P<client_addr>[0-9a-fA-F.:]+)#(?P<client_port>[0-9]+)(?:/key (?P<key>[^ ]+))?(?: \\((?P<name>[^)]*)\\))?: (?P<rest>.*)$"), "upsert") where ${isNamed} and IsMatch(body, "^client @")''
      ''set(attributes["client.address"], cache["client_addr"]) where ${isClient}''
      ''set(attributes["client.port"], Int(cache["client_port"])) where ${isClient}''
      ''set(attributes["dns.tsig.key"], cache["key"]) where ${isClient} and cache["key"] != nil and cache["key"] != ""''

      # ── 2. Zone transfers (AXFR/IXFR) ─────────────────────────────────────
      ''merge_maps(cache, ExtractPatterns(cache["rest"], "^transfer of '(?P<zone>[^/]+)/(?P<class>[^']+)': (?P<xfr_type>[AI]XFR) (?P<xfr_state>started|ended)"), "upsert") where ${isClient}''
      ''set(attributes["dns.zone"], cache["zone"]) where ${isXfr}''
      ''set(attributes["dns.xfr.type"], cache["xfr_type"]) where ${isXfr}''
      ''set(attributes["dns.xfr.state"], cache["xfr_state"]) where ${isXfr}''
      ''merge_maps(cache, ExtractPatterns(cache["rest"], "\\(serial (?P<serial>[0-9]+)\\)$"), "upsert") where ${isXfr}''
      ''set(attributes["dns.zone.serial"], Int(cache["serial"])) where ${isXfr} and cache["serial"] != nil''
      ''merge_maps(cache, ExtractPatterns(cache["rest"], "ended: [0-9]+ messages, (?P<records>[0-9]+) records, (?P<bytes>[0-9]+) bytes, (?P<secs>[0-9.]+) secs"), "upsert") where ${isXfr} and cache["xfr_state"] == "ended"''
      ''set(attributes["dns.xfr.records"], Int(cache["records"])) where ${isXfr} and cache["records"] != nil''
      ''set(attributes["dns.xfr.bytes"], Int(cache["bytes"])) where ${isXfr} and cache["bytes"] != nil''
      ''set(attributes["dns.xfr.duration"], Double(cache["secs"])) where ${isXfr} and cache["secs"] != nil''

      # ── 3. Resolver failures ──────────────────────────────────────────────
      ''merge_maps(cache, ExtractPatterns(body, "^timed out resolving '(?P<qname>[^/]+)/(?P<qtype>[^/]+)/[^']+': (?P<server>[0-9a-fA-F.:]+)#(?P<server_port>[0-9]+)$"), "upsert") where ${isNamed} and IsMatch(body, "^timed out resolving ")''
      ''set(attributes["dns.question.name"], cache["qname"]) where cache["qname"] != nil''
      ''set(attributes["dns.question.type"], cache["qtype"]) where cache["qname"] != nil''
      ''set(attributes["server.address"], cache["server"]) where cache["qname"] != nil''
      ''set(attributes["server.port"], Int(cache["server_port"])) where cache["qname"] != nil''
      ''set(severity_number, SEVERITY_NUMBER_WARN) where cache["qname"] != nil''
    ];
  }];
}
