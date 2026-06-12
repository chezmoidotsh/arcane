{ lib, ... }:

{
  # ── Login surface ──────────────────────────────────────────────────────────
  # No SSH — `pct enter <vmid>` on the Proxmox host is the only console path.
  services.openssh.enable = lib.mkForce false;
  services.getty.autologinUser = lib.mkForce null;

  # ── Kernel sysctls ─────────────────────────────────────────────────────────
  boot.kernel.sysctl = {
    "net.ipv4.ip_forward" = 0;
    "net.ipv4.conf.all.accept_source_route" = 0;
    "net.ipv4.conf.all.accept_redirects" = 0;
    "net.ipv4.conf.all.send_redirects" = 0;
    "net.ipv4.tcp_syncookies" = 1;
    "net.ipv4.conf.all.rp_filter" = 1;
    "kernel.yama.ptrace_scope" = 2;
    "fs.suid_dumpable" = 0;
  };

  # ── Unnecessary services ───────────────────────────────────────────────────
  services.avahi.enable = lib.mkForce false;
  services.printing.enable = lib.mkForce false;
  security.polkit.enable = lib.mkForce false;
  services.udisks2.enable = lib.mkForce false;

  # ── Documentation ──────────────────────────────────────────────────────────
  documentation.man.enable = lib.mkForce false;
  documentation.info.enable = lib.mkForce false;
  documentation.nixos.enable = lib.mkForce false;

  # ── Journald ───────────────────────────────────────────────────────────────
  services.journald = {
    console = "/dev/console";
    extraConfig = ''
      Storage=volatile
      RuntimeMaxUse=64M
      ForwardToConsole=yes
    '';
  };

  # ── Firewall ────────────────────────────────────────────────────────────────
  # Provider connects outbound only — no inbound ports required.
  networking.firewall.enable = lib.mkDefault true;
  networking.firewall.allowedUDPPorts = lib.mkDefault [ ];
  networking.firewall.logRefusedConnections = lib.mkDefault false;

  # ── Time sync ──────────────────────────────────────────────────────────────
  services.timesyncd.enable = lib.mkDefault true;
}
