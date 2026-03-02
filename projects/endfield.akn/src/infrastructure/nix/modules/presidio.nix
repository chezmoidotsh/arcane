# ┌───────────────────────────────────────────────────────────────────────────┐
# │ presidio.nix — local PII detection and anonymizer API                     │
# │                                                                           │
# │ Responsibilities:                                                         │
# │   · Configures newsyslog rotation for Presidio logs                       │
# │   · Starts Presidio server as a user launchd agent                        │
# │                                                                           │
# │ Outputs:                                                                  │
# │   · launchd agent  sh.chezmoi.shodan.presidio  → 127.0.0.1:8881          │
# │   · logs           $XDG_STATE_HOME/log/presidio.{stdout,stderr}.log       │
# └───────────────────────────────────────────────────────────────────────────┘
{ lib
, pkgs
, username
, xdg
, ...
}:
let
  presidio = import ../packages/presidio { inherit pkgs; };
in
{
  # Log rotation for Presidio user-level logs (newsyslog is system-level).
  environment.etc."newsyslog.d/endfield.akn-presidio.conf".text = ''
    ${xdg.log}/presidio.stdout.log 644 7 10000 * J
    ${xdg.log}/presidio.stderr.log 644 7 10000 * J
  '';

  # User-level service (launchd agent) for Presidio API server.
  launchd.agents.presidio = {
    serviceConfig = {
      # Identity
      Label = "sh.chezmoi.endfield.presidio";
      # Execution
      ProgramArguments = [
        "${presidio.bin}"
        "api:app"
        "--host"
        "127.0.0.1"
        "--port"
        "8881"
      ];
      WorkingDirectory = "${presidio.src}";
      # User
      UserName = username;
      # Lifecycle
      RunAtLoad = true;
      KeepAlive = { SuccessfulExit = false; };
      ThrottleInterval = 10;
      # Environment
      EnvironmentVariables = {
        PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
        TMPDIR = "${xdg.tmp}";
      };
      # Logging
      StandardOutPath = "${xdg.log}/presidio.stdout.log";
      StandardErrorPath = "${xdg.log}/presidio.stderr.log";
    };
  };
}
