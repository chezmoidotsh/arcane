# ─────────────────────────────────────────────────────────────────────────────
# Persistent state volume
# ─────────────────────────────────────────────────────────────────────────────
# The OS disk is disposable (rebuilt image on every update, see flake.nix).
# All mutable Pangolin/Gerbil/Traefik state -- config.yml, the sqlite db,
# Gerbil's WireGuard key, Let's Encrypt certs, the GeoIP database -- lives on
# a second block volume instead, decoupled from the instance's own lifecycle
# (stack/oci/instance.ts's Volume + VolumeAttachment).
#
# Mounted directly at /var/lib/pangolin -- the module's own default dataDir
# (pangolin.nix doesn't override it) -- so every path the module already
# creates under there (config/, config/letsencrypt/, …) transparently lands
# on the persistent volume with no per-directory bind-mount needed.
#
# device references the second virtio block device directly (/dev/vdb) --
# both targets attach the persistent volume as the second disk: Proxmox's
# validation setup (a scratch disk standing in for the real volume, see
# README.md) and OCI's paravirtualized attachment (which OCI itself exposes
# as /dev/oracleoci/oraclevdb, a udev alias over the same underlying
# virtio-blk device). UNVERIFIED against real hardware -- issue 1077 calls
# this out as the highest-risk unknown; prototype on both targets before
# trusting this blindly on a production recreate.
#
# autoFormat handles first boot: if blkid finds no filesystem on the device,
# systemd (x-systemd.makefs) formats it ext4 before mounting -- no custom mkfs
# flags (e.g. a label) are possible here, systemd-makefs doesn't support any
# (fileSystems.<name>.formatOptions was removed upstream for exactly that
# reason). Re-attaching an already-formatted volume (the normal "recreate
# instance, keep the volume" path) is a no-op -- blkid finds the existing
# filesystem and skips reformatting; the module's own tmpfiles rules
# (10-fossorial-paths) recreate any *missing* subdirectory but never touch
# files that already exist, so existing state survives.
{ ... }:

{
  fileSystems."/var/lib/pangolin" = {
    device = "/dev/vdb";
    fsType = "ext4";
    autoFormat = true;
  };
}
