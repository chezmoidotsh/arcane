# Pangolin stack as Docker containers, a 1:1 port of the former Ansible role (roles/pangolin):
#  - pangolin    controller + dashboard (SQLite), Integration API on 127.0.0.1:3003 re-exposed on the tailnet
#  - gerbil      WireGuard tunnel manager; owns the public ports, Traefik shares its network namespace
#  - traefik     reverse proxy, wildcard certificate through Let's Encrypt DNS-01 (Cloudflare)
#  - error-pages themed error responses
#
# State lives in /var/lib/pangolin/config (same layout as the former /opt/pangolin/config): db/, geoip/, letsencrypt/,
# traefik/, and `key` (Gerbil's WireGuard key). Everything secret (server secret, SMTP credentials, Cloudflare token)
# comes from SOPS and is rendered on tmpfs by sops-nix, never written to the disk in clear text.
{ config, lib, pkgs, ... }:
let
  # --- Host-specific values ---------------------------------------------------
  bindIp = config.pangolin.bindIp;

  dashboardDomain = "pangolin.chezmoi.sh";
  # Base domain the exposed resources (auth, grafana, photos, ...) hang off: the rhodes.akn/lungmen.akn Pulumi stacks
  # look it up among the org's domains. It is also the wildcard certificate (chezmoi.sh + *.chezmoi.sh).
  baseDomain = "chezmoi.sh";
  domains = [ dashboardDomain baseDomain ];
  acmeEmail = "noreply@chezmoi.sh";
  corsAllowedOrigins = [ "https://pangolin.chezmoi.sh" "https://ai.chezmoi.sh" ];

  integrationPort = 3003;
  configDir = "/var/lib/pangolin/config";

  # Images: pinned by tag and digest, bump them here (previously Renovate-annotated in the Ansible role defaults).
  # renovate: datasource=docker depName=fosrl/pangolin versioning=docker
  pangolinImage = "docker.io/fosrl/pangolin:ee-1.24.0@sha256:1700457b2d42e3db664edc43760528a11f1d423a5364b8af720474e1b049a8ea"; # Enterprise Edition (was ee-latest)
  # renovate: datasource=docker depName=fosrl/gerbil versioning=docker
  gerbilImage = "docker.io/fosrl/gerbil:1.5.2@sha256:1f6e64eaba7997282c7067ba19922fc7e46b5f73e1a27add3dd66a591d50512f";
  # renovate: datasource=docker depName=traefik versioning=docker
  traefikImage = "docker.io/library/traefik:v3.4.0@sha256:4cf907247939b5d20bf4eff73abd21cb413c339600dde76dbc94a874b2578a27";
  # renovate: datasource=docker depName=ghcr.io/tarampampam/error-pages versioning=docker
  errorPagesImage = "ghcr.io/tarampampam/error-pages:3.7.1@sha256:0ce7e3798b1180d74432c38f4edd3e5072c672926646d79770b7aa48eb3a2d2f";

  yaml = pkgs.formats.yaml { };
  hostRule = lib.concatMapStringsSep " || " (d: "Host(`${d}`)") domains;

  # --- Traefik static configuration ---------------------------------------------
  traefikConfig = yaml.generate "traefik_config.yml" {
    accessLog = {
      filePath = "/var/log/traefik/access.log";
      format = "json";
      bufferingSize = 100;
      filters = {
        statusCodes = [ "200-299" "400-499" "500-599" ];
        retryAttempts = true;
        minDuration = "100ms";
      };
      fields = {
        defaultMode = "drop";
        names = lib.genAttrs [
          "ClientAddr" "ClientHost" "DownstreamContentSize" "DownstreamStatus" "Duration" "RequestMethod"
          "RequestPath" "RequestProtocol" "RetryAttempts" "ServiceName" "StartUTC" "TLSCipher" "TLSVersion"
        ] (_: "keep");
        headers = {
          defaultMode = "drop";
          names = {
            Authorization = "redact";
            Content-Type = "keep";
            Cookie = "redact";
            User-Agent = "keep";
            X-Forwarded-For = "keep";
            X-Forwarded-Proto = "keep";
            X-Real-Ip = "keep";
          };
        };
      };
    };
    # Only reachable inside the Gerbil network namespace (not published).
    api = { insecure = true; dashboard = true; };
    providers = {
      http = { endpoint = "http://pangolin:3001/api/v1/traefik-config"; pollInterval = "5s"; };
      file.filename = "/etc/traefik/dynamic_config.yml";
    };
    experimental.plugins.badger = { moduleName = "github.com/fosrl/badger"; version = "v1.2.0"; };
    log = { level = "INFO"; format = "common"; };
    certificatesResolvers.letsencrypt.acme = {
      # DNS-01: the only way to get a wildcard certificate. CF_DNS_API_TOKEN is passed to the container.
      dnsChallenge.provider = "cloudflare";
      email = acmeEmail;
      storage = "/letsencrypt/acme.json";
      caServer = "https://acme-v02.api.letsencrypt.org/directory";
    };
    entryPoints = {
      web.address = ":80";
      websecure = {
        address = ":443";
        transport.respondingTimeouts.readTimeout = "30m";
        http = {
          middlewares = [ "error-pages@file" ];
          tls.certResolver = "letsencrypt";
        };
      };
    };
    serversTransport.insecureSkipVerify = true;
    ping.entryPoint = "web";
  };

  # --- Traefik dynamic configuration --------------------------------------------
  dynamicConfig = yaml.generate "dynamic_config.yml" {
    http = {
      middlewares = {
        redirect-to-https.redirectScheme.scheme = "https";
        error-pages.errors = { status = [ "400-599" ]; service = "error-pages-service"; query = "/{status}.html"; };
        # Forces the themed 404 template whatever the requested path: used by the catch-all router, which points
        # straight at error-pages-service (no real backend produces a 400-599 for the `errors` middleware to catch).
        force-404-page.replacePath.path = "/404.html";
      };
      routers = {
        main-app-router-redirect = {
          rule = hostRule;
          service = "next-service";
          entryPoints = [ "web" ];
          middlewares = [ "redirect-to-https" ];
        };
        next-router = {
          rule = "(${hostRule}) && !PathPrefix(`/api/v1`)";
          service = "next-service";
          entryPoints = [ "websecure" ];
          middlewares = [ "error-pages" ];
          tls.certResolver = "letsencrypt";
        };
        api-router = {
          rule = "(${hostRule}) && PathPrefix(`/api/v1`)";
          service = "api-service";
          entryPoints = [ "websecure" ];
          middlewares = [ "error-pages" ];
          tls.certResolver = "letsencrypt";
        };
        ws-router = {
          rule = hostRule;
          service = "api-service";
          entryPoints = [ "websecure" ];
          middlewares = [ "error-pages" ];
          tls.certResolver = "letsencrypt";
        };
        # Hosts matching no other router (a made-up toto.chezmoi.sh) would get Traefik's bare "404 page not found"
        # instead of the themed page. Lowest priority so it never shadows the domain routers. `tls.domains` must sit
        # on a router (Traefik silently ignores it on the entrypoint): it is what triggers the wildcard request.
        catchall-router = {
          rule = "HostRegexp(`.+`)";
          service = "error-pages-service";
          entryPoints = [ "websecure" ];
          priority = 1;
          middlewares = [ "force-404-page" ];
          tls = {
            certResolver = "letsencrypt";
            domains = [ { main = baseDomain; sans = [ "*.${baseDomain}" ]; } ];
          };
        };
      };
      services = {
        next-service.loadBalancer.servers = [ { url = "http://pangolin:3002"; } ]; # Next.js
        api-service.loadBalancer.servers = [ { url = "http://pangolin:3000"; } ]; # API / WebSocket
        error-pages-service.loadBalancer.servers = [ { url = "http://error-pages:8080"; } ];
      };
    };
  };

  # --- Pangolin configuration (JSON is valid YAML; secrets are sops placeholders) ---------
  ph = config.sops.placeholder;
  pangolinConfig = builtins.toJSON {
    app = {
      dashboard_url = "https://${dashboardDomain}";
      log_level = "info";
      telemetry = { enabled = true; notifications = true; };
    };
    domains = lib.listToAttrs (lib.imap1 (i: d: {
      name = "domain${toString i}";
      value = { base_domain = d; cert_resolver = "letsencrypt"; prefer_wildcard_cert = true; };
    }) domains);
    server = {
      secret = ph.pangolin_server_secret;
      maxmind_db_path = "./config/geoip/GeoLite2-Country.mmdb";
      integration_port = integrationPort;
      cors.allowed_origins = corsAllowedOrigins;
    };
    gerbil.base_endpoint = dashboardDomain;
    flags = {
      require_email_verification = false;
      disable_signup_without_invite = true;
      disable_user_create_org = true;
      enable_integration_api = true;
    };
    email = {
      smtp_host = "in-v3.mailjet.com";
      smtp_port = 465;
      smtp_user = ph.pangolin_smtp_user;
      smtp_pass = ph.pangolin_smtp_pass;
      smtp_from = "Pangolin <no-reply@chezmoi.sh>";
    };
  };

  dockerBin = "${config.virtualisation.docker.package}/bin/docker";
in
{
  # Binding IP: private (VCN) address of the instance, set by the platform file (platforms/). Docker publishes 80/443 on it only, so
  # that `tailscale serve` can own :443 on the tailnet address without a port clash.
  options.pangolin.bindIp = lib.mkOption {
    type = lib.types.str;
    description = "Private IP address Docker publishes the public ports 80/443 on.";
  };

  config = {
  assertions = [{
    assertion = bindIp != "";
    message = "pangolin.bindIp is empty: run `mise run nixos:binding-ip` (or nixos:oci:*, nixos:e2e) to write extra/etc/pangolin/binding-ip (see docs/MIGRATION_NIXOS.md).";
  }];

  virtualisation.docker.enable = true;
  virtualisation.oci-containers.backend = "docker";

  # --- Secrets -------------------------------------------------------------------
  sops.secrets.pangolin_server_secret = { };
  sops.secrets.pangolin_smtp_user = { };
  sops.secrets.pangolin_smtp_pass = { };
  sops.secrets.cloudflare_dns_api_token = { };
  sops.templates."pangolin-config.yml" = {
    content = pangolinConfig;
    mode = "0440";
  };
  sops.templates."traefik.env".content = ''
    CF_DNS_API_TOKEN=${ph.cloudflare_dns_api_token}
  '';

  # --- Host preparation: directories, Traefik configuration, Docker network ------------
  systemd.services.pangolin-prepare = {
    description = "Prepare the Pangolin state directory, Traefik configuration and Docker network";
    after = [ "docker.service" ];
    requires = [ "docker.service" ];
    before = [ "docker-pangolin.service" "docker-gerbil.service" "docker-traefik.service" "docker-error-pages.service" ];
    requiredBy = [ "docker-pangolin.service" "docker-gerbil.service" "docker-traefik.service" "docker-error-pages.service" ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };
    path = [ pkgs.coreutils ];
    script = ''
      set -euo pipefail
      install -d -m 0755 ${configDir} ${configDir}/db ${configDir}/logs ${configDir}/geoip ${configDir}/traefik \
        ${configDir}/traefik/logs
      # Traefik refuses to start if acme.json is not 0600 (and its directory should not be readable by others).
      install -d -m 0700 ${configDir}/letsencrypt
      [ -e ${configDir}/letsencrypt/acme.json ] || install -m 0600 /dev/null ${configDir}/letsencrypt/acme.json
      chmod 0600 ${configDir}/letsencrypt/acme.json # also covers a file restored from the Ansible-era backup
      install -m 0644 ${traefikConfig} ${configDir}/traefik/traefik_config.yml
      install -m 0644 ${dynamicConfig} ${configDir}/traefik/dynamic_config.yml
      ${dockerBin} network inspect pangolin >/dev/null 2>&1 || ${dockerBin} network create pangolin >/dev/null
    '';
  };

  # --- Containers -----------------------------------------------------------------
  virtualisation.oci-containers.containers = {
    pangolin = {
      image = pangolinImage;
      volumes = [
        "${configDir}:/app/config"
        # Rendered by sops-nix (tmpfs): mounted over the file of the directory above.
        "${config.sops.templates."pangolin-config.yml".path}:/app/config/config.yml:ro"
      ];
      # Integration API: localhost only, re-exposed on the tailnet by `pangolin-tailscale-serve`. Never public.
      ports = [ "127.0.0.1:${toString integrationPort}:${toString integrationPort}" ];
      extraOptions = [
        "--network=pangolin"
        "--health-cmd=curl -f http://localhost:3001/api/v1/"
        "--health-interval=3s"
        "--health-timeout=3s"
        "--health-retries=15"
      ];
    };

    gerbil = {
      image = gerbilImage;
      dependsOn = [ "pangolin" ];
      cmd = [
        "--reachableAt=http://gerbil:3004"
        "--generateAndSaveKeyTo=/var/config/key"
        "--remoteConfig=http://pangolin:3001/api/v1/"
      ];
      volumes = [ "${configDir}:/var/config" ];
      ports = [
        "51820:51820/udp" # WireGuard site tunnels (Newt)
        "21820:21820/udp" # WireGuard client tunnels
        # Traefik shares this container's network namespace, so its ports are published here.
        "${bindIp}:443:443"
        "${bindIp}:80:80"
        "127.0.0.1:443:443" # health checks
        "127.0.0.1:80:80"
      ];
      extraOptions = [ "--network=pangolin" "--cap-add=NET_ADMIN" "--cap-add=SYS_MODULE" ];
    };

    error-pages = {
      image = errorPagesImage;
      environment.TEMPLATE_NAME = "l7";
      cmd = [ "serve" "--show-details" ];
      extraOptions = [ "--network=pangolin" "--label=traefik.enable=false" ];
    };

    traefik = {
      image = traefikImage;
      dependsOn = [ "pangolin" "gerbil" "error-pages" ];
      cmd = [ "--configFile=/etc/traefik/traefik_config.yml" ];
      environmentFiles = [ config.sops.templates."traefik.env".path ];
      volumes = [
        "${configDir}/traefik:/etc/traefik:ro"
        "${configDir}/letsencrypt:/letsencrypt"
        "${configDir}/traefik/logs:/var/log/traefik"
      ];
      # Same network namespace as Gerbil (compose `network_mode: service:gerbil`).
      extraOptions = [ "--network=container:gerbil" ];
    };
  };

  # Containers restart on their own (oci-containers sets Restart=always), which covers the start-up race between
  # Pangolin's health and Gerbil/Traefik that Compose handled with `condition: service_healthy`.

  # --- Integration API on the tailnet ----------------------------------------------------
  # `tailscale serve` publishes it at https://kazimierz-akn.<tailnet>.ts.net (port 443), the URL the Pulumi stacks
  # read from their `pangolin:url` config. It binds the tailnet address only, hence `bindIp` above.
  systemd.services.pangolin-tailscale-serve = {
    description = "Expose the Pangolin Integration API on the tailnet";
    after = [ "tailscaled-autoconnect.service" "docker-pangolin.service" ];
    wants = [ "tailscaled-autoconnect.service" ];
    wantedBy = [ "multi-user.target" ];
    path = [ config.services.tailscale.package ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      Restart = "on-failure";
      RestartSec = "30s";
    };
    script = ''
      tailscale serve --bg --https=443 http://127.0.0.1:${toString integrationPort}
    '';
  };

  # Hardening of the containers' log volume: Docker daemon logs capped at 3 x 10 MB.
  virtualisation.docker.daemon.settings = {
    log-driver = "json-file";
    log-opts = { max-size = "10m"; max-file = "3"; };
  };
};
}
