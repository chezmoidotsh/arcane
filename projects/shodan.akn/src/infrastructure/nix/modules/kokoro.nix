# Kokoro user-level service module (XDG paths + launchd agent).
# This module provisions a venv, configures log rotation, and runs the server.
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
  releaseTag = "v0.2.4-master";
  src = pkgs.fetchFromGitHub {
    owner = "remsky";
    repo = "Kokoro-FastAPI";
    rev = releaseTag;
    hash = "sha256-dAC0Jq7vhKPzt7n09cO4okn8C/AqG294Ds/BJLlWPbk=";
  };
  modelsDir = "${xdgShare}/kokoro/models";
in {
  # Log rotation for Kokoro user-level logs (newsyslog is system-level).
  environment.etc."newsyslog.d/shodan.akn-kokoro.conf".text = ''
    ${logDir}/kokoro.stdout.log 644 7 10000 * J
    ${logDir}/kokoro.stderr.log 644 7 10000 * J
  '';

  # Provision venv and dependencies under XDG data, and ensure log directory exists.
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff ${xdgShare}/kokoro
    install -d -m 0755 -o ${username} -g staff ${modelsDir}
    install -d -m 0755 -o ${username} -g staff ${logDir}
    venvPython=${xdgShare}/kokoro/venv/bin/python
    if [ -d ${xdgShare}/kokoro/venv ]; then
      if ! "$venvPython" - <<'PY'
import sys
raise SystemExit(0 if sys.version_info >= (3,10) else 1)
PY
      then
        rm -rf ${xdgShare}/kokoro/venv
      fi
    fi
    if [ ! -d ${xdgShare}/kokoro/venv ]; then
      ${pkgs.uv}/bin/uv venv --python ${pkgs.python311}/bin/python ${xdgShare}/kokoro/venv
    fi
    chown -R ${username}:staff ${xdgShare}/kokoro
    chown -R ${username}:staff ${logDir}
    ${pkgs.uv}/bin/uv pip install --python ${xdgShare}/kokoro/venv/bin/python --upgrade --quiet "${src}[cpu]"
    ${xdgShare}/kokoro/venv/bin/python ${src}/docker/scripts/download_model.py --output ${modelsDir}/v1_0
  '';

  # User-level service (launchd agent) for Kokoro server.
  launchd.agents.kokoro = {
    serviceConfig = {
      ProgramArguments = [
        "/bin/sh"
        "-c"
        "exec ${xdgShare}/kokoro/venv/bin/uvicorn api.src.main:app --host 0.0.0.0 --port 8888"
      ];
      KeepAlive = { SuccessfulExit = false; };
      RunAtLoad = true;
      ThrottleInterval = 10;
      # MPS fallback improves compatibility on Apple Silicon.
      EnvironmentVariables = {
        USE_GPU = "false";
        USE_ONNX = "false";
        PYTHONPATH = "${src}:${src}/api";
        MODEL_DIR = "${modelsDir}";
        VOICES_DIR = "${src}/api/src/voices/v1_0";
        WEB_PLAYER_PATH = "${src}/web";
      };
      StandardOutPath = "${logDir}/kokoro.stdout.log";
      StandardErrorPath = "${logDir}/kokoro.stderr.log";
    };
  };
}
