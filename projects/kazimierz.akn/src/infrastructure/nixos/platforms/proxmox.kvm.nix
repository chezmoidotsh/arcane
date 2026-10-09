# Generic x86_64 VM (Proxmox/KVM) booting in legacy BIOS mode, disk at /dev/sda. Used to rehearse the install
# procedure on a test machine; not what runs in production (see oci.a1.nix).
{ lib, ... }:
{
  # Address of the test VM, written by `mise run nixos:e2e user@a.b.c.d` into the git-ignored extra/ (never a production
  # address). Empty when missing: the build then refuses it.
  pangolin.bindIp =
    let f = ../extra/etc/pangolin/binding-ip;
    in if builtins.pathExists f then lib.removeSuffix "
" (builtins.readFile f) else "";

  boot.loader.grub.enable = true;
  boot.initrd.availableKernelModules = [ "virtio_pci" "virtio_scsi" "ahci" "sd_mod" "xhci_pci" "sr_mod" ];
  boot.kernelParams = [ "console=ttyS0" ];

  disko.devices.disk.main = {
    device = "/dev/sda";
    type = "disk";
    content = {
      type = "gpt";
      partitions = {
        boot = {
          size = "1M";
          type = "EF02"; # BIOS boot partition for GRUB
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
