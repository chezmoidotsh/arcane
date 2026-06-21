# ─────────────────────────────────────────────────────────────────────────────
# kazimierz.akn — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# Site-specific values for the immutable VPS image: identity, locale, console,
# networking, SSH, and firewall ports.
#
# Modules in ./modules/ own service-specific and hardening config:
#   * hardening.nix    — sysctl, firewall defaults, SSH hardening, journald
#   * storage.nix      — external block volume (state + secrets) at /var/lib/kazimierz
#   * pangolin.nix     — Pangolin + Gerbil + Traefik (native NixOS services)
#   * error-pages.nix  — custom HTTP error-page renderer
#
# The image is an immutable NixOS UEFI disk image (qcow2).  It carries no state
# and no secrets — everything mutable lives on the block volume (storage.nix).
# SSH authorized keys are baked in (operator key); on OCI the metadata key is
# additive.
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, lib, config, ... }:

{
  system.stateVersion = "25.05";
  networking.hostName = "kazimierz";

  time.timeZone = "Etc/UTC";
  i18n.defaultLocale = "C.UTF-8";

  # ── Boot / console ─────────────────────────────────────────────────────────
  # Serial console on ttyS0 is required on OCI (their console) and convenient on
  # Proxmox (`qm terminal`). Keep tty0 too so the Proxmox VGA console also works.
  boot.kernelParams = [ "console=tty0" "console=ttyS0,115200" ];
  boot.loader.timeout = lib.mkDefault 1;

  # ── WireGuard kernel module ────────────────────────────────────────────────
  # Required by Pangolin/Gerbil for the public WireGuard gateway tunnel.
  boot.kernelModules = [ "wireguard" ];

  # ── Networking ─────────────────────────────────────────────────────────────
  # DHCP on the primary virtio NIC (Proxmox bridge and OCI both serve DHCP).
  networking.useDHCP = lib.mkDefault true;

  # ── SSH access ─────────────────────────────────────────────────────────────
  # Key-only (hardening.nix disables passwords). The operator key is baked so the
  # image is reachable on first boot without OCI IMDS (e.g. on Proxmox). On OCI
  # the instance-metadata key is added on top by the platform.
  services.openssh.enable = true;
  users.users.root.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIP2wkl8OiO7EkQp8Y8mLjL0s4mgZy3GiyrGY/XD7FZQ9"
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK0QoYptOmqsFNN7uOiFb7NatkhiGnSQc6itYri6bUnT"
  ];

  # ── Firewall ───────────────────────────────────────────────────────────────
  # Default deny; explicit ports opened here. hardening.nix enables the firewall.
  networking.firewall.allowedTCPPorts = [
    22 # TODO: remove once Tailscale is active (Phase 6.1) — SSH should be Tailscale-only
    80
    443
  ];
  networking.firewall.allowedUDPPorts = [ 51820 21820 ];

  # ── Console toolbox ────────────────────────────────────────────────────────
  environment.systemPackages = with pkgs; [ curl jq git ];
}
