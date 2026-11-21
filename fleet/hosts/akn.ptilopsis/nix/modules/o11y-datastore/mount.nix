# ─────────────────────────────────────────────────────────────────────────────
# Data volume — keeps the dedicated APFS volume mounted on dataDir.
# ─────────────────────────────────────────────────────────────────────────────
# The /etc/fstab entry mounts the volume at boot, then apfs_boot_util (started
# by launchd) unmounts it about a minute later, as it is neither a System nor a
# Data volume (seen on macOS 27.2.1). Without it every daemon fails with
# EX_CONFIG: its working directory is not there. So the volume is mounted by a
# daemon, which is also what brings it back after an unmount.
#
# The volume is found by its UUID (`diskutil info`, shown by `diskutil
# apfs list`), not its disk identifier, which changes between boots. It is
# mounted with `diskutil mount`, which asks diskarbitrationd to do it: running
# mount_apfs from here fails with `deny file-read-data /dev/diskNsM`, as macOS
# keeps raw disk reads to binaries with Full Disk Access, which a store path
# would lose at each rebuild. As with fstab, the volume ignores ownership.
# launchd has no ordering: the other daemons fail and are restarted every 5 s
# until the volume is there, which is expected.
# ─────────────────────────────────────────────────────────────────────────────
{ config, lib, pkgs, o11y, ... }:

let
  cfg = config.services.o11yDatastore;

  # Idempotent: run at boot and every 15 seconds. Nothing to do while mounted.
  mountVolume = pkgs.writeShellScript "o11y-datastore-mount" ''
    set -eu
    dir=${lib.escapeShellArg cfg.dataDir}
    /sbin/mount | /usr/bin/grep -qF " on $dir (" && exit 0
    dev=$(/usr/sbin/diskutil info -plist ${lib.escapeShellArg cfg.volumeUuid} \
      | /usr/bin/plutil -extract DeviceIdentifier raw -o - -)
    [ -d "$dir" ] || /bin/mkdir -p "$dir"
    echo "$(/bin/date '+%Y-%m-%dT%H:%M:%S') mounting /dev/$dev on $dir"
    exec /usr/sbin/diskutil mount -mountPoint "$dir" "$dev"
  '';
in
{
  config = lib.mkIf (cfg.volumeUuid != null) {
    launchd.daemons.o11y-datastore-mount.serviceConfig = {
      ProgramArguments = o11y.waiting { } [ "${mountVolume}" ];
      RunAtLoad = true;
      StartInterval = 15;
      StandardOutPath = o11y.log "mount";
      StandardErrorPath = o11y.log "mount";
    };

    catalog.darwinLogTrim.files = [ (o11y.log "mount") ];
  };
}
