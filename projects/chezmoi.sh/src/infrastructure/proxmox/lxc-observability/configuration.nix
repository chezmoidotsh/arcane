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
# Every stack daemon runs as the single `victoria` user (uid/gid 980). This is
# deliberate: the LXC is a single-purpose appliance, the whole container is the
# trust boundary, and per-unit systemd hardening still applies. A single fixed
# uid keeps the Proxmox unprivileged uid-map ownership model trivial — the data
# volume is chowned to one uid (host 100000 + 980 = 100980), exactly like the
# zot LXC. Per-service uids would break the single recursive chown in
# `.mise/tasks/lxc/upgrade`.
#
# Build inputs forwarded via _module.args (see flake.nix):
#   secrets — attrset of build-time secrets (Cloudflare token, Alertmanager
#             notification + deadman URLs). Empty values degrade gracefully.
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, ... }:

{
  system.stateVersion = "26.05";
  networking.hostName = "observability";

  time.timeZone = "Etc/UTC";
  i18n.defaultLocale = "C.UTF-8";

  # ── Shared service account ────────────────────────────────────────────────
  # uid/gid 980 fixed → host uid 100980 with the default Proxmox mapping.
  # All daemons run as this user; the data volume is owned by it.
  users.users.victoria = {
    isSystemUser = true;
    uid = 980;
    group = "victoria";
    home = "/var/lib/victoria";
    createHome = false; # the mp0 data volume owns the lifecycle
    description = "VictoriaMetrics stack service account";
  };
  users.groups.victoria = { gid = 980; };

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

  # ── Console toolbox ────────────────────────────────────────────────────────
  # Minimal set for emergency triage from `pct enter`:
  #   curl — probe component /health and /metrics endpoints over loopback
  #   jq   — pretty-print JSON responses (vmalert / Alertmanager API, …)
  environment.systemPackages = with pkgs; [ curl jq ];
}
