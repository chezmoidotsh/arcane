# LiteLLM user-level service module (XDG paths + launchd agent).
# This module installs the user config, provisions a venv, and sets log rotation.
{
  lib,
  pkgs,
  username,
  ...
}: {
  # Log rotation for LiteLLM logs (newsyslog is system-level).
  environment.etc."newsyslog.d/shodan.akn-litellm.conf".text = ''
    /Users/${username}/.local/state/log/litellm.stdout.log 644 7 10000 * J
    /Users/${username}/.local/state/log/litellm.stderr.log 644 7 10000 * J
  '';

  # Provision venv/dependencies and install the LiteLLM config under XDG paths.
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff /Users/${username}/.config/litellm
    install -d -m 0755 -o ${username} -g staff /Users/${username}/.local/share/litellm
    install -d -m 0755 -o ${username} -g staff /Users/${username}/.local/state/log
    chown -R ${username}:staff /Users/${username}/.config/litellm
    chown -R ${username}:staff /Users/${username}/.local/share/litellm
    chown -R ${username}:staff /Users/${username}/.local/state/log
    venvPython=/Users/${username}/.local/share/litellm/venv/bin/python
    if [ -d /Users/${username}/.local/share/litellm/venv ]; then
      if ! "$venvPython" - <<'PY'
import sys
raise SystemExit(0 if sys.version_info >= (3,10) else 1)
PY
      then
        rm -rf /Users/${username}/.local/share/litellm/venv
      fi
    fi
    if [ ! -d /Users/${username}/.local/share/litellm/venv ]; then
      ${pkgs.uv}/bin/uv venv --python ${pkgs.python311}/bin/python /Users/${username}/.local/share/litellm/venv
    fi
    install -m 0644 -o ${username} -g staff ${../config/litellm_config.yaml} /Users/${username}/.config/litellm/config.yaml
    ${pkgs.uv}/bin/uv pip install --python /Users/${username}/.local/share/litellm/venv/bin/python --upgrade --quiet "litellm[proxy]" python-multipart
  '';

  # User-level launchd agent (starts at login, uses user HOME/XDG paths).
  launchd.agents.litellm = {
    serviceConfig = {
      ProgramArguments = [
        "/Users/${username}/.local/share/litellm/venv/bin/litellm"
        "--config"
        "/Users/${username}/.config/litellm/config.yaml"
        "--port"
        "4000"
      ];
      KeepAlive = {
        SuccessfulExit = false;
      };
      RunAtLoad = true;
      ThrottleInterval = 10;
      StandardOutPath = "/Users/${username}/.local/state/log/litellm.stdout.log";
      StandardErrorPath = "/Users/${username}/.local/state/log/litellm.stderr.log";
    };
  };
}
