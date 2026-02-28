# ┌───────────────────────────────────────────────────────────────────────────┐
# │ Kokoro user-level service module (XDG paths + launchd agent).             │
# │ This module uses a Nix Python env, configures log rotation, and runs      │
# │ the server.                                                               │
# └───────────────────────────────────────────────────────────────────────────┘
{
  lib,
  pkgs,
  username,
  xdg,
  ...
}: let
  kokoro = import ../packages/kokoro { inherit pkgs; };

  # User-level model directory (XDG-compliant).
  modelsDir = "${xdg.share}/kokoro/models";
in {
  # Log rotation for Kokoro user-level logs (newsyslog is system-level).
  environment.etc."newsyslog.d/shodan.akn-kokoro.conf".text = ''
    ${xdg.log}/kokoro.stdout.log 644 7 10000 * J
    ${xdg.log}/kokoro.stderr.log 644 7 10000 * J
  '';

  # Ensure XDG data/log directories exist and materialize model files from Nix bundle.
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff ${xdg.share}/kokoro
    install -d -m 0755 -o ${username} -g staff ${modelsDir}/v1_0
    install -d -m 0755 -o ${username} -g staff ${xdg.log}
    install -d -m 0755 -o ${username} -g staff ${xdg.state}/tmp/kokoro
    chown -R ${username}:staff ${xdg.share}/kokoro
    chown -R ${username}:staff ${xdg.log}

    # NOTE: To avoid the heavy copy of the model at every rebuild if it hasn't changed,
    #       we symlink them (faster and saves disk space).
    ln -sf ${kokoro.models}/kokoro-v1_0.pth ${modelsDir}/v1_0/kokoro-v1_0.pth
    ln -sf ${kokoro.models}/config.json ${modelsDir}/v1_0/config.json
    chown -R ${username}:staff ${modelsDir}
  '';

  # User-level service (launchd agent) for Kokoro server.
  launchd.agents.kokoro = {
    serviceConfig = {
      ProgramArguments = [
        "${kokoro.bin}"
        "api.src.main:app"
        "--host"
        "0.0.0.0"
        "--port"
        "8888"
      ];
      KeepAlive = { SuccessfulExit = false; };
      RunAtLoad = true;
      ThrottleInterval = 10;
      WorkingDirectory = "${xdg.state}/tmp/kokoro";
      # MPS fallback improves compatibility on Apple Silicon.
      EnvironmentVariables = {
        USE_GPU = "false";
        USE_ONNX = "false";
        PATH = "${pkgs.ffmpeg}/bin:/usr/bin:/bin:/usr/sbin:/sbin";
        PYTHONPATH = "${kokoro.src}:${kokoro.src}/api";
        MODEL_DIR = "${modelsDir}";
        VOICES_DIR = "${kokoro.src}/api/src/voices/v1_0";
        WEB_PLAYER_PATH = "${kokoro.src}/web";
        TMPDIR = "${xdg.state}/tmp/kokoro";
      };
      StandardOutPath = "${xdg.log}/kokoro.stdout.log";
      StandardErrorPath = "${xdg.log}/kokoro.stderr.log";
    };
  };

  launchd.agents.kokoro-janitor = {
    serviceConfig = {
      ProgramArguments = [
        "${kokoro.janitor}"
        "${xdg.state}/tmp/kokoro"
      ];
      # Run every hour (3600s) to sweep files older than 60 minutes
      StartInterval = 3600;
      RunAtLoad = true;
      ThrottleInterval = 10;
      WorkingDirectory = "${xdg.state}/tmp/kokoro";
      StandardOutPath = "${xdg.log}/kokoro-janitor.stdout.log";
      StandardErrorPath = "${xdg.log}/kokoro-janitor.stderr.log";
    };
  };
}
