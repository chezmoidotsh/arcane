# ─────────────────────────────────────────────────────────────────────────────
# o11y.chezmoi.sh — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# Supplies only site-specific values that are not part of the module logic:
# system identity, locale, the shared service account, and the console toolbox.
#
# The modules in ./modules/ own all service configuration:
#   * victoriametrics.nix — metrics TSDB + self-scrape
#   * victorialogs.nix    — log store
#   * victoriatraces.nix  — tracing store (OTLP/Jaeger)
#   * vmalert.nix         — existential rule evaluation
#   * alertmanager.nix    — existential alerts + deadman switch
#   * caddy.nix           — TLS termination + path routing for o11y.chezmoi.sh
#   * tailscale.nix       — tailnet membership (OAuth) for off-LAN sources
#   * hardening.nix       — sysctl, firewall, login surface, journald
#
# Shared service account
# ──────────────────────
# Every stack daemon except Caddy runs as the single `o11y` user (uid/gid 980).
# This is deliberate: the LXC is a single-purpose appliance, the whole container
# is the trust boundary, and per-unit systemd hardening still applies. A single
# fixed uid keeps the Proxmox unprivileged uid-map ownership model simple for all
# Victoria* / Vector / Alertmanager data (host 100000 + 980 = 100980).
#
# Caddy runs as its own dedicated `caddy` user (uid/gid 997, defined in
# modules/caddy.nix) and stores its state in /persistent/caddy, separate from
# the stack data at /persistent/o11y. The upgrade script does two targeted chowns
# rather than one recursive chown.
#
# Build inputs forwarded via _module.args (see flake.nix):
#   secrets — attrset of build-time secrets (Cloudflare token, Alertmanager
#             notification + deadman URLs). Empty values degrade gracefully.
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, ... }:

{
  system.stateVersion = "26.05";
  networking.hostName = "o11y";

  time.timeZone = "Etc/UTC";
  i18n.defaultLocale = "C.UTF-8";

  # ── Shared service account ────────────────────────────────────────────────
  # uid/gid 980 fixed → host uid 100980 with the default Proxmox mapping.
  # All daemons run as this user; the data volume is owned by it.
  users.users.o11y = {
    isSystemUser = true;
    uid = 980;
    group = "o11y";
    home = "/persistent/o11y";
    createHome = false; # the mp0 data volume owns the lifecycle
    description = "Observability stack service account";
  };
  users.groups.o11y = { gid = 980; };

  # ── Console shell (pct enter) ─────────────────────────────────────────────
  # `pct enter` spawns a shell without a login session, so /run/current-system/
  # sw/bin is never added to PATH. Switching root to bash and sourcing
  # /etc/set-environment in shellInit ensures every bash session gets the full
  # NixOS PATH.
  users.users.root.shell = pkgs.bashInteractive;
  programs.bash.shellInit = ''
    if [ -z "''${__NIXOS_SET_ENVIRONMENT_DONE-}" ]; then
      . /etc/set-environment
    fi
  '';

  # ── Persistent volume layout ─────────────────────────────────────────────────
  # mp0 is mounted at /persistent. Each service gets its own subdirectory owned
  # by the service user. Caddy's subtree is created by modules/caddy.nix because
  # it runs as a dedicated user.
  systemd.tmpfiles.rules = [
    "d /persistent              0755 root  root  - -"
    "d /persistent/o11y         0750 o11y  o11y  - -"
    "d /persistent/o11y/metrics 0750 o11y  o11y  - -"
    "d /persistent/o11y/logs    0750 o11y  o11y  - -"
    "d /persistent/o11y/traces  0750 o11y  o11y  - -"
    "d /persistent/o11y/vector  0750 o11y  o11y  - -"
    "d /persistent/o11y/alertmanager 0750 o11y  o11y  - -"
  ];

  # ── Console toolbox ────────────────────────────────────────────────────────
  # Minimal set for emergency triage from `pct enter`:
  #   curl — probe component /health and /metrics endpoints over loopback
  #   jq   — pretty-print JSON responses (vmalert / Alertmanager API, …)
  environment.systemPackages = with pkgs; [ curl jq ];
}
