# LiteLLM user-level service module (XDG paths + launchd agent).
# This module installs the user config, uses a Nix Python env, and sets log rotation.
{
  lib,
  pkgs,
  username,
  ...
}: let
  homeDir = "/Users/${username}";
  xdgConfig = "${homeDir}/.config";
  xdgShare = "${homeDir}/.local/share";
  xdgState = "${homeDir}/.local/state";
  logDir = "${xdgState}/log";
  python = pkgs.python312.override {
    packageOverrides = final: prev: {
      dlinfo = prev.dlinfo.overridePythonAttrs (old: {
        meta = old.meta // { broken = false; };
        doCheck = false;
      });
      plotly = prev.plotly.overridePythonAttrs (old: {
        doCheck = false;
      });
      wandb = prev.wandb.overridePythonAttrs (old: {
        doCheck = false;
      });
    };
  };
  pythonEnv = python.withPackages (ps: with ps; [
    litellm
    fastapi
    uvicorn
    python-multipart
  ]);
  litellmBin = "${pythonEnv}/bin/litellm";
in {
  # Log rotation for LiteLLM logs (newsyslog is system-level).
  environment.etc."newsyslog.d/shodan.akn-litellm.conf".text = ''
    /Users/${username}/.local/state/log/litellm.stdout.log 644 7 10000 * J
    /Users/${username}/.local/state/log/litellm.stderr.log 644 7 10000 * J
  '';

  # Install the LiteLLM config under XDG paths (runtime uses Nix Python env).
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff ${xdgConfig}/litellm
    install -d -m 0755 -o ${username} -g staff ${xdgShare}/litellm
    install -d -m 0755 -o ${username} -g staff ${logDir}
    chown -R ${username}:staff ${xdgConfig}/litellm
    chown -R ${username}:staff ${xdgShare}/litellm
    chown -R ${username}:staff ${logDir}
    install -m 0644 -o ${username} -g staff ${../config/litellm_config.yaml} ${xdgConfig}/litellm/config.yaml
  '';

  # User-level launchd agent (starts at login, uses user HOME/XDG paths).
  launchd.agents.litellm = {
    serviceConfig = {
      ProgramArguments = [
        "${litellmBin}"
        "--config"
        "${xdgConfig}/litellm/config.yaml"
        "--port"
        "4000"
      ];
      KeepAlive = {
        SuccessfulExit = false;
      };
      RunAtLoad = true;
      ThrottleInterval = 10;
      StandardOutPath = "${logDir}/litellm.stdout.log";
      StandardErrorPath = "${logDir}/litellm.stderr.log";
    };
  };
}
