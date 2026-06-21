# ─────────────────────────────────────────────────────────────────────────────
# Pangolin WireGuard gateway stack — kazimierz.akn
# ─────────────────────────────────────────────────────────────────────────────
# Deploys Pangolin, Gerbil, and Traefik as native NixOS systemd services —
# no container runtime required.
#
# Service topology (all on localhost):
#   pangolin  — controller + dashboard (ports 3000/3001/3002)
#   gerbil    — WireGuard tunnel manager (port 3004 internal; UDP 51820/21820 public)
#   traefik   — reverse proxy / TLS termination (ports 80/443)
#   error-pages (error-pages.nix) — 4xx/5xx fallback renderer (port 8080)
#
# Traefik providers:
#   HTTP provider → http://localhost:3001/api/v1/traefik-config  (Pangolin-managed routes)
#   File provider → NixOS-managed dynamicConfigOptions           (static middlewares)
#
# CrowdSec and Badger are intentionally absent — excluded per migration scope.
#
# ── Runtime secrets ───────────────────────────────────────────────────────────
# No secrets are embedded in the Nix store.  Services read them from the
# persistent block volume at /var/lib/kazimierz/secrets/ (provisioned once by the
# operator via SCP on first run — see storage.nix). They persist across reboots
# and instance recreation, so there is no re-provisioning step after a reboot.
#
# Required files (plain value, no KEY=value wrapper):
#   /var/lib/kazimierz/secrets/pangolin-secret      — Pangolin server shared secret
#   /var/lib/kazimierz/secrets/cloudflare-api-token — Cloudflare DNS token for ACME
#                                                     (KEY=value, systemd EnvironmentFile)
#
# Optional files (SMTP relay — email features disabled if absent):
#   /var/lib/kazimierz/secrets/smtp-user
#   /var/lib/kazimierz/secrets/smtp-pass
#
# ── Packages ─────────────────────────────────────────────────────────────────
# Both packages are available in nixpkgs-unstable:
#   pkgs.fosrl-pangolin  — Node.js/Next.js controller + dashboard
#   pkgs.fosrl-gerbil    — Go WireGuard tunnel manager
#
# ── Access token (Pangolin bootstrap) ────────────────────────────────────────
# On first boot, extract the one-time setup token from the journal:
#   journalctl -u pangolin --no-pager | grep "Token:"
# Then visit https://pangolin.chezmoi.sh/auth/initial-setup.
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, lib, ... }:

let
  # ── Config template ──────────────────────────────────────────────────────────
  # Stored in /nix/store — contains no secrets.  The configure script below
  # substitutes @PLACEHOLDER@ values from /run/secrets/nix/ at service startup.
  pangolinConfigTemplate = pkgs.writeText "pangolin-config.yml.tmpl" ''
    app:
      dashboard_url: "https://pangolin.chezmoi.sh"
      log_level: "info"
      telemetry:
        enabled: false
        notifications: false

    domains:
      domain1:
        base_domain: "chezmoi.sh"
        cert_resolver: "letsencrypt"

    server:
      secret: "@PANGOLIN_SECRET@"
      cors:
        allowed_origins:
          - "https://pangolin.chezmoi.sh"
          - "https://ai.chezmoi.sh"

    gerbil:
      base_endpoint: "pangolin.chezmoi.sh"

    flags:
      require_email_verification: false
      disable_signup_without_invite: true
      disable_user_create_org: true

    geoip:
      maxmind_db_path: "/var/lib/geoip/GeoLite2-Country.mmdb"

    email:
      smtp_host: "in-v3.mailjet.com"
      smtp_port: 465
      smtp_user: "@SMTP_USER@"
      smtp_pass: "@SMTP_PASS@"
      smtp_from: "noreply@chezmoi.sh"
  '';

  # ── Configure script ─────────────────────────────────────────────────────────
  # Runs as ExecStartPre for pangolin.  Reads secrets from /run/secrets/nix/
  # and generates the final config.yml at /var/lib/pangolin/config/config.yml.
  # Pangolin reads config from <WorkingDirectory>/config/config.yml (no --config-path flag).
  pangolinConfigure = pkgs.writers.writeBash "pangolin-configure" ''
    set -euo pipefail

    secrets=/var/lib/kazimierz/secrets
    config=/var/lib/kazimierz/pangolin/config/config.yml

    # pangolin-secret is mandatory
    if [ ! -r "$secrets/pangolin-secret" ]; then
      echo "pangolin-configure: $secrets/pangolin-secret not found — refusing to start" >&2
      exit 1
    fi

    PANGOLIN_SECRET=$(cat "$secrets/pangolin-secret")
    SMTP_USER=$(cat "$secrets/smtp-user" 2>/dev/null || echo "")
    SMTP_PASS=$(cat "$secrets/smtp-pass" 2>/dev/null || echo "")

    ${pkgs.gnused}/bin/sed \
      -e "s|@PANGOLIN_SECRET@|$PANGOLIN_SECRET|g" \
      -e "s|@SMTP_USER@|$SMTP_USER|g" \
      -e "s|@SMTP_PASS@|$SMTP_PASS|g" \
      ${pangolinConfigTemplate} > "$config"

    chmod 0600 "$config"
  '';
in
{
  # ── Pangolin ─────────────────────────────────────────────────────────────────
  # ExecStartPre generates /var/lib/pangolin/config/config.yml from the
  # template and runtime secrets; pangolin reads it from the WorkingDirectory.
  systemd.services.pangolin = {
    description = "Pangolin WireGuard gateway controller";
    wantedBy = [ "multi-user.target" ];
    after = [ "network.target" "var-lib-kazimierz.mount" ];
    unitConfig.RequiresMountsFor = "/var/lib/kazimierz";

    serviceConfig = {
      ExecStartPre = pangolinConfigure;
      ExecStart = "${pkgs.fosrl-pangolin}/bin/pangolin";
      WorkingDirectory = "/var/lib/kazimierz/pangolin";
      Restart = "on-failure";
      RestartSec = "5s";
      User = "root"; # Needs stable root UID for WireGuard key material
    };
  };

  # ── Gerbil ───────────────────────────────────────────────────────────────────
  # Manages WireGuard kernel interfaces.  Requires CAP_NET_ADMIN.
  # --reachableAt: address Pangolin uses to reach Gerbil's management API
  #               (same host → localhost; in Docker this was the container name).
  # --remoteConfig: Pangolin API endpoint Gerbil polls for tunnel configuration.
  systemd.services.gerbil = {
    description = "Gerbil WireGuard tunnel manager";
    wantedBy = [ "multi-user.target" ];
    after = [ "pangolin.service" "network.target" "var-lib-kazimierz.mount" ];
    requires = [ "pangolin.service" ];
    unitConfig.RequiresMountsFor = "/var/lib/kazimierz";

    serviceConfig = {
      ExecStart = "${pkgs.fosrl-gerbil}/bin/gerbil"
        + " --reachableAt=http://localhost:3004"
        + " --generateAndSaveKeyTo=/var/lib/kazimierz/gerbil/key"
        + " --remoteConfig=http://localhost:3001/api/v1/";
      Restart = "on-failure";
      RestartSec = "5s";
      # WireGuard interface management
      CapabilityBoundingSet = [ "CAP_NET_ADMIN" ];
      AmbientCapabilities = [ "CAP_NET_ADMIN" ];
    };
  };

  # ── Traefik ───────────────────────────────────────────────────────────────────
  # Both providers active simultaneously:
  #   HTTP provider: Pangolin injects tunnel routes dynamically.
  #   File provider: NixOS-managed static middlewares (dynamicConfigOptions).
  services.traefik = {
    enable = true;

    # State (acme.json) on the persistent volume. The NixOS module creates and
    # owns this dir via systemd StateDirectory (DynamicUser), so it must NOT be
    # pre-created by storage.nix's tmpfiles.
    dataDir = "/var/lib/kazimierz/traefik";

    staticConfigOptions = {
      providers.http = {
        endpoint = "http://localhost:3001/api/v1/traefik-config";
        pollInterval = "5s";
      };

      certificatesResolvers.letsencrypt.acme = {
        email = "noreply@chezmoi.sh";
        # acme.json lives under the persistent volume (services.traefik.dataDir).
        storage = "/var/lib/kazimierz/traefik/acme.json";
        dnsChallenge = {
          provider = "cloudflare";
          resolvers = [ "1.1.1.1:53" "8.8.8.8:53" ];
        };
      };

      entryPoints = {
        web.address = ":80";
        websecure = {
          address = ":443";
          http.tls.certResolver = "letsencrypt";
        };
      };

      serversTransport.insecureSkipVerify = true;
      ping.entryPoint = "web";
    };

    # Static middlewares in the file provider.  Pangolin-managed tunnel routes
    # arrive via the HTTP provider above and are NOT declared here.
    dynamicConfigOptions = {
      http = {
        services = {
          error-pages.loadBalancer.servers = [{ url = "http://127.0.0.1:8080"; }];
        };
        middlewares = {
          redirect-to-https.redirectScheme.scheme = "https";

          error-pages.errors = {
            status = [ "400-599" ];
            service = "error-pages";
            query = "/{status}.html";
          };

          security-headers.headers = {
            customResponseHeaders = {
              Server = "";
              X-Powered-By = "";
            };
            contentTypeNosniff = true;
            customFrameOptionsValue = "SAMEORIGIN";
            referrerPolicy = "strict-origin-when-cross-origin";
            forceSTSHeader = true;
            stsIncludeSubdomains = true;
            stsSeconds = 63072000;
            stsPreload = true;
          };
        };
      };
    };
  };

  # Inject Cloudflare token for ACME DNS-01.
  # File format (single line): CLOUDFLARE_DNS_API_TOKEN=<token>
  # Provisioned on the persistent volume (see storage.nix). Marked optional with
  # a leading "-" so traefik still starts before the operator SCPs it on first run.
  systemd.services.traefik = {
    serviceConfig.EnvironmentFile = [ "-/var/lib/kazimierz/secrets/cloudflare-api-token" ];
    after = [ "var-lib-kazimierz.mount" ];
    unitConfig.RequiresMountsFor = "/var/lib/kazimierz";
  };

  # ── State subdirectories on the persistent volume ──────────────────────────────
  # The volume root and the pangolin/gerbil/secrets dirs are created by
  # storage.nix; here we add Pangolin's config subtree (config.yml is written at
  # runtime by the ExecStartPre script). tmpfiles runs after the volume is mounted.
  systemd.tmpfiles.rules = [
    "d /var/lib/kazimierz/pangolin/config      0700 root root -"
    "d /var/lib/kazimierz/pangolin/config/db   0700 root root -"
    "d /var/lib/kazimierz/pangolin/config/logs 0700 root root -"
  ];
}
