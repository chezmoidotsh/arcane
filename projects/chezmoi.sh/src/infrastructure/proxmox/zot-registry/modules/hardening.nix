# ─────────────────────────────────────────────────────────────────────────────
# Hardening profile — always active for this LXC
# ─────────────────────────────────────────────────────────────────────────────
# Applied unconditionally (no enable option). Covers:
#
#   1. Kernel sysctls  — IP forwarding off, ICMP redirects off, SYN cookies,
#                        YAMA ptrace, rp_filter, suid_dumpable.
#   2. Login surface   — SSH disabled (access via `pct enter` on the PVE host).
#   3. Services        — avahi, cups, polkit, udisks2 all disabled.
#   4. Documentation   — man-db, info, nixos-docs stripped to reduce image size.
#   5. Journald        — volatile (RAM-only, no root-disk usage), capped at
#                        64 MiB; forwarded to /dev/console for `pct console`.
#   6. Firewall        — default deny; TCP 80 and 443 are the only open ports.
#   7. Time sync       — systemd-timesyncd on (clock drift breaks ACME).
# ─────────────────────────────────────────────────────────────────────────────
{ lib, ... }:

{
  # ── Kernel hardening (sysctl) ──────────────────────────────────────────────
  # The LXC shares the host kernel; only namespaced sysctls can be changed
  # from inside the container. The set below covers what an unprivileged LXC
  # can actually enforce.
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

  # ── Login surface ──────────────────────────────────────────────────────────
  # No SSH — operator access goes through `pct enter <vmid>` on the PVE host.
  services.openssh.enable = lib.mkForce false;
  services.getty.autologinUser = lib.mkForce null;

  # ── Service surface ────────────────────────────────────────────────────────
  services.avahi.enable = lib.mkForce false;
  services.printing.enable = lib.mkForce false;
  security.polkit.enable = lib.mkForce false;
  services.udisks2.enable = lib.mkForce false;

  # ── Documentation ─────────────────────────────────────────────────────────
  documentation = {
    enable = lib.mkDefault false;
    man.enable = lib.mkDefault false;
    info.enable = lib.mkDefault false;
    doc.enable = lib.mkDefault false;
    nixos.enable = lib.mkDefault false;
  };

  # ── Journald ───────────────────────────────────────────────────────────────
  # Storage=volatile: logs live in /run/log/journal (tmpfs, max 64 MiB).
  # Nothing is written to the 1 GiB root disk; logs disappear on reboot.
  # ForwardToConsole+console path ensure `pct console <vmid>` shows boot output.
  services.journald = {
    console = "/dev/console";
    extraConfig = ''
      Storage=volatile
      RuntimeMaxUse=64M
      ForwardToConsole=yes
    '';
  };

  # ── Firewall ───────────────────────────────────────────────────────────────
  # Default deny; only :80 and :443 cross the LXC boundary. Do NOT use
  # lib.mkDefault for allowedTCPPorts — nixos-generators' lxc format sets it
  # to [] at normal priority and would silently win over mkDefault (1000).
  # Normal-priority assignments from multiple modules are concatenated by
  # lib.concatLists, so this adds [80 443] on top of whatever the generator
  # contributes.
  networking.firewall.enable = lib.mkDefault true;
  networking.firewall.allowedTCPPorts = [ 80 443 ];
  networking.firewall.allowedUDPPorts = lib.mkDefault [ ];
  networking.firewall.logRefusedConnections = lib.mkDefault false;

  # ── Time sync ─────────────────────────────────────────────────────────────
  # Container clock drift breaks ACME and image timestamps.
  services.timesyncd.enable = lib.mkDefault true;
}
