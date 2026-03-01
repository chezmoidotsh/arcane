# ┌───────────────────────────────────────────────────────────────────────────┐
# │ kokoro.nix — local TTS API (user-level launchd agents)                    │
# │                                                                           │
# │ Responsibilities:                                                         │
# │   · Creates model/log/tmp dirs under XDG paths                           │
# │   · Symlinks Kokoro model files from the Nix store (avoids copy)         │
# │   · Configures newsyslog rotation for Kokoro logs                        │
# │   · Starts Kokoro server and a janitor sweep agent                       │
# │                                                                           │
# │ Outputs:                                                                  │
# │   · launchd agent  sh.chezmoi.shodan.kokoro    → 127.0.0.1:8880          │
# │   · launchd agent  sh.chezmoi.shodan.janitor   (hourly tmp sweep)        │
# │   · logs           $XDG_STATE_HOME/log/kokoro.{stdout,stderr}.log        │
# │   · models         $XDG_DATA_HOME/kokoro/models/v1_0/                    │
# │   · tmp            $XDG_STATE_HOME/tmp/kokoro/                           │
# └───────────────────────────────────────────────────────────────────────────┘
{ lib
, pkgs
, username
, xdg
, ...
}:
let
  kokoro = import ../packages/kokoro { inherit pkgs; };

  # User-level model directory (XDG-compliant).
  modelsDir = "${xdg.data}/kokoro/models";
in
{
  # Ensure XDG data/log/tmp directories exist and materialize model files from Nix bundle.
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff ${xdg.data}/kokoro
    install -d -m 0755 -o ${username} -g staff ${modelsDir}/v1_0
    install -d -m 0755 -o ${username} -g staff ${xdg.log}
    install -d -m 0755 -o ${username} -g staff ${xdg.tmp}/kokoro
    chown -R ${username}:staff ${xdg.data}/kokoro
    chown -R ${username}:staff ${xdg.log}

    # NOTE: To avoid the heavy copy of the model at every rebuild if it hasn't changed,
    #       we symlink them (faster and saves disk space).
    ln -sf ${kokoro.models}/kokoro-v1_0.pth ${modelsDir}/v1_0/kokoro-v1_0.pth
    ln -sf ${kokoro.models}/config.json ${modelsDir}/v1_0/config.json
    chown -R ${username}:staff ${modelsDir}
  '';

  # Log rotation for Kokoro user-level logs (newsyslog is system-level).
  environment.etc."newsyslog.d/endfield.akn-kokoro.conf".text = ''
    ${xdg.log}/kokoro.stdout.log 644 7 10000 * J
    ${xdg.log}/kokoro.stderr.log 644 7 10000 * J
  '';

  # User-level service (launchd agent) for Kokoro TTS server.
  launchd.agents.kokoro = {
    serviceConfig = {
      # Identity
      Label = "sh.chezmoi.endfield.kokoro";
      # Execution
      ProgramArguments = [
        "${kokoro.bin}"
        "api.src.main:app"
        "--host"
        "127.0.0.1"
        "--port"
        "8880"
      ];
      WorkingDirectory = "${xdg.tmp}/kokoro";
      # User
      UserName = username;
      # Lifecycle
      RunAtLoad = true;
      KeepAlive = { SuccessfulExit = false; };
      ThrottleInterval = 10;
      # Environment — MPS fallback improves compatibility on Apple Silicon.
      EnvironmentVariables = {
        USE_GPU = "false";
        USE_ONNX = "false";
        PATH = "${pkgs.ffmpeg}/bin:/usr/bin:/bin:/usr/sbin:/sbin";
        PYTHONPATH = "${kokoro.src}:${kokoro.src}/api";
        MODEL_DIR = "${modelsDir}";
        VOICES_DIR = "${kokoro.src}/api/src/voices/v1_0";
        WEB_PLAYER_PATH = "${kokoro.src}/web";
        TMPDIR = "${xdg.tmp}/kokoro";
      };
      # Logging
      StandardOutPath = "${xdg.log}/kokoro.stdout.log";
      StandardErrorPath = "${xdg.log}/kokoro.stderr.log";
    };
  };

  # Janitor agent: sweeps short-lived working files from xdg.tmp/kokoro every hour.
  launchd.agents.kokoro-janitor = {
    serviceConfig = {
      # Identity
      Label = "sh.chezmoi.endfield.janitor";
      # Execution
      ProgramArguments = [
        "${kokoro.janitor}"
        "${xdg.tmp}/kokoro"
      ];
      WorkingDirectory = "${xdg.tmp}/kokoro";
      # User
      UserName = username;
      # Lifecycle — runs every hour (3600s) to sweep files older than 60 minutes.
      RunAtLoad = true;
      StartInterval = 3600;
      ThrottleInterval = 10;
      # Logging
      StandardOutPath = "${xdg.log}/kokoro-janitor.stdout.log";
      StandardErrorPath = "${xdg.log}/kokoro-janitor.stderr.log";
    };
  };
}
