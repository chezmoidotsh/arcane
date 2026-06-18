# ─────────────────────────────────────────────────────────────────────────────
# pve-exporter — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# Supplies only site-specific values that are not part of the module logic:
# system identity, locale, the console shell, and the console toolbox.
#
# The modules in ./modules/ own all service configuration:
#   * pve-exporter.nix — prometheus-pve-exporter (nixpkgs)
#   * o11y.nix         — Vector agent (catalog.lxcAgent) shipping metrics + logs
#   * hardening.nix    — sysctl, firewall default-deny, login surface, journald
#
# No shared service account: unlike the o11y/oci LXCs, this container has no
# persistent data volume (mp0) — the PVE token is baked into the image and the
# exporter pushes outbound only.
#
# Build inputs forwarded via _module.args (see flake.nix):
#   pveHost        — PVE API host address (e.g. 10.0.0.254)
#   pveTokenValue  — API token secret (baked into image)
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, ... }:

{
  system.stateVersion = "26.05";
  networking.hostName = "pve-exporter";

  time.timeZone = "Etc/UTC";
  i18n.defaultLocale = "C.UTF-8";

  users.users.root.shell = pkgs.bashInteractive;
  programs.bash.shellInit = ''
    if [ -z "''${__NIXOS_SET_ENVIRONMENT_DONE-}" ]; then
      . /etc/set-environment
    fi
  '';

  environment.systemPackages = with pkgs; [ curl jq ];
}
