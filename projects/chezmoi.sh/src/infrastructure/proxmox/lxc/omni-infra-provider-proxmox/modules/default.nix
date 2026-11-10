{ ... }: {
  imports = [
    ./omni-infra-provider-proxmox.nix
    ./hardening.nix
    ./o11y-agent.nix
    ./secrets.nix
  ];
}
