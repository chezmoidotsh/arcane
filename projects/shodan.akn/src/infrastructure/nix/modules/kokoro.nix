# Kokoro user-level service module (XDG paths + launchd agent).
# This module uses a Nix Python env, configures log rotation, and runs the server.
{
  lib,
  pkgs,
  username,
  ...
}: let
  # User home and XDG base directories (strict XDG layout).
  homeDir = "/Users/${username}";
  xdgShare = "${homeDir}/.local/share";
  xdgState = "${homeDir}/.local/state";
  logDir = "${xdgState}/log";

  kokoroPkg = import ../packages/kokoro { inherit pkgs; };
  modelBundle = kokoroPkg.modelBundle;
  src = kokoroPkg.src;
  kokoroUvicorn = kokoroPkg.kokoroUvicorn;

  modelsDir = "${xdgShare}/kokoro/models";

in {
  # Log rotation for Kokoro user-level logs (newsyslog is system-level).
  environment.etc."newsyslog.d/shodan.akn-kokoro.conf".text = ''
    ${logDir}/kokoro.stdout.log 644 7 10000 * J
    ${logDir}/kokoro.stderr.log 644 7 10000 * J
  '';

  # Ensure XDG data/log directories exist and materialize model files from Nix bundle.
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff ${xdgShare}/kokoro
    install -d -m 0755 -o ${username} -g staff ${modelsDir}/v1_0
    install -d -m 0755 -o ${username} -g staff ${logDir}
    install -d -m 0755 -o ${username} -g staff ${xdgState}/tmp/kokoro
    chown -R ${username}:staff ${xdgShare}/kokoro
    chown -R ${username}:staff ${logDir}

    if [ ! -f ${modelsDir}/v1_0/kokoro-v1_0.pth ]; then
      install -m 0644 ${modelBundle}/kokoro-v1_0.pth ${modelsDir}/v1_0/kokoro-v1_0.pth
    fi
    if [ ! -f ${modelsDir}/v1_0/config.json ]; then
      install -m 0644 ${modelBundle}/config.json ${modelsDir}/v1_0/config.json
    fi
    chown -R ${username}:staff ${modelsDir}
  '';

  # User-level service (launchd agent) for Kokoro server.
  launchd.agents.kokoro = {
    serviceConfig = {
      ProgramArguments = [
        "${kokoroUvicorn}"
        "api.src.main:app"
        "--host"
        "0.0.0.0"
        "--port"
        "8888"
      ];
      KeepAlive = { SuccessfulExit = false; };
      RunAtLoad = true;
      ThrottleInterval = 10;
      WorkingDirectory = "${xdgState}/tmp/kokoro";
      # MPS fallback improves compatibility on Apple Silicon.
      EnvironmentVariables = {
        USE_GPU = "false";
        USE_ONNX = "false";
        PATH = "${pkgs.ffmpeg}/bin:/usr/bin:/bin:/usr/sbin:/sbin";
        PYTHONPATH = "${src}:${src}/api";
        MODEL_DIR = "${modelsDir}";
        VOICES_DIR = "${src}/api/src/voices/v1_0";
        WEB_PLAYER_PATH = "${src}/web";
        TMPDIR = "${xdgState}/tmp/kokoro";
      };
      StandardOutPath = "${logDir}/kokoro.stdout.log";
      StandardErrorPath = "${logDir}/kokoro.stderr.log";
    };
  };

  launchd.agents.kokoro-janitor = {
    serviceConfig = {
      ProgramArguments = [
        "${pkgs.findutils}/bin/find"
        "${xdgState}/tmp/kokoro"
        "-type"
        "f"
        "-mmin"
        "+60"
        "-delete"
      ];
      # Run every hour (3600s) to sweep files older than 60 minutes
      StartInterval = 3600;
      RunAtLoad = true;
      ThrottleInterval = 10;
      WorkingDirectory = "${xdgState}/tmp/kokoro";
      StandardOutPath = "${logDir}/kokoro-janitor.stdout.log";
      StandardErrorPath = "${logDir}/kokoro-janitor.stderr.log";
    };
  };
}
