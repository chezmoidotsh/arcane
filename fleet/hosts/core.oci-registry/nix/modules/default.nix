{ ... }: {
  imports = [
    ./zot.nix
    ./caddy.nix
    ./o11y-agent.nix
    ./hardening.nix
  ];
}
