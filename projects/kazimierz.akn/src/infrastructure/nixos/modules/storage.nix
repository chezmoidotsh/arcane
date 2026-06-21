# ─────────────────────────────────────────────────────────────────────────────
# Persistent state volume — kazimierz.akn
# ─────────────────────────────────────────────────────────────────────────────
# The OS image is immutable and disposable. All mutable data — Pangolin DB/config,
# Traefik ACME certs, Gerbil WireGuard keys — and the operator-provisioned secrets
# live on a separate block volume mounted at /var/lib/kazimierz, so they survive
# reboots and instance recreation (build a new image, recreate the VM, re-attach
# the same volume).
#
# First boot vs re-attach is handled idempotently: the init service only formats
# the volume when it has NO filesystem yet (blkid finds nothing). An existing,
# populated volume is mounted as-is and never reformatted — no data loss on
# recreate.
#
# Volume layout (created by tmpfiles after mount):
#   /var/lib/kazimierz/secrets   — operator secrets, SCP'd once on first run
#   /var/lib/kazimierz/pangolin  — Pangolin working dir (config + db + logs)
#   /var/lib/kazimierz/gerbil    — Gerbil WireGuard key material
#   /var/lib/kazimierz/traefik   — Traefik state (acme.json) — owned by traefik
# ─────────────────────────────────────────────────────────────────────────────
{ config, lib, pkgs, ... }:

let
  label = "kazimierz-data";
  mountPoint = "/var/lib/kazimierz";
in
{
  # ── Format-on-empty ─────────────────────────────────────────────────────────
  # Runs before the mount unit. Idempotent: if the label already exists (volume
  # already formatted), it does nothing; otherwise it picks the first whole disk
  # that is not the root disk and carries no filesystem, and formats it ext4 with
  # our label. Mounting then happens by label (stable across device renames).
  systemd.services.kazimierz-data-init = {
    description = "Initialise the kazimierz data volume (format only if empty)";
    wantedBy = [ "var-lib-kazimierz.mount" ];
    before = [ "var-lib-kazimierz.mount" ];
    after = [ "systemd-udev-settle.service" ];
    wants = [ "systemd-udev-settle.service" ];
    unitConfig.DefaultDependencies = false;
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };
    path = [ pkgs.util-linux pkgs.e2fsprogs pkgs.gawk ];
    script = ''
      set -euo pipefail

      if blkid -L "${label}" >/dev/null 2>&1; then
        echo "data volume already present (label ${label}) — leaving as-is"
        exit 0
      fi

      root_src=$(findmnt -no SOURCE / || true)
      root_disk=$(lsblk -no pkname "$root_src" 2>/dev/null | head -n1 || true)

      candidate=""
      for d in $(lsblk -dno NAME,TYPE | awk '$2=="disk"{print $1}'); do
        [ "$d" = "$root_disk" ] && continue
        if ! blkid "/dev/$d" >/dev/null 2>&1; then
          candidate="/dev/$d"
          break
        fi
      done

      if [ -z "$candidate" ]; then
        echo "no empty non-root disk found to format for the data volume" >&2
        exit 1
      fi

      echo "formatting $candidate as ext4 (label ${label})"
      mkfs.ext4 -q -L "${label}" "$candidate"
      udevadm settle
    '';
  };

  fileSystems.${mountPoint} = {
    device = "/dev/disk/by-label/${label}";
    fsType = "ext4";
    options = [ "nofail" "x-systemd.device-timeout=30s" ];
  };

  # Layout on the mounted volume. Traefik owns its own subdir via StateDirectory
  # (DynamicUser), so it is intentionally NOT created here.
  systemd.tmpfiles.rules = [
    "d ${mountPoint}          0755 root root -"
    "d ${mountPoint}/secrets  0700 root root -"
    "d ${mountPoint}/pangolin 0700 root root -"
    "d ${mountPoint}/gerbil   0700 root root -"
  ];
}
