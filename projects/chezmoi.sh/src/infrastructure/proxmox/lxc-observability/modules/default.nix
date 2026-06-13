{ ... }: {
  imports = [
    ./victoriametrics.nix
    ./victorialogs.nix
    ./victoriatraces.nix
    ./vmalert.nix
    ./alertmanager.nix
    ./caddy.nix
    ./hardening.nix
  ];
}
