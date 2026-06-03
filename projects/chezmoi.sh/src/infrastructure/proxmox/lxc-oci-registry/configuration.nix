# ─────────────────────────────────────────────────────────────────────────────
# oci.chezmoi.sh — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# This file supplies only site-specific values that are not part of the
# module logic: system identity, locale, shell, and the console toolbox.
#
# The three modules in ./modules/ own all service configuration:
#   * zot.nix       — Zot OCI registry process, storage, upstreams, retention
#   * caddy.nix     — TLS termination + reverse proxy for oci.chezmoi.sh
#   * hardening.nix — sysctl, firewall, login surface, journald
#
# Build inputs forwarded via _module.args (see flake.nix):
#   zotPackage      — Zot binary to run
#   cloudflareToken — Optional. When non-empty, baked into /etc/caddy/secrets
#                     so Caddy can obtain a certificate on first boot.
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, ... }:

{
  system.stateVersion = "26.05";
  networking.hostName = "oci-registry";

  time.timeZone = "Etc/UTC";
  i18n.defaultLocale = "C.UTF-8";

  # ── Console shell (pct enter) ────────────────────────────────────────────
  # `pct enter` spawns a shell without a login session, so /run/current-system/
  # sw/bin is never added to PATH. Switching root to bash and sourcing
  # /etc/set-environment in shellInit ensures every bash session (including
  # `pct enter`) gets the full NixOS PATH.
  users.users.root.shell = pkgs.bashInteractive;
  programs.bash.shellInit = ''
    if [ -z "''${__NIXOS_SET_ENVIRONMENT_DONE-}" ]; then
      . /etc/set-environment
    fi
  '';

  # ── Console toolbox ─────────────────────────────────────────────────────
  # Minimal set for emergency triage from the console:
  #   curl — probe /v2/ and the mgmt endpoint locally
  #   jq   — pretty-print the mgmt JSON response
  environment.systemPackages = with pkgs; [ curl jq ];
}
