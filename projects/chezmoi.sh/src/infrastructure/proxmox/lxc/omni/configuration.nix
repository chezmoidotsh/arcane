# ─────────────────────────────────────────────────────────────────────────────
# omni.chezmoi.sh — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# Supplies only site-specific values that are not part of the module logic:
# system identity, locale, fixed service uids, and the Omni / Dex options.
#
# The modules in ./modules/ own all reverse-proxy and hardening config:
#   * caddy.nix     — TLS termination + path routing (/dex/* → Dex, / → Omni)
#   * hardening.nix — sysctl, firewall, login surface, journald
#   * secrets.nix   — writes /etc/omni/secrets when DEX_ADMIN_PASSWORD_HASH is set
#
# Persistent state — a single Proxmox mp0 volume mounted at `/persistent`
# holds both Omni's data (`/persistent/omni`) and Caddy's data
# (`/persistent/caddy`). Each daemon's canonical state directory is
# redirected with the corresponding `*.dataDir` option so the catalog
# module and the nixpkgs caddy module stay unmodified.
#
# Provision the volume at LXC creation:
#
#   pct create <vmid> local:vztmpl/omni.<ver>-amd64.tar.xz ... \
#     --mp0 <storage>:<size>,mp=/persistent
#
# `services.omni.allowEphemeralState = true` below disables the assertion the
# catalog module would otherwise raise — the mount is provided by Proxmox,
# not by `fileSystems.*`. See README §"Proxmox LXC creation" for the full
# `pct create` recipe and the mandatory pre-chown step.
#
# First-boot checklist:
#   1. Confirm omni.service is active:  systemctl status omni
#   2. Back up /persistent/omni/omni.asc   (GPG key — losing it = losing state)
#   3. Back up /persistent/omni/pki/ca.pem (distribute to Talos machines)
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, lib, dexAdminPasswordHash ? "", ... }:

{
  system.stateVersion = "26.05";
  networking.hostName = "omni";

  time.timeZone = "Etc/UTC";
  i18n.defaultLocale = "C.UTF-8";

  # ── Fixed service uids ───────────────────────────────────────────────────
  # uid/gid pinned so the persistent volume's host-side ownership stays stable
  # across image rebuilds (host uid = container uid + 100000 with the default
  # Proxmox unprivileged uid map). The upgrade script chowns both subtrees on
  # cutover with the same offsets.
  users.users.omni = {
    isSystemUser = true;
    uid = 980;
    group = "omni";
  };
  users.groups.omni = { gid = 980; };

  # nixpkgs' caddy module already declares users.users.caddy with the
  # nixpkgs-allocated uid (239 at time of writing). Override to a stable
  # 997 so the host-side chown math in the upgrade script is predictable.
  users.users.caddy.uid = lib.mkForce 997;
  users.groups.caddy.gid = lib.mkForce 997;

  # ── Persistent volume layout ─────────────────────────────────────────────
  # mp0 is mounted at /persistent. Subdirectories are owned by the daemon
  # that writes them; the catalog tmpfiles for /persistent/omni/{pki,db,gpg}
  # take it from there.
  systemd.tmpfiles.rules = [
    "d /persistent       0755 root  root  - -"
    "d /persistent/omni  0750 omni  omni  - -"
    "d /persistent/caddy 0750 caddy caddy - -"
  ];

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

  # ── Console toolbox ──────────────────────────────────────────────────────
  # Minimal set for emergency triage from `pct enter`:
  #   curl — probe /healthz, /dex/.well-known/openid-configuration locally
  #   jq   — pretty-print Omni / Dex JSON responses
  environment.systemPackages = with pkgs; [ curl jq ];

  # ── Local hostname resolution ────────────────────────────────────────────
  # Omni resolves `oidcProviderUrl` at runtime to reach Dex through Caddy.
  # The hosts entry forces the local lookup to loopback so the flow works
  # whether or not external DNS already points at this LXC, and avoids a
  # round-trip through the gateway just to reach a service on the same host.
  networking.hosts."127.0.0.1" = [ "omni.chezmoi.sh" ];

  # ── Caddy persistent state ───────────────────────────────────────────────
  # Cert chains + ACME account data land under /persistent/caddy/caddy/...
  # via nixpkgs' caddy module dataDir option. journald remains volatile.
  services.caddy.dataDir = "/persistent/caddy";

  # ── Omni ─────────────────────────────────────────────────────────────────
  services.omni = {
    enable = true;

    # mp0 mounted at /persistent by Proxmox; bypass the NixOS-side assertion.
    allowEphemeralState = true;

    # All Omni state under /persistent/omni (pki/, db/, gpg/, omni.asc).
    dataDir = "/persistent/omni";

    domain = "omni.chezmoi.sh";
    # advertiseHost may be an IP or a DNS name now (the catalog PKI init picks
    # the right SAN form). Keep the FQDN so DNS handles WG endpoint discovery
    # for Talos machines wherever they live.
    advertiseHost = "omni.chezmoi.sh";

    # Caddy is the only public surface; Omni's UI binds on loopback with its
    # own self-signed PKI cert (Caddy proxies with tls_insecure_skip_verify).
    # The catalog module already emits `--advertised-api-url=https://${domain}/`
    # from `services.omni.domain`, so no extraArgs override is needed.
    bindAddr = "127.0.0.1:8443";

    # Machine API on loopback — Caddy terminates TLS on port 8090 externally
    # (with the DNS-01 Let's Encrypt cert) and proxies to this internal port.
    # This avoids Talos machines needing to trust Omni's self-signed PKI CA.
    machineApiBindAddr = "127.0.0.1:9090";

    # Dex is served through Caddy under the /dex sub-path. The catalog Dex
    # module sets `issuer = oidcProviderUrl`, and Dex automatically prefixes
    # every route with the issuer's path, so this single URL covers both
    # discovery and the auth/token endpoints.
    oidcProviderUrl = "https://omni.chezmoi.sh/dex";

    initialUsers = [ "CHANGEME@example.com" ];
    eulaAcceptName = "CHANGEME Name";
    eulaAcceptEmail = "CHANGEME@example.com";

    environmentFile = "/etc/omni/secrets";

    dex = {
      enable = true;
      # Loopback only — Caddy is the public surface (see modules/caddy.nix).
      bindAddr = "127.0.0.1:5557";
      users = [{
        email = "CHANGEME@example.com";
        username = "admin";
        hashEnvVar = "DEX_ADMIN_PASSWORD_HASH";
      }];
      # Set to a nix-store file so dex.nix can read DEX_ADMIN_PASSWORD_HASH
      # at Nix eval time (builtins.readFile only works on build-accessible
      # paths). When dexAdminPasswordHash is empty (pure build), falls back
      # to the runtime path so the module still evaluates cleanly.
      environmentFile =
        if dexAdminPasswordHash != ""
        then
          toString
            (pkgs.writeText "dex-env"
              "DEX_ADMIN_PASSWORD_HASH=${dexAdminPasswordHash}\n")
        else "/etc/omni/secrets";
    };
  };
}
