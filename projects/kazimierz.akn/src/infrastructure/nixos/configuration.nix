# ─────────────────────────────────────────────────────────────────────────────
# kazimierz — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# System identity, networking, and remote access. Service configuration lives
# in ./modules/. Boot loader (UEFI/systemd-boot) is already configured by
# nixos-generators' qcow-efi format -- not duplicated here.
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, ... }:

{
  system.stateVersion = "26.05";
  networking.hostName = "kazimierz";

  # Both Proxmox (virtio-net) and OCI (VNIC) hand out an address over DHCP —
  # no static config needed, unlike the LXC appliances on VLAN 5.
  networking.useDHCP = lib.mkDefault true;

  # Needed on both targets: Proxmox shows the console through `qm terminal`,
  # OCI's only console access is the serial one exposed via the dashboard.
  boot.kernelParams = [ "console=ttyS0,115200n8" ];
  systemd.services."serial-getty@ttyS0".enable = true;

  time.timeZone = "Etc/UTC";
  i18n.defaultLocale = "C.UTF-8";

  # Pubkey-only remote admin (NSG/SecurityList already restrict :22 to
  # pubkey auth being the only thing that matters — this is the second
  # layer). Baked in at image build time via SSH_AUTHORIZED_KEYS
  # (builtins.getEnv, --impure) -- a public key isn't secret, but it still
  # has to come from the operator, never invented here.
  services.openssh = {
    enable = true;
    settings = {
      PasswordAuthentication = false;
      PermitRootLogin = "prohibit-password";
      KbdInteractiveAuthentication = false;
    };
  };
  users.users.root.openssh.authorizedKeys.keys = builtins.filter (s: s != "") (
    lib.splitString "\n" (builtins.getEnv "SSH_AUTHORIZED_KEYS")
  );

  environment.systemPackages = with pkgs; [ curl jq ];
}
