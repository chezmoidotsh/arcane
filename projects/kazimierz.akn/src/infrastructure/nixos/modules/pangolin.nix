# ─────────────────────────────────────────────────────────────────────────────
# Pangolin + Gerbil + Traefik -- native services.pangolin (nixpkgs)
# ─────────────────────────────────────────────────────────────────────────────
# nixpkgs ships a first-class services.pangolin module (nixos-26.05+, see
# nixos/modules/services/networking/pangolin.nix upstream) that wires
# fosrl-pangolin + fosrl-gerbil + Traefik together as native systemd
# services -- config.yml, the ACME HTTP-01 challenge, and Traefik's dynamic
# config (sourced live from Pangolin's own API) are all handled by the
# module already. No CrowdSec anywhere in this path: replaced by Pangolin's
# built-in GeoRestriction (geoip.nix seeds the database it reads) and the
# bundled "badger" Traefik plugin (module-managed, not this file's concern).
#
# Values below are ported from the current Ansible-templated config.yml
# (projects/kazimierz.akn/src/infrastructure/ansible/roles/pangolin/templates/config.yml.j2
# + inventory/host_vars/kazimierz.yml) so the migration doesn't silently
# change dashboard behavior. Anything the module already defaults to the
# same value (domains.domain1, gerbil.base_endpoint, disable_signup_without_invite)
# is left alone rather than repeated here.
#
# error-pages (ghcr.io/tarampampam/error-pages, themed Traefik error
# responses) is deliberately dropped -- it has no native nix package, and
# adding a container runtime just for one cosmetic piece would undercut the
# whole point of this migration (no Docker on the host at all).
# ponytail: Traefik's default error responses are plain, not themed. Add
# back via a podman/oci-containers unit if a branded error page becomes a
# real requirement.
{ ... }:

{
  services.pangolin = {
    enable = true;
    openFirewall = true; # 80, 443, 51820/udp (Gerbil's WireGuard port)

    baseDomain = "pangolin.chezmoi.sh";
    dashboardDomain = "pangolin.chezmoi.sh";
    letsEncryptEmail = "noreply@chezmoi.sh";

    # SERVER_SECRET (min 8 chars) lives here, on the persistent volume,
    # never in the Nix store or this repo. Provisioned once by the operator
    # (see README.md) -- resolves issue 1077's "secrets home" open question
    # in favor of the volume, the option the issue itself recommended.
    environmentFile = "/var/lib/pangolin/secrets/pangolin.env";

    settings = {
      app.log_level = "info";

      server = {
        cors.allowed_origins = [
          "https://pangolin.chezmoi.sh"
          "https://ai.chezmoi.sh"
        ];
        # Relative to the service's WorkingDirectory (cfg.dataDir, i.e.
        # /var/lib/pangolin) -- matches the path geoip.nix downloads to and
        # the value the current Ansible config.yml.j2 already uses.
        maxmind_db_path = "./config/geoip/GeoLite2-Country.mmdb";
      };

      flags = {
        require_email_verification = false;
        disable_user_create_org = true;
      };

      # smtp_user/smtp_pass come from the environmentFile above
      # (EMAIL_SMTP_USER/EMAIL_SMTP_PASS -- Pangolin's documented dot-to-
      # underscore env override convention). no_reply is unverified against
      # the exact 1.18.4 schema (the Ansible template used the now
      # possibly-renamed smtp_from) -- check `pangolin --help`/the rendered
      # config.yml after first boot if mail doesn't send.
      email = {
        smtp_host = "in-v3.mailjet.com";
        smtp_port = 465;
        smtp_secure = true;
        no_reply = "Pangolin <no-reply@chezmoi.sh>";
      };
    };
  };
}
