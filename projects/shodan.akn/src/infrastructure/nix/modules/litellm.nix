# ┌───────────────────────────────────────────────────────────────────────────┐
# │ LiteLLM user-level service module (XDG paths + launchd agent).            │
# │ This module installs the user config, uses a Nix Python env, and sets log │
# │ rotation.                                                                 │
# └───────────────────────────────────────────────────────────────────────────┘
{
  lib,
  pkgs,
  username,
  xdg,
  ...
}: let
  litellm = import ../packages/litellm { inherit pkgs; };
in {
  # Log rotation for LiteLLM logs (newsyslog is system-level).
  environment.etc."newsyslog.d/shodan.akn-litellm.conf".text = ''
    /Users/${username}/.local/state/log/litellm.stdout.log 644 7 10000 * J
    /Users/${username}/.local/state/log/litellm.stderr.log 644 7 10000 * J
  '';

  # Install the LiteLLM config under XDG paths (runtime uses Nix Python env).
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff ${xdg.config}/litellm
    install -d -m 0755 -o ${username} -g staff ${xdg.share}/litellm
    install -d -m 0755 -o ${username} -g staff ${xdg.log}
    chown -R ${username}:staff ${xdg.config}/litellm
    chown -R ${username}:staff ${xdg.share}/litellm
    chown -R ${username}:staff ${xdg.log}
    install -m 0644 -o ${username} -g staff ${../config/litellm_config.yaml} ${xdg.config}/litellm/config.yaml
  '';

  # User-level launchd agent (starts at login, uses user HOME/XDG paths).
  launchd.agents.litellm = {
    serviceConfig = {
      Label = "sh.chezmoi.shodan.litellm";
      ProgramArguments = [
        "${litellm.bin}"
        "--config"
        "${xdg.config}/litellm/config.yaml"
        "--host"
        "127.0.0.1"
        "--port"
        "4000"
      ];
      KeepAlive = {
        SuccessfulExit = false;
      };
      RunAtLoad = true;
      ThrottleInterval = 10;
      UserName = username;
      StandardOutPath = "${xdg.log}/litellm.stdout.log";
      StandardErrorPath = "${xdg.log}/litellm.stderr.log";
    };
  };
}
