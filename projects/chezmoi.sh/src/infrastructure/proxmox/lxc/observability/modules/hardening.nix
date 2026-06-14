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
#                        The appliance's own logs are observed via VM self-scrape
#                        of component /metrics, not journald persistence.
#   6. Firewall        — default deny; TCP 80 and 443 are the only open ports.
#                        Every backend (VM, VLogs, vmalert, AM) binds 127.0.0.1 —
#                        Caddy is the sole boundary-crossing surface.
#                        Egress is allowed (Alertmanager notifications + deadman).
#   7. Time sync       — systemd-timesyncd on (clock drift breaks ACME + TSDB).
# ─────────────────────────────────────────────────────────────────────────────
{ lib, ... }:

{
  # ── Kernel hardening (sysctl) ──────────────────────────────────────────────
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
  # Volatile: logs live in /run/log/journal (tmpfs, max 64 MiB). Nothing hits
  # the root disk; they disappear on reboot. ForwardToConsole keeps boot output
  # visible via `pct console <vmid>`.
  services.journald = {
    console = "/dev/console";
    extraConfig = ''
      Storage=volatile
      RuntimeMaxUse=64M
      ForwardToConsole=yes
    '';
  };

  # ── Firewall ───────────────────────────────────────────────────────────────
  # Default deny; :80/:443 are the public surface (Caddy). :6000 is the Vector
  # native ingest port for LXC + cluster agents (catalog.lxcAgent) and for the
  # pve-exporter LXC, which now owns syslog ingest and forwards parsed events
  # here. Vector's OTLP (:4317/:4318) ports bind loopback only and need no
  # firewall rule.
  # Do NOT use lib.mkDefault for allowedTCPPorts — nixos-generators' lxc format
  # sets it to [] at normal priority and would silently win over mkDefault (1000).
  networking.firewall.enable = lib.mkDefault true;

  # UDP 41641 enables direct (non-DERP) Tailscale WireGuard connections. tsnet
  # (caddy-tailscale) falls back to DERP relays if closed; direct path is kept
  # open for lower latency. Set at normal priority so it wins over mkDefault [].
  networking.firewall.allowedUDPPorts = [ 41641 ];
  networking.firewall.allowedTCPPorts = [ 80 443 6000 ];
  networking.firewall.logRefusedConnections = lib.mkDefault false;

  # No trustedInterfaces: caddy-tailscale uses tsnet (userspace), so there is
  # no kernel tailscale0 interface. The tailnet listener lives inside the Caddy
  # process and the backends remain unreachable from the tailnet.

  # ── Time sync ─────────────────────────────────────────────────────────────
  services.timesyncd.enable = lib.mkDefault true;
}
