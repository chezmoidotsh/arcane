# TLS front for sandbox-api. n8n calls https://sndbx-3or5.lia.chezmoi.sh with the sandbox API key; Caddy is the only listener
# reachable from the network (443), sandbox-api itself only listens on loopback.
#
# The host is not reachable from the internet, so the certificate comes from ACME DNS-01 (Cloudflare, same token scope
# as cert-manager's) instead of Caddy's own HTTP-01.
{ config, ... }:
let
  domain = "sndbx-3or5.lia.chezmoi.sh";
in
{
  sops.secrets.cloudflare_dns_token = { };
  sops.templates."cloudflare.env".content = ''
    CF_DNS_API_TOKEN=${config.sops.placeholder.cloudflare_dns_token}
  '';

  security.acme = {
    acceptTerms = true;
    certs.${domain} = {
      dnsProvider = "cloudflare";
      environmentFile = config.sops.templates."cloudflare.env".path;
      group = config.services.caddy.group;
      reloadServices = [ "caddy.service" ];
    };
  };

  services.caddy = {
    enable = true;
    virtualHosts.${domain}.extraConfig = ''
      tls /var/lib/acme/${domain}/cert.pem /var/lib/acme/${domain}/key.pem
      reverse_proxy 127.0.0.1:8080
    '';
  };
}
