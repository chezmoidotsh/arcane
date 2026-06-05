{ ... }: {
  imports = [
    ./zot.nix
    ./caddy.nix
    ./log-shipper.nix
    ./vmagent.nix
    ./hardening.nix
  ];
}
