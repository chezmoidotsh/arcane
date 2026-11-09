{ ... }: {
  imports = [
    ./signoz.nix
    ./caddy.nix
    ./o11y.nix
    ./hardening.nix
  ];
}
