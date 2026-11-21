# ─────────────────────────────────────────────────────────────────────────────
# Caddy — TLS and routing, the only public surface.
# ─────────────────────────────────────────────────────────────────────────────
# :4318 receives the OTLP writes and hands them to the gateway; :443 serves the
# read-only query APIs and UIs of the stores; :80 redirects to HTTPS. The whole
# configuration is ./fs/etc.caddy/Caddyfile (and the landing page in
# ./fs/etc.caddy/www); the certificate comes from Cloudflare (ACME DNS-01).
# ─────────────────────────────────────────────────────────────────────────────
{ config, lib, pkgs, secretPath, o11y, ... }:

let
  caddy = o11y.stack.caddyPackage pkgs;
  cloudflareTokenFile = secretPath "cloudflare-api-token";

  # Who may create or expire silences: the write sources, not the read-only ones.
  silenceSources = lib.concatStringsSep " "
    ([ "127.0.0.1/8" "::1" ] ++ config.services.o11yDatastore.allowedSources);

  # The Caddyfile as-is, syntax-checked at build time (no provisioning: that
  # needs the secret).
  caddyfile = pkgs.runCommand "Caddyfile" { nativeBuildInputs = [ caddy ]; } ''
    cp ${./fs/etc.caddy/Caddyfile} $out
    HOME=$TMPDIR O11Y_SILENCE_SOURCES=${lib.escapeShellArg silenceSources} caddy adapt --adapter caddyfile --config $out > /dev/null
  '';

  # Caddy reads the token from the environment ({env.*} in the Caddyfile);
  # launchd has no EnvironmentFile, so a wrapper exports it from the file.
  wrapper = pkgs.writeShellScript "o11y-caddy" ''
    set -eu
    ${lib.optionalString (cloudflareTokenFile != null) ''
      CLOUDFLARE_API_TOKEN=$(cat ${lib.escapeShellArg cloudflareTokenFile})
      export CLOUDFLARE_API_TOKEN
    ''}
    exec ${caddy}/bin/caddy run --config ${caddyfile} --adapter caddyfile
  '';
in
{
  environment.etc."caddy/www".source = "${./fs/etc.caddy/www}";

  launchd.daemons.o11y-caddy = lib.recursiveUpdate
    (o11y.daemon {
      name = "caddy";
      user = "_caddy";
      args = [ "${wrapper}" ];
      workdir = o11y.caddyDir;
      interactive = true;
    })
    {
      # Caddy's AppDataDir (certificates) is $XDG_DATA_HOME/caddy; HOME holds
      # its autosave. Both live under caddyDir.
      serviceConfig.EnvironmentVariables = {
        XDG_DATA_HOME = o11y.caddyDir;
        HOME = o11y.caddyDir;
        O11Y_SILENCE_SOURCES = silenceSources;
      };
    };
}
