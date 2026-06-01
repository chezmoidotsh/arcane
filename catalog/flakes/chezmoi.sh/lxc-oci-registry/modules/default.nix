# ─────────────────────────────────────────────────────────────────────────────
# lxc-oci-registry — bundle module
# ─────────────────────────────────────────────────────────────────────────────
# Imports the three sub-modules that together compose a single-node OCI
# registry stack suitable for running inside an unprivileged Proxmox LXC:
#
#   * zot.nix       — the Zot registry process and systemd unit.
#   * caddy.nix     — Caddy reverse proxy with optional DNS-01 ACME.
#   * hardening.nix — NixOS + systemd + kernel hardening defaults (opt-in).
#
# Every option lives under `services.lxc-oci-registry.<sub-module>.*`.
# Importing this bundle is equivalent to:
#
#     imports = [ ./zot.nix ./caddy.nix ./hardening.nix ];
#
# without the path resolution headache for downstream flakes.
# ─────────────────────────────────────────────────────────────────────────────
{ ... }:

{
  imports = [
    ./zot.nix
    ./caddy.nix
    ./hardening.nix
  ];
}
