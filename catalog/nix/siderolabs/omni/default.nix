{ ... }: {
  imports = [
    ./omni.nix
    ./dex.nix
    ./infra-provider/proxmox.nix
  ];
}
