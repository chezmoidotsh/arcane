{ ... }: {
  imports = [
    ../../../../../../../../catalog/nix/siderolabs/omni
    ./caddy.nix
    ./hardening.nix
    ./o11y.nix
    ./secrets.nix
  ];
}
