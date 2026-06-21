# ─────────────────────────────────────────────────────────────────────────────
# Module aggregator — kazimierz.akn
# ─────────────────────────────────────────────────────────────────────────────
# Imports all site-specific NixOS modules for the kazimierz immutable image.
# ─────────────────────────────────────────────────────────────────────────────
{ ... }:

{
  imports = [
    ./hardening.nix
    ./storage.nix
    ./pangolin.nix
    ./error-pages.nix

    # ./tailscale.nix  # Phase 6.1 — Tailscale mesh networking
    # ./geoip.nix      # Phase 6.2 — GeoIP database provisioning
  ];
}
