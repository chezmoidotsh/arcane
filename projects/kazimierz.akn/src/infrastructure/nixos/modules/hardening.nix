# ─────────────────────────────────────────────────────────────────────────────
# Hardening profile — kazimierz.akn (public VPS)
# ─────────────────────────────────────────────────────────────────────────────
# Applied unconditionally (no enable option). Covers:
#
#   1. SSH             — key-only, no password auth; PermitRootLogin
#                        prohibit-password (OCI IMDS injects the key).
#                        GitHub keys for xunleii baked in at build time.
#   2. Kernel sysctls  — SYN cookies, rp_filter, source-route / redirect
#                        rejection, suid_dumpable, YAMA ptrace.
#   3. Services        — avahi, cups, polkit, udisks2 disabled.
#   4. Documentation   — man-db, info, nixos-docs stripped to reduce
#                        image size.
#   5. Journald        — volatile (RAM-only), capped at 64 MiB; forwarded
#                        to /dev/console for OCI VM console access.
#   6. Sudo            — wheel users need no password (OCI provisioner may
#                        need elevated access).
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, ... }:

{
  # ── SSH ────────────────────────────────────────────────────────────────────
  # Public VM — SSH is required for OCI IMDS access.  Lock down to
  # key-only auth with root login via keys only.
  services.openssh = {
    enable = true;
    # TODO: Restrict ListenAddress to Tailscale interface once tailscale.nix is active (Phase 6.1)
    settings = {
      PasswordAuthentication = false;
      KbdInteractiveAuthentication = false;
      PermitRootLogin = "prohibit-password";
    };
  };

  # Bake GitHub SSH keys for xunleii into the image.  OCI IMDS also injects
  # a key at runtime via oci-image.nix — both sources are accepted.
  # Update the hash when the GitHub key set changes:
  #   nix-prefetch-url https://github.com/xunleii.keys
  users.users.root.openssh.authorizedKeys.keyFiles = [
    (pkgs.fetchurl {
      url = "https://github.com/xunleii.keys";
      hash = "sha256-kzRDn8i6yI2rGywlw/VadZ8aXtWa+VKgUspZguKsVQs=";
    })
  ];

  # ── Kernel hardening (sysctl) ──────────────────────────────────────────────
  boot.kernel.sysctl = {
    "net.ipv4.tcp_syncookies" = 1;

    "net.ipv4.conf.all.rp_filter" = 1;
    "net.ipv4.conf.default.rp_filter" = 1;

    "net.ipv4.conf.all.accept_source_route" = 0;
    "net.ipv4.conf.default.accept_source_route" = 0;
    "net.ipv4.conf.all.accept_redirects" = 0;
    "net.ipv4.conf.default.accept_redirects" = 0;
    "net.ipv4.conf.all.send_redirects" = 0;
    "net.ipv4.conf.default.send_redirects" = 0;

    "net.ipv4.conf.all.secure_redirects" = 0;
    "net.ipv4.conf.default.secure_redirects" = 0;
    "net.ipv4.conf.all.log_martians" = 1;
    "net.ipv4.conf.default.log_martians" = 1;

    "kernel.suid_dumpable" = 0;
    "kernel.yama.ptrace_scope" = 2;
  };

  # ── Service surface ───────────────────────────────────────────────────────
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
  # Storage=volatile: logs in /run/log/journal (tmpfs, max 64 MiB).
  # ForwardToConsole for OCI VM console access.
  services.journald.extraConfig = ''
    Console=/dev/console
    Storage=volatile
    RuntimeMaxUse=64M
    ForwardToConsole=yes
  '';

  # ── Sudo ───────────────────────────────────────────────────────────────────
  # Wheel users can sudo without a password — the OCI provisioner and
  # automation tooling need elevated access without interactive prompts.
  security.sudo.wheelNeedsPassword = false;

  # ── Firewall ───────────────────────────────────────────────────────────────
  # Enable default-deny firewall; specific ports are opened in
  # configuration.nix (22, 80, 443 TCP; 51820, 21820 UDP).
  networking.firewall.enable = lib.mkDefault true;
  networking.firewall.logRefusedConnections = lib.mkDefault false;
}
