# SSO in front of the Crafty UI: Caddy (TLS, HTTP-01) -> oauth2-proxy (Pocket-Id
# OIDC, `admin` group only) -> Crafty (127.0.0.1:8443).
#
# Crafty has no native OIDC. The SSO gate decides *who may reach the panel*;
# Crafty keeps its own local admin account behind it (see README, "Limites").
{ config, ... }:
{
  sops.secrets.oauth2_proxy_env = { };
  # Env file, KEY=value lines:
  #   OAUTH2_PROXY_CLIENT_SECRET=<pulumi output minecraftOidcClientSecret>
  #   OAUTH2_PROXY_COOKIE_SECRET=<32 random bytes, e.g. openssl rand -base64 32 | tr -- '+/' '-_'>

  services.oauth2-proxy = {
    enable = true;
    provider = "oidc";
    oidcIssuerUrl = "https://auth.chezmoi.sh";
    clientID = "REPLACE_WITH_PULUMI_OUTPUT_minecraftOidcClientId";
    keyFile = config.sops.secrets.oauth2_proxy_env.path;
    email.domains = [ "*" ];
    scope = "openid email profile groups";
    httpAddress = "http://127.0.0.1:4180";
    redirectURL = "https://mc-admin.chezmoi.sh/oauth2/callback";
    upstream = [ "https://127.0.0.1:8443" ];
    reverseProxy = true;
    extraConfig = {
      # Pocket-Id group claim: only members of `admin` get in.
      allowed-group = "admin";
      oidc-groups-claim = "groups";
      # Crafty serves a self-signed certificate on loopback.
      ssl-upstream-insecure-skip-verify = "true";
      skip-provider-button = "true";
      code-challenge-method = "S256";
    };
  };

  services.caddy = {
    enable = true;
    virtualHosts."mc-admin.chezmoi.sh".extraConfig = ''
      reverse_proxy 127.0.0.1:4180
    '';
  };
}
