{ config, lib, pkgs, ... }:
{
  system.stateVersion = "26.05";
  networking.hostName = "rimbilliton-akn";
  time.timeZone = "UTC";

  # Boot loader, disk layout and console live in platforms/ (selected by the flake output).

  # 6 GB RAM, ~4 GB Java heap: compressed swap as a safety net.
  zramSwap.enable = true;

  # --- Network -----------------------------------------------------------------
  networking.useDHCP = true;
  networking.firewall = {
    enable = true;
    allowedTCPPorts = [ 80 443 ];
    # Pool of 16 game ports: the allocations to give to Pelican's servers (same range in the OCI NSG).
    allowedTCPPortRanges = [ { from = 25565; to = 25580; } ];
    # SSH is only reachable through the tailnet (OCI NSG keeps 22 closed too).
    interfaces.tailscale0.allowedTCPPorts = [ 22 ];
  };

  services.openssh = {
    enable = true;
    openFirewall = false;
    settings = {
      PasswordAuthentication = false;
      PermitRootLogin = "prohibit-password";
    };
  };
  # Same key as the `ssh_authorized_keys` Pulumi config (nixos-anywhere + deploys).
  users.users.root.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAA... TODO-replace-with-your-public-key"
  ];

  services.tailscale = {
    enable = true;
    authKeyFile = config.sops.secrets.tailscale_authkey.path;
    extraUpFlags = [ "--advertise-tags=tag:svc-minecraft" "--ssh" ];
  };

  # --- Secrets (sops-nix, age) -------------------------------------------------
  # Host key = the SSH ed25519 host key, converted by sops-nix. See README.
  sops.defaultSopsFile = ./secrets/rimbilliton.sops.yaml;
  sops.age.sshKeyPaths = [ "/etc/ssh/ssh_host_ed25519_key" ];
  sops.secrets.tailscale_authkey = { };

  nix.settings = {
    experimental-features = [ "nix-command" "flakes" ];
    auto-optimise-store = true;
  };
  nix.gc = {
    automatic = true;
    options = "--delete-older-than 14d";
  };

  environment.systemPackages = with pkgs; [ htop tmux ];
}
