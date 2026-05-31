{ pkgs, lib, zotPackage, cloudflareToken ? "", ... }:

{
  # ── System basics ──────────────────────────────────────────────────────────
  system.stateVersion = "26.05";
  networking.hostName = "oci-registry";

  # ── Zot registry ──────────────────────────────────────────────────────────
  services.lxc-oci-registry.zot = {
    package = zotPackage;
    storageDir = "/var/lib/zot";

    settings = {
      storage = {
        gc = true;
        gcDelay = "1h";
        gcInterval = "24h";
        retention = {
          dryRun = false;
          delay = "24h";
          policies = [
            {
              # Maintainer-pushed images: keep last 3
              repositories = [ "ghcr.io/chezmoidotsh/**" ];
              deleteReferrers = false;
              deleteUntagged = true;
              keepTags = [
                { mostRecentlyPushedCount = 3; }
              ];
            }
            {
              # Pull-through cache: keep last 5 pulled within 6 months
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

      http = {
        address = "127.0.0.1";
        port = "5000";
        externalUrl = "oci-staging.chezmoi.sh";
        compat = [ "docker2s2" ];
        accessControl.repositories."**".anonymousPolicy = [ "read" ];
      };

      extensions = {
        scrub = {
          enable = true;
          interval = "24h";
        };

        sync = {
          enable = true;
          registries = [
            {
              urls = [ "https://docker.io" "https://registry-1.docker.io" ];
              content = [{ destination = "/docker.io"; prefix = "**"; }];
              onDemand = true;
              preserveDigest = true;
              tlsVerify = true;
            }
            {
              urls = [ "https://gcr.io" ];
              content = [{ destination = "/gcr.io"; prefix = "**"; }];
              onDemand = true;
              preserveDigest = true;
              tlsVerify = true;
            }
            {
              urls = [ "https://ghcr.io" ];
              content = [{ destination = "/ghcr.io"; prefix = "**"; }];
              onDemand = true;
              preserveDigest = true;
              tlsVerify = true;
            }
            {
              urls = [ "https://ecr-public.aws.com" "https://public.ecr.aws" ];
              content = [{ destination = "/ecr-public.aws.com"; prefix = "**"; }];
              onDemand = true;
              preserveDigest = true;
              tlsVerify = true;
            }
            {
              urls = [ "https://quay.io" ];
              content = [{ destination = "/quay.io"; prefix = "**"; }];
              onDemand = true;
              preserveDigest = true;
              tlsVerify = true;
            }
            {
              urls = [ "https://registry.gitlab.com" ];
              content = [{ destination = "/registry.gitlab.com"; prefix = "**"; }];
              onDemand = true;
              preserveDigest = true;
              tlsVerify = true;
            }
            {
              urls = [ "https://registry.k8s.io" ];
              content = [{ destination = "/registry.k8s.io"; prefix = "**"; }];
              onDemand = true;
              preserveDigest = true;
              tlsVerify = true;
            }
            {
              urls = [ "https://xpkg.crossplane.io" ];
              content = [{ destination = "/xpkg.crossplane.io"; prefix = "**"; }];
              onDemand = true;
              preserveDigest = true;
              tlsVerify = true;
            }
            {
              urls = [ "https://mcr.microsoft.com" ];
              content = [{ destination = "/mcr.microsoft.com"; prefix = "**"; }];
              onDemand = true;
              preserveDigest = true;
              tlsVerify = true;
            }
            {
              urls = [ "https://oci.external-secrets.io" ];
              content = [{ destination = "/oci.external-secrets.io"; prefix = "**"; }];
              onDemand = true;
              preserveDigest = true;
              tlsVerify = true;
            }
            {
              urls = [ "https://code.forgejo.org" ];
              content = [{ destination = "/code.forgejo.org"; prefix = "**"; }];
              onDemand = true;
              preserveDigest = true;
              tlsVerify = true;
            }
          ];
        };
      };
    };
  };

  # ── Caddy reverse proxy (HTTPS + DNS-01 via Cloudflare) ───────────────────
  services.lxc-oci-registry.caddy = {
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

  # Bake the Caddy secrets file into the image when cloudflareToken is provided at
  # build time via --secrets (see README). When absent, Caddy starts but TLS fails
  # until the operator places /etc/caddy/secrets manually.
  environment.etc."caddy/secrets" = lib.mkIf (cloudflareToken != "") {
    text = "CLOUDFLARE_API_TOKEN=${cloudflareToken}\n";
    mode = "0400";
    user = "caddy";
    group = "caddy";
  };
  # '-' prefix: Caddy starts even if the file is absent (pure build or first boot).
  systemd.services.caddy.serviceConfig.EnvironmentFile = "-/etc/caddy/secrets";

  # ── Admin user ────────────────────────────────────────────────────────────
  users.users.nixos = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
    openssh.authorizedKeys.keys = [
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIP2wkl8OiO7EkQp8Y8mLjL0s4mgZy3GiyrGY/XD7FZQ9"
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK0QoYptOmqsFNN7uOiFb7NatkhiGnSQc6itYri6bUnT"
    ];
  };
  security.sudo.wheelNeedsPassword = false;

  # ── SSH access ────────────────────────────────────────────────────────────
  services.openssh = {
    enable = true;
    settings.PermitRootLogin = "no";
  };

  # ── Proxmox LXC console ───────────────────────────────────────────────────
  # ForwardToConsole + TTYPath route journal entries to pct console <vmid>.
  services.journald.console = "/dev/console";
  services.journald.extraConfig = "ForwardToConsole=yes";

  # ── Firewall ──────────────────────────────────────────────────────────────
  networking.firewall = {
    enable = true;
    allowedTCPPorts = [ 22 80 443 ];
  };
}
