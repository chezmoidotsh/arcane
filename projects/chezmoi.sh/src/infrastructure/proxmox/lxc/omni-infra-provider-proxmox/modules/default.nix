{ ... }: {
  imports = [
    ../../../../../../../../catalog/nix/siderolabs/omni/infra-provider/proxmox.nix
    ./hardening.nix
    ./o11y.nix
    ./secrets.nix
  ];
}
