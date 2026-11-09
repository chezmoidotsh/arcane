{ ... }: {
  imports = [
    ./omni.nix
    ./dex.nix
    ./caddy.nix
    ./hardening.nix
    ./o11y.nix
    ./secrets.nix
  ];
}
