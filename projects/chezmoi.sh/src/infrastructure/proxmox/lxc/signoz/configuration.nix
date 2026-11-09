# ─────────────────────────────────────────────────────────────────────────────
# signoz.chezmoi.sh — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# Supplies site-specific values not owned by the modules: system identity,
# locale, console shell, and tmpfiles for the mp0 data volume.
#
# The modules in ./modules/ own all service configuration:
#   * signoz.nix    — ClickHouse + keeper, schema migrator, OTel collector, SigNoz
#   * caddy.nix     — TLS termination + reverse proxy for signoz.chezmoi.sh
#   * o11y.nix      — journald + node metrics shipped to the Victoria stack
#   * hardening.nix — sysctl, firewall, login surface, journald
#
# Persistent storage (mp0 → /persistent), fixed UIDs for the Proxmox uid-map:
#   clickhouse uid 990 → host 100990   (ClickHouse + keeper)
#   signoz     uid 991 → host 100991   (SQLite metadata)
#   caddy      uid 997 → host 100997
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, ... }:

{
  system.stateVersion = "26.05";
  networking.hostName = "signoz";

  # ── Static IPv4 (mirrors PVE net0: ip=10.0.0.27/22,gw=10.0.0.1) ──────────
  catalog.staticNetwork = {
    enable = true;
    address = "10.0.0.27";
    prefixLength = 22;
    gateway = "10.0.0.1";
  };

  time.timeZone = "Etc/UTC";
  i18n.defaultLocale = "C.UTF-8";

  # ── Console shell (pct enter) ────────────────────────────────────────────
  # `pct enter` spawns a shell without a login session; source the NixOS
  # environment so PATH is complete.
  users.users.root.shell = pkgs.bashInteractive;
  programs.bash.shellInit = ''
    if [ -z "''${__NIXOS_SET_ENVIRONMENT_DONE-}" ]; then
      . /etc/set-environment
    fi
  '';

  # ── Console toolbox ─────────────────────────────────────────────────────
  #   curl       — probe the local endpoints
  #   clickhouse — `clickhouse client` for emergency triage of the store
  environment.systemPackages = with pkgs; [ curl clickhouse ];

  systemd.tmpfiles.rules = [
    "d /persistent 0755 root root - -"
    "d /persistent/caddy 0750 caddy caddy - -"
    "d /persistent/caddy/Caddy 0750 caddy caddy - -"
  ];
}
