# OCI Always Free A1 (aarch64): UEFI, boot volume paravirtualized -> /dev/sda.
{ lib, ... }:
{
  # Binding IP = private (VCN) address of the instance. Written by `mise run nixos:binding-ip` (Pulumi output) into the
  # git-ignored extra/, which nixos-anywhere also copies onto the host. Empty when missing: the build then refuses it.
  pangolin.bindIp =
    let f = ../extra/etc/pangolin/binding-ip;
    in if builtins.pathExists f then lib.removeSuffix "
" (builtins.readFile f) else "";

  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  boot.initrd.availableKernelModules = [ "virtio_pci" "virtio_scsi" "sd_mod" "nvme" ];
  boot.kernelParams = [ "console=ttyAMA0" ];

  disko.devices.disk.main = {
    device = "/dev/sda";
    type = "disk";
    content = {
      type = "gpt";
      partitions = {
        ESP = {
          size = "512M";
          type = "EF00";
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
