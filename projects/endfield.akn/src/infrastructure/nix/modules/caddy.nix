# ┌───────────────────────────────────────────────────────────────────────────┐
# │ caddy.nix — reverse proxy (user-level launchd agent)                      │
# │                                                                           │
# │ Responsibilities:                                                         │
# │   · Installs Caddyfile + snippets into XDG_CONFIG_HOME/caddy/            │
# │   · Configures newsyslog rotation for Caddy logs                         │
# │   · Starts Caddy as a user launchd agent                                 │
# │                                                                           │
# │ Outputs:                                                                  │
# │   · launchd agent  sh.chezmoi.shodan.caddy                               │
# │   · logs           $XDG_STATE_HOME/log/caddy.{access,stdout,stderr}.log  │
# └───────────────────────────────────────────────────────────────────────────┘
{ lib
, pkgs
, username
, xdg
, ...
}:
{
  # Ensure user config directory exists and install the generated Caddyfile.
  # Also copy the global error handling snippet.
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff ${xdg.config}/caddy

    # Install the main Caddyfile
    install -m 0644 -o ${username} -g staff ${../config/Caddyfile} ${xdg.config}/caddy/Caddyfile

    # Install the global error handler snippet
    install -m 0644 -o ${username} -g staff ${../config/errors.inc} ${xdg.config}/caddy/errors.inc

    # If repository contains a `config/errors` directory, copy it into the
    # user's caddy config directory (legacy support for static error pages).
    if [ -d ${../config}/errors ]; then
      install -d -m 0755 -o ${username} -g staff ${xdg.config}/caddy/errors
      cp -R ${../config}/errors/. ${xdg.config}/caddy/errors/ || true
      chown -R ${username}:staff ${xdg.config}/caddy/errors
    fi

    chown -R ${username}:staff ${xdg.config}/caddy
  '';

  # Rotate Caddy logs via newsyslog. Access log is a single global file
  # (all vhosts write to it), plus per-process stdout/stderr.
  environment.etc."newsyslog.d/endfield.akn-caddy.conf".text = ''
    ${xdg.log}/caddy.access.log  644 7 10000 * J
    ${xdg.log}/caddy.stdout.log  644 7 10000 * J
    ${xdg.log}/caddy.stderr.log  644 7 10000 * J
  '';

  # User-level launchd agent (starts at login, uses user HOME/XDG paths).
  launchd.agents.caddy = {
    serviceConfig = {
      # Identity
      Label = "sh.chezmoi.endfield.caddy";
      # Execution
      ProgramArguments = [
        "/bin/sh"
        "-c"
        "exec ${pkgs.caddy}/bin/caddy run --config ${xdg.config}/caddy/Caddyfile --watch"
      ];
      # User
      UserName = username;
      # Lifecycle
      RunAtLoad = true;
      KeepAlive = { SuccessfulExit = false; };
      ThrottleInterval = 10;
      # Environment
      EnvironmentVariables = {
        HOME = "/Users/${username}";
        # Standard XDG path used in the Caddyfile for the global access log.
        XDG_STATE_HOME = "${xdg.state}";
        # Ensure the running Caddy process knows where to find the bundled snippets.
        CADDY_CONFIG_DIR = "${xdg.config}/caddy";
      };
      # Logging
      StandardOutPath = "${xdg.log}/caddy.stdout.log";
      StandardErrorPath = "${xdg.log}/caddy.stderr.log";
    };
  };
}
