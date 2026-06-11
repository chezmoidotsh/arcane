{ ... }: {
  imports = [
    ../../../../../../../../catalog/nix/siderolabs/omni/infra-provider/proxmox.nix
    ./hardening.nix
    ./secrets.nix
  ];
}
