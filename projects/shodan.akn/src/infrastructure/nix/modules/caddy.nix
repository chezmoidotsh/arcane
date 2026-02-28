# ┌───────────────────────────────────────────────────────────────────────────┐
# │ Caddy user-level service module (XDG paths + launchd agent).              │
# │ This module renders a user-scoped Caddyfile, configures log rotation,     │
# │ and runs Caddy without requiring system-level privileges.                 │
# └───────────────────────────────────────────────────────────────────────────┘
{
  lib,
  pkgs,
  username,
  xdg,
  ...
}: let
  caddy = pkgs.caddy.withPlugins {
    plugins = ["github.com/caddy-dns/cloudflare@v0.2.3"];
    hash = "sha256-mmkziFzEMBcdnCWCRiT3UyWPNbINbpd3KUJ0NMW632w=";
  };
in {
  # Ensure user config directory exists and install the generated Caddyfile.
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff ${xdg.config}/caddy
    install -m 0644 -o ${username} -g staff ${../config/Caddyfile} ${xdg.config}/caddy/Caddyfile
    chown -R ${username}:staff ${xdg.config}/caddy
  '';

  # Rotate Caddy access/stdout/stderr logs via newsyslog (system-level rotation).
  environment.etc."newsyslog.d/shodan.akn-caddy.conf".text = ''
    ${xdg.log}/caddy.access.log 644 7 10000 * J
    ${xdg.log}/caddy.stdout.log 644 7 10000 * J
    ${xdg.log}/caddy.stderr.log 644 7 10000 * J
  '';

  # User-level launchd agent (starts at login, uses user HOME/XDG paths).
  launchd.agents.caddy = {
    serviceConfig = {
      ProgramArguments = [
        "/bin/sh"
        "-c"
        "exec ${caddy}/bin/caddy run --config ${xdg.config}/caddy/Caddyfile --watch"
      ];
      KeepAlive = {
        SuccessfulExit = false;
      };
      RunAtLoad = true;
      ThrottleInterval = 10;
      StandardOutPath = "${xdg.log}/caddy.stdout.log";
      StandardErrorPath = "${xdg.log}/caddy.stderr.log";
    };
  };
}
