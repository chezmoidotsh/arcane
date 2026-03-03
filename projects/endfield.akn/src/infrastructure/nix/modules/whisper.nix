# ┌───────────────────────────────────────────────────────────────────────────┐
# │ whisper.nix — local Whisper-cpp API (user-level launchd agents)           │
# │                                                                           │
# │ Responsibilities:                                                         │
# │   · Configures newsyslog rotation for Whisper logs                        │
# │   · Starts Whisper server as a user launchd agent                         │
# │                                                                           │
# │ Outputs:                                                                  │
# │   · launchd agent  sh.chezmoi.shodan.whisper   → 127.0.0.1:8882           │
# │   · logs           $XDG_STATE_HOME/log/whisper.{stdout,stderr}.log        │
# └───────────────────────────────────────────────────────────────────────────┘
{ lib
, pkgs
, username
, xdg
, ...
}:
let
  whisper = import ../packages/whisper { inherit pkgs; };
in
{
  # Ensure XDG tmp directories exist.
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff ${xdg.tmp}/whisper
    chown -R ${username}:staff ${xdg.tmp}/whisper
  '';

  # Log rotation for Whisper user-level logs (newsyslog is system-level).
  environment.etc."newsyslog.d/endfield.akn-whisper.conf".text = ''
    ${xdg.log}/whisper.stdout.log 644 7 10000 * J
    ${xdg.log}/whisper.stderr.log 644 7 10000 * J
  '';

  # User-level service (launchd agent) for Whisper server.
  launchd.agents.whisper = {
    serviceConfig = {
      # Identity
      Label = "sh.chezmoi.endfield.whisper";
      # Execution
      ProgramArguments = [
        "${whisper.bin}"
        "--host"
        "127.0.0.1"
        "--port"
        "8882"
        "-m"
        "${whisper.models}/ggml-model.bin"
      ];
      WorkingDirectory = "${xdg.tmp}/whisper";
      # User
      UserName = username;
      # Lifecycle
      RunAtLoad = true;
      KeepAlive = { SuccessfulExit = false; };
      ThrottleInterval = 10;
      # Environment
      EnvironmentVariables = {
        PATH = "${pkgs.ffmpeg}/bin:/usr/bin:/bin:/usr/sbin:/sbin";
        TMPDIR = "${xdg.tmp}/whisper";
      };
      # Logging
      StandardOutPath = "${xdg.log}/whisper.stdout.log";
      StandardErrorPath = "${xdg.log}/whisper.stderr.log";
    };
  };

  # Janitor agent: sweeps short-lived working files from xdg.tmp/whisper every hour.
  launchd.agents.whisper-janitor = {
    serviceConfig = {
      # Identity
      Label = "sh.chezmoi.endfield.whisper-janitor";
      # Execution
      ProgramArguments = [
        "/bin/sh"
        "-c"
        "${pkgs.findutils}/bin/find ${xdg.tmp}/whisper -type f -mmin +60 -print -delete"
      ];
      WorkingDirectory = "${xdg.tmp}/whisper";
      # User
      UserName = username;
      # Lifecycle — runs every hour (3600s)
      RunAtLoad = true;
      StartInterval = 3600;
      ThrottleInterval = 10;
      # Logging
      StandardOutPath = "${xdg.log}/whisper-janitor.stdout.log";
      StandardErrorPath = "${xdg.log}/whisper-janitor.stderr.log";
    };
  };
}
