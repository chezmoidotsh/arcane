# ─────────────────────────────────────────────────────────────────────────────
# oci.chezmoi.sh — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# Supplies site-specific values not owned by the modules: system identity,
# locale, console shell, and tmpfiles for the mp0 data volume.
#
# The modules in ./modules/ own all service configuration:
#   * zot.nix       — Zot OCI persistent process, storage, upstreams, retention
#   * caddy.nix     — TLS termination + reverse proxy for oci.chezmoi.sh
#   * hardening.nix — sysctl, firewall, login surface, journald
#
# Persistent storage
# ──────────────────
# Both services write to /persistent/<service> on the mp0 data volume.
# Fixed UIDs keep the Proxmox uid-map model trivial:
#   zot   uid 994 → host 100994
#   caddy uid 997 → host 100997
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

  # ── Static IPv4 (mirrors PVE net0: ip=10.0.0.23/22,gw=10.0.0.1) ──────────
  # See catalog.nix's lxc-static-network module — without this, eth0 falls
  # back to a link-local address on every reboot (VLAN 5 has DHCP disabled).
  catalog.staticNetwork = {
    enable = true;
    address = "10.0.0.23";
    prefixLength = 22;
    gateway = "10.0.0.1";
  };

  # ── talosnet interface ──────────────────────────────────────────────────────
  # eth1 is the second NIC added to CT 104 via Proxmox (bridge=talosnet,
  # firewall=0). This provides a direct path to the registry without SNAT or
  # conntrack zone crossing (host-level NAT zone 0 vs. the LXC firewall bridge
  # zone 1, which causes RSTs). The talosnet-dns LXC resolves oci.chezmoi.sh to
  # this IP for clients on the talosnet subnet.
  networking.interfaces.eth1 = {
    ipv4.addresses = [{
      address = "10.128.0.4";
      prefixLength = 24;
    }];
  };

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

  systemd.tmpfiles.rules = [
    "d /persistent 0755 root root - -"
    "d /persistent/zot 0750 zot zot - -"
    "d /persistent/caddy 0750 caddy caddy - -"
    "d /persistent/caddy/Caddy 0750 caddy caddy - -"
  ];
}
