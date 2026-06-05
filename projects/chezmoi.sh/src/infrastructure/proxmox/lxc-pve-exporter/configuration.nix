# ─────────────────────────────────────────────────────────────────────────────
# pve-exporter — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# Minimal LXC: runs prometheus-pve-exporter + Vector agent. No public services.
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
