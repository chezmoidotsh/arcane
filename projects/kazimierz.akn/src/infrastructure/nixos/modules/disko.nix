# ─────────────────────────────────────────────────────────────────────────────
# Root disk layout for nixos-anywhere (EXPERIMENTAL -- not yet wired into the
# production nixosConfigurations.kazimierz or packages.*.default outputs).
# ─────────────────────────────────────────────────────────────────────────────
# Only meaningful together with disko's own NixOS module (disko.nixosModules.disko),
# which nixos-anywhere's --flake target must import. GPT + ESP + ext4 root on
# /dev/vda -- confirmed to be the actual device name for a virtio-blk root
# disk both on a Proxmox test VM (this experiment) and, per Oracle's own
# docs, on OCI's paravirtualized attachment.
#
# storage.nix's separate /var/lib/pangolin mount on /dev/vdb is untouched --
# disko only owns the disk(s) listed here.
{ ... }:

{
  # nixos-generators' qcow-efi format injects its own bootloader config for
  # the packages.*.default outputs -- this module isn't imported there, so
  # setting systemd-boot here doesn't conflict with it.
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  disko.devices.disk.main = {
    device = "/dev/vda";
    type = "disk";
    content = {
      type = "gpt";
      partitions = {
        ESP = {
          type = "EF00";
          size = "500M";
          content = {
            type = "filesystem";
            format = "vfat";
            mountpoint = "/boot";
            mountOptions = [ "umask=0077" ];
          };
        };
        root = {
          size = "100%";
          content = {
            type = "filesystem";
            format = "ext4";
            mountpoint = "/";
          };
        };
      };
    };
  };
}
