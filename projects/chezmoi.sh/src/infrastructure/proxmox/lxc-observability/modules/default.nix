{ ... }: {
  imports = [
    ./victoriametrics.nix
    ./victorialogs.nix
    ./victoriatraces.nix
    ./vector.nix
    ./o11y.nix
    ./vmalert.nix
    ./alertmanager.nix
    ./caddy.nix
    ./hardening.nix
  ];
}
