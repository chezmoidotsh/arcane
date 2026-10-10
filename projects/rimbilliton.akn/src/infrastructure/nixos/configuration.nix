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
  };

  services.openssh = {
    enable = true;
    # Port 22 is open in the host firewall; who can reach it is decided by the OCI NSG (closed by default, see the
    # `unsecure` Pulumi toggle), so SSH goes through Tailscale unless that toggle is on.
    openFirewall = true;
    settings = {
      PasswordAuthentication = false;
      PermitRootLogin = "prohibit-password";
    };
  };
  # Same key as the `ssh_authorized_keys` Pulumi config (nixos-anywhere + deploys).
  users.users.root.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPH7IEv+Q6s6WSPlWVva6UlCbkhePQdZYbN1TbI7rCDx"
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
