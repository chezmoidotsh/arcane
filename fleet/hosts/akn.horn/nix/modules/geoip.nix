# GeoLite2 databases used by Pangolin, refreshed nightly: Country for the country rules and ASN for the ASN rules
# (https://docs.pangolin.net/self-host/advanced/enable-asn-lookup).
#
# Source: github.com/GitSquared/node-geolite2-redist, a community mirror (no MaxMind account or license key involved;
# accepted knowingly, see the former roles/pangolin/tasks/geoip.yml). Revisit if the mirror proves unreliable.
{ pkgs, ... }:
let
  geoipDir = "/var/lib/pangolin/config/geoip";
in
{
  systemd.services.pangolin-geoip-update = {
    description = "Refresh the GeoLite2 databases (Country and ASN) used by Pangolin";
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
      for edition in Country ASN; do
        curl -fsSL --retry 3 -o "$tmp/$edition.tar.gz" \
          https://github.com/GitSquared/node-geolite2-redist/raw/refs/heads/master/redist/GeoLite2-$edition.tar.gz
        mkdir "$tmp/$edition"
        tar -xzf "$tmp/$edition.tar.gz" -C "$tmp/$edition"
        mmdb=$(find "$tmp/$edition" -name GeoLite2-$edition.mmdb | head -n1)
        test -n "$mmdb"
        # Atomic replacement: Pangolin never sees a half-written file.
        install -m 0644 "$mmdb" ${geoipDir}/.GeoLite2-$edition.mmdb.new
        mv ${geoipDir}/.GeoLite2-$edition.mmdb.new ${geoipDir}/GeoLite2-$edition.mmdb
      done
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
