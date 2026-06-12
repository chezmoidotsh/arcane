{ ... }: {
  imports = [
    ../../../../../../../../catalog/nix/siderolabs/omni
    ./caddy.nix
    ./hardening.nix
    ./secrets.nix
  ];
}
