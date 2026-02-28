# Caddy user-level service module (XDG paths + launchd agent).
# This module renders a user-scoped Caddyfile, configures log rotation,
# and runs Caddy without requiring system-level privileges.
{
  pkgs,
  username,
  ...
}: let
  caddyFile = pkgs.writeText "Caddyfile" ''
    llm.chezmoi.sh:1234 {
      # HTTP only (TLS temporarily disabled)
      reverse_proxy localhost:4000

      log {
        output file /Users/${username}/.local/state/log/caddy.access.log
      }
    }
  '';

  # Build Caddy with Cloudflare DNS plugin
  # Note: pkgs.caddy.withPlugins is available in recent nixpkgs-unstable
  caddyCustom = pkgs.caddy.withPlugins {
    plugins = ["github.com/caddy-dns/cloudflare@v0.2.3"];
    hash = "sha256-mmkziFzEMBcdnCWCRiT3UyWPNbINbpd3KUJ0NMW632w="; # Update this hash if the plugin version changes
  };
in {
  # Ensure user config directory exists and install the generated Caddyfile.
  system.activationScripts.caddyConfig.text = ''
    install -d -m 0755 -o ${username} -g staff /Users/${username}/.config/caddy
    install -m 0644 -o ${username} -g staff ${caddyFile} /Users/${username}/.config/caddy/Caddyfile
  '';

  # Rotate Caddy access/stdout/stderr logs via newsyslog (system-level rotation).
  environment.etc."newsyslog.d/shodan.akn-caddy.conf".text = ''
    /Users/${username}/.local/state/log/caddy.access.log 644 7 10000 * J
    /Users/${username}/.local/state/log/caddy.stdout.log 644 7 10000 * J
    /Users/${username}/.local/state/log/caddy.stderr.log 644 7 10000 * J
  '';

  # User-level launchd agent (starts at login, uses user HOME/XDG paths).
  launchd.agents.caddy = {
    serviceConfig = {
      ProgramArguments = [
        "/bin/sh"
        "-c"
        "exec ${caddyCustom}/bin/caddy run --config /Users/${username}/.config/caddy/Caddyfile"
      ];
      KeepAlive = true;
      RunAtLoad = true;
      StandardOutPath = "/Users/${username}/.local/state/log/caddy.stdout.log";
      StandardErrorPath = "/Users/${username}/.local/state/log/caddy.stderr.log";
    };
  };
}
