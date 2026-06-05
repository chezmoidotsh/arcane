# ─────────────────────────────────────────────────────────────────────────────
# Hardening profile — always active for this LXC
# ─────────────────────────────────────────────────────────────────────────────
# Same baseline as oci-registry but NO public ports — this LXC only pushes
# outbound (metrics + logs). No Caddy, no TLS termination, no ingress.
#
# Covers: kernel sysctls, SSH disabled, services disabled, volatile journald,
# default-deny firewall (no open TCP/UDP ports).
# ─────────────────────────────────────────────────────────────────────────────
{ lib, ... }:

{
  boot.kernel.sysctl = {
    "net.ipv4.ip_forward" = lib.mkDefault 0;
    "net.ipv6.conf.all.forwarding" = lib.mkDefault 0;

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

  services.openssh.enable = lib.mkForce false;
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

  networking.firewall.enable = lib.mkDefault true;
  networking.firewall.allowedTCPPorts = lib.mkDefault [ ];
  networking.firewall.allowedUDPPorts = lib.mkDefault [ ];
  networking.firewall.logRefusedConnections = lib.mkDefault false;

  services.timesyncd.enable = lib.mkDefault true;
}
