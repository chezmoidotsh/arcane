# GeoLite2-Country database used by Pangolin's geoblocking, refreshed nightly.
#
# Source: github.com/GitSquared/node-geolite2-redist, a community mirror (no MaxMind account or license key involved;
# accepted knowingly, see the former roles/pangolin/tasks/geoip.yml). Revisit if the mirror proves unreliable.
{ pkgs, ... }:
let
  geoipDir = "/var/lib/pangolin/config/geoip";
in
{
  systemd.services.pangolin-geoip-update = {
    description = "Refresh the GeoLite2-Country database used by Pangolin";
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    # Seeds the database on first boot, before Pangolin needs it.
    wantedBy = [ "multi-user.target" ];
    before = [ "docker-pangolin.service" ];
    path = with pkgs; [ curl gnutar gzip findutils coreutils ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = false;
    };
    script = ''
      set -euo pipefail
      mkdir -p ${geoipDir}
      tmp=$(mktemp -d)
      trap 'rm -rf "$tmp"' EXIT
      curl -fsSL --retry 3 -o "$tmp/geo.tar.gz" \
        https://github.com/GitSquared/node-geolite2-redist/raw/refs/heads/master/redist/GeoLite2-Country.tar.gz
      tar -xzf "$tmp/geo.tar.gz" -C "$tmp"
      mmdb=$(find "$tmp" -name GeoLite2-Country.mmdb | head -n1)
      test -n "$mmdb"
      # Atomic replacement: Pangolin never sees a half-written file.
      install -m 0644 "$mmdb" ${geoipDir}/.GeoLite2-Country.mmdb.new
      mv ${geoipDir}/.GeoLite2-Country.mmdb.new ${geoipDir}/GeoLite2-Country.mmdb
    '';
  };

  systemd.timers.pangolin-geoip-update = {
    wantedBy = [ "timers.target" ];
    timerConfig = {
      OnCalendar = "*-*-* 02:15:00";
      Persistent = true;
    };
  };
}
