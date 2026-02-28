# LiteLLM user-level service module (XDG paths + launchd agent).
# This module installs the user config, provisions a venv, and sets log rotation.
{
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
  system.activationScripts.litellmSetup.text = ''
    install -d -m 0755 -o ${username} -g staff /Users/${username}/.config/litellm
    install -d -m 0755 -o ${username} -g staff /Users/${username}/.local/share/litellm
    install -d -m 0755 -o ${username} -g staff /Users/${username}/.local/state/log
    if [ ! -d /Users/${username}/.local/share/litellm/venv ]; then
      ${pkgs.uv}/bin/uv venv /Users/${username}/.local/share/litellm/venv
      chown -R ${username}:staff /Users/${username}/.local/share/litellm
    fi
    install -m 0644 -o ${username} -g staff ${../config/litellm_config.yaml} /Users/${username}/.config/litellm/config.yaml
    ${pkgs.uv}/bin/uv pip install --python /Users/${username}/.local/share/litellm/venv/bin/python --upgrade --quiet "litellm[proxy]"
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
      KeepAlive = true;
      RunAtLoad = true;
      StandardOutPath = "/Users/${username}/.local/state/log/litellm.stdout.log";
      StandardErrorPath = "/Users/${username}/.local/state/log/litellm.stderr.log";
    };
  };
}
