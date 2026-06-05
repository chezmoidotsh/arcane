{ ... }: {
  imports = [
    ./victoriametrics.nix
    ./victorialogs.nix
    ./victoriatraces.nix
    ./vector.nix
    ./log-shipper.nix
    ./vmalert.nix
    ./alertmanager.nix
    ./caddy.nix
    ./hardening.nix
  ];
}
