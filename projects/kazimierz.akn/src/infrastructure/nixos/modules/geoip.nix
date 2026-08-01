# ─────────────────────────────────────────────────────────────────────────────
# GeoIP database for Pangolin's GeoRestriction (CrowdSec's replacement)
# ─────────────────────────────────────────────────────────────────────────────
# Ported from the Ansible role's update-geoip.sh.j2 + geoip-update.service/
# timer.j2 (projects/kazimierz.akn/src/infrastructure/ansible/roles/pangolin/).
# Same public mirror, no MaxMind account/license key needed.
#
# Unlike the Ansible version (download only if missing, via `creates:`),
# this runs on every boot (OnBootSec) in addition to the daily refresh
# (OnCalendar) -- cheap and idempotent, and it means a freshly recreated
# instance never starts with a missing database while waiting for the
# first daily tick.
{ pkgs, ... }:

let
  geoipUrl = "https://github.com/GitSquared/node-geolite2-redist/raw/refs/heads/master/redist/GeoLite2-Country.tar.gz";
  destDir = "/var/lib/pangolin/config/geoip";
in
{
  systemd.services.pangolin-geoip-update = {
    description = "Update Pangolin GeoIP database";
    after = [ "var-lib-pangolin.mount" ];
    requires = [ "var-lib-pangolin.mount" ];
    path = with pkgs; [ curl gnutar gzip coreutils ];
    serviceConfig.Type = "oneshot";
    script = ''
      set -euo pipefail
      mkdir -p ${destDir}
      tmp=$(mktemp -d)
      trap 'rm -rf "$tmp"' EXIT
      curl -fsSL -o "$tmp/GeoLite2-Country.tar.gz" "${geoipUrl}"
      tar -xzf "$tmp/GeoLite2-Country.tar.gz" -C "$tmp"
      find "$tmp" -name GeoLite2-Country.mmdb -exec mv {} ${destDir}/GeoLite2-Country.mmdb \;
    '';
  };

  systemd.timers.pangolin-geoip-update = {
    description = "Run Pangolin GeoIP database update daily";
    wantedBy = [ "timers.target" ];
    timerConfig = {
      OnBootSec = "5min";
      OnCalendar = "*-*-* 03:00:00";
      RandomizedDelaySec = 1800;
      Persistent = true;
    };
  };
}
