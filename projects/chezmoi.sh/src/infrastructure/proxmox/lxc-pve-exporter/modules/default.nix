{ ... }: {
  imports = [
    ./pve-exporter.nix
    ./vector.nix
    ./log-shipper.nix
    ./hardening.nix
  ];
}
