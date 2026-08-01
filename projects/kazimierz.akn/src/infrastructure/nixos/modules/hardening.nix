# ─────────────────────────────────────────────────────────────────────────────
# Hardening profile
# ─────────────────────────────────────────────────────────────────────────────
# Adapted from the Proxmox LXC appliances' hardening.nix (see e.g.
# projects/chezmoi.sh/src/infrastructure/proxmox/lxc/talosnet-dns/modules/hardening.nix)
# with two differences forced by what this host actually is:
#   - SSH stays enabled (configured in ../configuration.nix) -- this is a
#     public VPS gateway with no local console access outside of Proxmox
#     testing, unlike an LXC reachable via `pct enter`.
#   - IP forwarding stays on -- Gerbil relays WireGuard tunnel traffic to
#     Traefik, it's not a leaf host like a DNS resolver.
# ─────────────────────────────────────────────────────────────────────────────
{ lib, ... }:

{
  boot.kernel.sysctl = {
    "net.ipv4.ip_forward" = lib.mkDefault 1;
    "net.ipv6.conf.all.forwarding" = lib.mkDefault 1;

    "net.ipv4.conf.all.accept_source_route" = 0;
    "net.ipv4.conf.default.accept_source_route" = 0;
    "net.ipv6.conf.all.accept_source_route" = 0;
    "net.ipv4.conf.all.accept_redirects" = 0;
    "net.ipv4.conf.default.accept_redirects" = 0;
    "net.ipv4.conf.all.secure_redirects" = 0;
    "net.ipv4.conf.default.secure_redirects" = 0;
    "net.ipv6.conf.all.accept_redirects" = 0;
    "net.ipv4.conf.all.log_martians" = 1;
    "net.ipv4.conf.default.log_martians" = 1;

    "net.ipv4.conf.all.rp_filter" = 1;
    "net.ipv4.conf.default.rp_filter" = 1;

    "net.ipv4.tcp_syncookies" = 1;
    "kernel.sysrq" = 0;
    "fs.suid_dumpable" = 0;
    "kernel.yama.ptrace_scope" = lib.mkDefault 2;
  };

  services.getty.autologinUser = lib.mkForce null;

  services.avahi.enable = lib.mkForce false;
  services.printing.enable = lib.mkForce false;
  security.polkit.enable = lib.mkForce false;
  services.udisks2.enable = lib.mkForce false;

  documentation = {
    enable = lib.mkDefault false;
    man.enable = lib.mkDefault false;
    info.enable = lib.mkDefault false;
    doc.enable = lib.mkDefault false;
    nixos.enable = lib.mkDefault false;
  };

  services.journald = {
    console = "/dev/console";
    extraConfig = ''
      Storage=volatile
      RuntimeMaxUse=64M
      ForwardToConsole=yes
    '';
  };

  # Do NOT use lib.mkDefault for allowedTCPPorts/allowedUDPPorts —
  # nixos-generators' qcow-efi format sets them to [] at normal priority and
  # would silently win over mkDefault (1000). services.pangolin.openFirewall
  # (pangolin.nix) adds 80/443/51820 on top of these.
  networking.firewall.enable = lib.mkDefault true;
  networking.firewall.allowedTCPPorts = [ 22 ];
  # 21820 (Newt client tunnels) isn't opened by services.pangolin.openFirewall
  # (which only covers Gerbil's own site-tunnel port, 51820) -- kept here to
  # match the NSG rules already provisioned in the Pulumi stack
  # (stack/oci/network.ts) for the Hetzner setup this replaces.
  networking.firewall.allowedUDPPorts = [ 21820 ];
  networking.firewall.logRefusedConnections = lib.mkDefault false;

  services.timesyncd.enable = lib.mkDefault true;
}
