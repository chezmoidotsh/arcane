{ ... }: {
  imports = [
    ./victoriametrics.nix
    ./victorialogs.nix
    ./victoriatraces.nix
    ./otlp-gateway.nix
    ./o11y-agent.nix
    ./vmalert.nix
    ./alertmanager.nix
    ./caddy.nix
    ./hardening.nix
  ];
}
