# ─────────────────────────────────────────────────────────────────────────────
# oci-staging.chezmoi.sh — Zot OCI registry LXC (Proxmox)
# ─────────────────────────────────────────────────────────────────────────────
# This file is the **deployment** layer. It imports the reusable module
# library at `catalog/flakes/chezmoi.sh/lxc-oci-registry` and supplies every
# site-specific value:
#
#   * Public domain                — oci-staging.chezmoi.sh
#   * Upstream pull-through list   — see upstreams.nix
#   * GC retention policies        — defined below
#   * Caddy build with Cloudflare  — `pkgs.caddy.withPlugins`
#   * TLS secrets                  — Cloudflare API token injected at build
#
# Build inputs (flake.nix injects them through `_module.args`):
#
#   zotPackage         — Zot binary to run.
#   cloudflareToken    — Optional. When non-empty, baked into the image so
#                        Caddy can obtain a certificate on first boot.
#
# Operator surface:
#
#   * No SSH service. Console access is via Proxmox `pct enter <vmid>`.
#   * Default firewall: only TCP/80 and TCP/443 cross the LXC boundary.
#   * Zot listens on 127.0.0.1:5000 only — Caddy is the public surface.
#   * Management API (read-only) at
#     https://oci-staging.chezmoi.sh/v2/_zot/ext/mgmt.
#
# See README.md for the full Proxmox + firewall deployment runbook.
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, lib, zotPackage, cloudflareToken ? "", ... }:

let
  upstreams = import ./upstreams.nix { inherit lib; };
in
{
  # ── System identity ────────────────────────────────────────────────────────
  system.stateVersion = "26.05";
  networking.hostName = "oci-registry";

  time.timeZone = "Etc/UTC";
  i18n.defaultLocale = "C.UTF-8";

  # ── Registry (Zot) ─────────────────────────────────────────────────────────
  services.lxc-oci-registry.zot = {
    package = zotPackage;
    storageDir = "/var/lib/zot";

    # Enable mgmt + search + ui extensions (read-only). The mgmt endpoint
    # is reachable at https://oci-staging.chezmoi.sh/v2/_zot/ext/mgmt and
    # returns the running configuration with secrets stripped.
    enableManagementAPI = true;

    settings = {
      storage = {
        gcDelay = "1h"; # delay before a blob is eligible for GC
        gcInterval = "24h"; # how often the GC worker runs

        # ── Retention policy ────────────────────────────────────────────
        # Two repositories, two rules:
        #
        #   * `ghcr.io/chezmoidotsh/**` — first-party images. Keep the 3
        #     most-recent tags (we redeploy frequently).
        #   * Everything else — pull-through cache. Keep the 5 most
        #     recently *pulled* tags within a 6-month sliding window.
        # ----------------------------------------------------------------
        retention = {
          dryRun = false;
          delay = "24h";
          policies = [
            {
              # Maintainer-pushed images.
              repositories = [ "ghcr.io/chezmoidotsh/**" ];
              deleteReferrers = false;
              deleteUntagged = true;
              keepTags = [{ mostRecentlyPushedCount = 3; }];
            }
            {
              # Pull-through cache (everything else).
              repositories = [ "**" ];
              deleteReferrers = false;
              deleteUntagged = true;
              keepTags = [
                {
                  mostRecentlyPulledCount = 5;
                  pulledWithin = "4380h"; # 6 months
                }
              ];
            }
          ];
        };
      };

      # The reverse proxy strips the public hostname and forwards
      # path-rewritten requests to localhost:5000. `externalUrl` tells Zot
      # the canonical URL clients see — used in 30x redirects.
      http = {
        externalUrl = "https://oci-staging.chezmoi.sh";
        # docker2s2 compat keeps Docker clients pulling fat manifests happy.
        compat = [ "docker2s2" ];

        # Anonymous read for everyone. Pushes are not exposed (no
        # `defaultPolicy`/`adminPolicy`) — first-party images are pushed
        # from the maintainer's workstation over a localhost tunnel.
        accessControl.repositories."**".anonymousPolicy = [ "read" ];
      };

      log.level = "info";

      extensions = {
        # Periodic integrity check on stored blobs.
        scrub = {
          enable = true;
          interval = "24h";
        };

        # ── Pull-through cache ────────────────────────────────────────────
        sync = {
          enable = true;
          registries = upstreams.registries;
        };
      };
    };
  };

  # ── Reverse proxy (Caddy + Cloudflare DNS-01) ──────────────────────────────
  services.lxc-oci-registry.caddy = {
    # Caddy with the Cloudflare DNS plugin for the ACME DNS-01 challenge.
    # The hash below is the output of `pkgs.caddy.withPlugins` for this
    # specific plugin version — refresh it when bumping the plugin.
    package = pkgs.caddy.withPlugins {
      plugins = [ "github.com/caddy-dns/cloudflare@v0.2.4" ];
      hash = "sha256-bzMqxWTqrJ1skZmRTXyEMCKStXpljbqe5r0Ve2cnBfM=";
    };

    domain = "oci-staging.chezmoi.sh";
    upstreamPort = 5000;

    https.enable = true;
    https.extraConfig = ''
      tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
      }
    '';
  };

  # ── Caddy secrets (Cloudflare API token) ───────────────────────────────────
  # When `cloudflareToken` is non-empty (build performed with --impure +
  # CLOUDFLARE_API_TOKEN in the environment), the token is written into
  # /etc/caddy/secrets and the file is owned by the caddy user.
  #
  # When empty (pure build), the file is *not* created — Caddy starts but
  # ACME issuance fails until the operator drops the token in manually.
  # The `-` prefix on EnvironmentFile makes systemd tolerate the missing
  # file at boot.
  environment.etc."caddy/secrets" = lib.mkIf (cloudflareToken != "") {
    text = "CLOUDFLARE_API_TOKEN=${cloudflareToken}\n";
    mode = "0400";
    user = "caddy";
    group = "caddy";
  };
  systemd.services.caddy.serviceConfig.EnvironmentFile = "-/etc/caddy/secrets";

  # ── Hardening profile ──────────────────────────────────────────────────────
  # Pulls in:
  #   * sysctl defaults (IP forwarding off, redirects off, SYN cookies, …)
  #   * service surface trimming (no avahi/cups/polkit/udisks)
  #   * documentation off (no man-db, info, nixos-docs)
  #   * firewall default deny + open :80 + :443
  #   * journald → console (so `pct console <vmid>` shows boot)
  services.lxc-oci-registry.hardening.enable = true;

  # ── Console shell (pct enter) ─────────────────────────────────────────────
  # `pct enter` spawns /proc/1/exe (systemd) → /bin/sh without a login shell,
  # so /run/current-system/sw/bin is never added to PATH. Switching root to
  # bash and sourcing /etc/set-environment in shellInit ensures every
  # non-login bash session (including `pct enter`) gets the full NixOS PATH.
  users.users.root.shell = pkgs.bashInteractive;
  programs.bash.shellInit = ''
    if [ -z "''${__NIXOS_SET_ENVIRONMENT_DONE-}" ]; then
      . /etc/set-environment
    fi
  '';

  # ── Sanity / observability ─────────────────────────────────────────────────
  # Minimal toolbox kept on the console for emergency triage:
  #   * curl  — probe /v2/ and the mgmt endpoint locally
  #   * jq    — pretty-print the mgmt JSON response
  #
  # `htpasswd` is intentionally not installed. `services.lxc-oci-registry.zot.htpasswdFile`
  # is null in this deployment, and pulling in ~50 MiB of Apache HTTP server
  # just for one binary is not worth it. If credentials ever need to be
  # generated, do so from outside the LXC and bake the file via the secrets
  # pipeline.
  environment.systemPackages = with pkgs; [
    curl
    jq
  ];
}
