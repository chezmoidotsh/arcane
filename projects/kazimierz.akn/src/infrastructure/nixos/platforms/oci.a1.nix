# OCI Always Free A1 (aarch64): UEFI, boot volume paravirtualized -> /dev/sda.
{ lib, ... }:
{
  # Private (VCN) address of the instance, exported by the Pulumi stack: `pulumi stack output privateIp > private-ip`.
  pangolin.bindIp = lib.removeSuffix "\n" (builtins.readFile ../private-ip);

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
