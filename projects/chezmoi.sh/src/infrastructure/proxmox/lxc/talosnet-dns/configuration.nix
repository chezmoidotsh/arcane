# ─────────────────────────────────────────────────────────────────────────────
# talosnet-dns — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# System identity, locale, console shell, and networking. Service configuration
# lives in ./modules/. BIND's zone file is seeded from the image on first boot,
# then owned by BIND itself (serial + journal) to persist RFC2136 updates.
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, ... }:

{
  system.stateVersion = "26.05";
  networking.hostName = "talosnet-dns";

  # ── Static IPv4 ─────────────────────────────────────────────────────────────
  # VLAN 5 has DHCP disabled, so eth0 needs static config to avoid link-local
  # fallback on reboot (see catalog.nix's lxc-static-network module).
  catalog.staticNetwork = {
    enable = true;
    address = "10.0.0.26";
    prefixLength = 22;
    gateway = "10.0.0.1";
  };

  # ── talosnet interface ──────────────────────────────────────────────────────
  # eth1 is the second NIC added to this CT via Proxmox (bridge=talosnet,
  # firewall=0). dnsmasq listens on this interface; talosnet's DHCP advertises
  # this address as the DNS server.
  networking.interfaces.eth1 = {
    ipv4.addresses = [{
      address = "10.128.0.3";
      prefixLength = 24;
    }];
  };

  time.timeZone = "Etc/UTC";
  i18n.defaultLocale = "C.UTF-8";

  users.users.root.shell = pkgs.bashInteractive;
  programs.bash.shellInit = ''
    if [ -z "''${__NIXOS_SET_ENVIRONMENT_DONE-}" ]; then
      . /etc/set-environment
    fi
  '';

  environment.systemPackages = with pkgs; [ curl jq dnsutils ];
}
