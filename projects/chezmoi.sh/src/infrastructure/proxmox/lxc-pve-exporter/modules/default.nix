{ ... }: {
  imports = [
    ./pve-exporter.nix
    ./o11y.nix
    ./hardening.nix
  ];
}
