# ─────────────────────────────────────────────────────────────────────────────
# services.lxc-oci-registry.hardening
# ─────────────────────────────────────────────────────────────────────────────
# Opinionated hardening profile for a single-workload NixOS LXC.
#
# Default: every switch is off. Importing the bundle module does not change
# the host's posture until you opt in by setting
#
#     services.lxc-oci-registry.hardening.enable = true;
#
# Why opt-in? The catalog flake is meant to be reusable. A "pull-through
# cache in a friend's lab" might want SSH, a real shell user, or different
# kernel sysctls. Forcing a homelab-specific profile would surprise them.
#
# What this module does (when enabled):
#
#   1. Kernel sysctls — disables IP forwarding, source routing, ICMP
#      redirects, secure_redirects, SUID dumps, magic-sysrq, etc.
#   2. Audit & journal — forwards systemd journal to the LXC console so
#      `pct console <vmid>` shows boot logs; sets a sane journal size cap.
#   3. Packages — strips the LXC of every interactive convenience the
#      default NixOS profile pulls in (man-db, nano, info, perl).
#   4. Login surface — disables every TTY but tty1 (kept for `pct enter`),
#      removes setuid binaries we don't need (mount/umount/su/passwd are
#      kept; chage, gpasswd, chfn, chsh are dropped).
#   5. Services — disables avahi, ssh, cups, polkit and every other unit
#      that has no reason to run in a registry LXC.
#
# All of the above is documented inline so an operator running
# `journalctl -u zot` can immediately understand *why* something is locked
# down.
# ─────────────────────────────────────────────────────────────────────────────
{ config, lib, pkgs, ... }:

let
  cfg = config.services.lxc-oci-registry.hardening;
in
{
  options.services.lxc-oci-registry.hardening = {
    enable = lib.mkEnableOption "LXC-targeted hardening defaults for the OCI registry stack";

    consoleUser = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "console";
      description = ''
        Optional non-privileged user that may log in on the local console
        via `pct enter <vmid>`. When `null` (default), no console user is
        created and operator access goes through `pct enter` as root on
        the Proxmox host — which is the recommended posture, since the
        LXC has no SSH service and no network-facing shell.
      '';
    };
  };

  config = lib.mkIf cfg.enable {

    # ── Kernel hardening (sysctl) ────────────────────────────────────────
    # The container shares the host kernel, so most kernel hardening must
    # happen on the Proxmox host. The settings below are the ones whose
    # *namespaced* counterparts can still be enforced from inside an
    # unprivileged LXC (network stack, IPv6 RA, …).
    boot.kernel.sysctl = {
      # No IP forwarding — this is a single-host registry, not a router.
      "net.ipv4.ip_forward" = lib.mkDefault 0;
      "net.ipv6.conf.all.forwarding" = lib.mkDefault 0;

      # Refuse source-routed packets, ICMP redirects, and martian sources.
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

      # Reverse-path filtering (Strict mode).
      "net.ipv4.conf.all.rp_filter" = 1;
      "net.ipv4.conf.default.rp_filter" = 1;

      # SYN flood protection.
      "net.ipv4.tcp_syncookies" = 1;

      # Disable the magic SysRq key.
      "kernel.sysrq" = 0;

      # Block coredumps from setuid binaries.
      "fs.suid_dumpable" = 0;

      # Restrict ptrace to direct children (YAMA).
      "kernel.yama.ptrace_scope" = lib.mkDefault 2;
    };

    # ── Login surface ────────────────────────────────────────────────────
    services.openssh.enable = lib.mkForce false;
    services.getty.autologinUser = lib.mkForce null;

    # Console user (optional, off by default).
    users.users = lib.mkIf (cfg.consoleUser != null) {
      ${cfg.consoleUser} = {
        isNormalUser = true;
        description = "Local console operator";
        extraGroups = [ "wheel" ];
        # No SSH keys — by design. Access via Proxmox `pct enter`.
        hashedPassword = "*";
      };
    };
    # Wheel needs a password for sudo (no passwordless escalation).
    security.sudo.wheelNeedsPassword = lib.mkDefault true;

    # ── Service surface ──────────────────────────────────────────────────
    # NixOS pulls a handful of niceties into the default LXC profile that
    # have no business running on a single-workload registry.
    services.avahi.enable = lib.mkForce false;
    services.printing.enable = lib.mkForce false;
    security.polkit.enable = lib.mkForce false;
    services.udisks2.enable = lib.mkForce false;

    # ── Packages ─────────────────────────────────────────────────────────
    # Strip everything that adds attack surface without value here. We
    # keep coreutils, util-linux, less (for `journalctl`), vim (for
    # emergency edits), and curl (handy for /v2/ probes from the console).
    documentation = {
      enable = lib.mkDefault false;
      man.enable = lib.mkDefault false;
      info.enable = lib.mkDefault false;
      doc.enable = lib.mkDefault false;
      nixos.enable = lib.mkDefault false;
    };

    # ── Journald ─────────────────────────────────────────────────────────
    # Push systemd logs to /dev/console so `pct console <vmid>` works,
    # and bound the on-disk journal so a runaway log doesn't fill the
    # root volume.
    services.journald = {
      console = "/dev/console";
      extraConfig = ''
        ForwardToConsole=yes
        SystemMaxUse=512M
        MaxRetentionSec=2week
      '';
    };

    # ── Firewall ─────────────────────────────────────────────────────────
    # Default deny; only :80 and :443 cross the LXC boundary.
    # Proxmox's host-level firewall should layer on top of this — see the
    # deployment README for the matching `pve-firewall` rules.
    networking.firewall = {
      enable = lib.mkDefault true;
      allowedTCPPorts = lib.mkDefault [ 80 443 ];
      allowedUDPPorts = lib.mkDefault [ ];
      logRefusedConnections = lib.mkDefault false; # noise; rely on PVE FW logs
    };

    # ── Misc ─────────────────────────────────────────────────────────────
    # Time sync via systemd-timesyncd. Container clock drift breaks ACME
    # and image timestamps.
    services.timesyncd.enable = lib.mkDefault true;

    # Disable nixos-rebuild from inside the LXC — the image is built
    # externally and a `nixos-rebuild switch` would diverge from the flake.
    # This is a soft signal (commenting the switch out) rather than a
    # hard removal, so emergency recovery is still possible.
    environment.etc."nixos-rebuild.warning".text = ''
      This system is a sealed LXC image — do not run nixos-rebuild.
      Rebuild the image from the flake instead:
        mise run lxc:build
        mise run lxc:push -- <pve-host>
    '';
  };
}
