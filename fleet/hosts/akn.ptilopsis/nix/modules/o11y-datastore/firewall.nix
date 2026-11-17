# ─────────────────────────────────────────────────────────────────────────────
# Firewall — a pf anchor that limits TCP 443 and 4318 to the LAN.
# ─────────────────────────────────────────────────────────────────────────────
# The application firewall cannot filter by source address, so pf does it:
# loopback and `allowedSources` pass, everything else is dropped. Nothing is
# authenticated on these ports: this is the access control.
# ─────────────────────────────────────────────────────────────────────────────
{ config, lib, pkgs, o11y, ... }:

let
  sources = lib.concatStringsSep ", " config.services.o11yDatastore.allowedSources;

  rules = pkgs.writeText "o11y-datastore.pf" ''
    pass in quick on lo0 proto tcp to any port { 443, 4318 }
    pass in quick proto tcp from { ${sources} } to any port { 443, 4318 }
    block drop in quick proto tcp to any port { 443, 4318 }
  '';

  # Loads the macOS main ruleset when pf runs without it (its `anchor
  # "com.apple/*"` evaluates ours), enables pf, then (re)loads the anchor.
  # Idempotent: run at boot, every 5 minutes, and whenever the rules change
  # (their store path is in the plist).
  load = pkgs.writeShellScript "o11y-datastore-pf" ''
    set -eu
    /sbin/pfctl -s rules 2>/dev/null | /usr/bin/grep -q 'anchor "com.apple/\*"' \
      || /sbin/pfctl -q -f /etc/pf.conf
    /sbin/pfctl -s info 2>/dev/null | /usr/bin/grep -q 'Status: Enabled' || /sbin/pfctl -q -E
    exec /sbin/pfctl -q -a com.apple/o11y-datastore -f ${rules}
  '';
in
{
  launchd.daemons.o11y-datastore-pf.serviceConfig = {
    ProgramArguments = [ "${load}" ];
    RunAtLoad = true;
    StartInterval = 300;
    StandardErrorPath = o11y.log "pf";
  };
}
