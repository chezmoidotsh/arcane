# Kokoro user-level service module (XDG paths + launchd agent).
# This module provisions a venv, configures log rotation, and runs the server.
{
  pkgs,
  username,
  ...
}: let
  # User home and XDG base directories (strict XDG layout).
  homeDir = "/Users/${username}";
  xdgShare = "${homeDir}/.local/share";
  xdgState = "${homeDir}/.local/state";
  logDir = "${xdgState}/log";
in {
  # Log rotation for Kokoro user-level logs (newsyslog is system-level).
  environment.etc."newsyslog.d/shodan.akn-kokoro.conf".text = ''
    ${logDir}/kokoro.stdout.log 644 7 10000 * J
    ${logDir}/kokoro.stderr.log 644 7 10000 * J
  '';

  # Provision venv and dependencies under XDG data, and ensure log directory exists.
  system.activationScripts.kokoroSetup.text = ''
    install -d -m 0755 -o ${username} -g staff ${xdgShare}/kokoro
    install -d -m 0755 -o ${username} -g staff ${logDir}
    if [ ! -d ${xdgShare}/kokoro/venv ]; then
      ${pkgs.uv}/bin/uv venv ${xdgShare}/kokoro/venv
    fi
    ${pkgs.uv}/bin/uv pip install --python ${xdgShare}/kokoro/venv/bin/python --upgrade --quiet kokoro-fast
  '';

  # User-level service (launchd agent) for Kokoro server.
  launchd.agents.kokoro = {
    serviceConfig = {
      ProgramArguments = [
        "${xdgShare}/kokoro/venv/bin/python"
        "-m"
        "kokoro_fast.server"
        "--port"
        "8888"
      ];
      KeepAlive = true;
      RunAtLoad = true;
      # MPS fallback improves compatibility on Apple Silicon.
      EnvironmentVariables = {
        PYTORCH_ENABLE_MPS_FALLBACK = "1";
      };
      StandardOutPath = "${logDir}/kokoro.stdout.log";
      StandardErrorPath = "${logDir}/kokoro.stderr.log";
    };
  };
}
