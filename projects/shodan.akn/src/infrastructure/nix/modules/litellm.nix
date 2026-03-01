# ┌───────────────────────────────────────────────────────────────────────────┐
# │ LiteLLM user-level service module (XDG paths + launchd agent).            │
# │ This module installs the user config, ensures XDG data exists, creates a  │
# │ SQLite DB for Prisma, uses a Nix Python env, and sets log rotation.       │
# └───────────────────────────────────────────────────────────────────────────┘
{
  lib,
  pkgs,
  username,
  xdg,
  ...
}: let
  litellm = "${pkgs.litellm}/bin/litellm";
in {
  # Log rotation for LiteLLM logs (newsyslog is system-level).
  environment.etc."newsyslog.d/shodan.akn-litellm.conf".text = ''
    /Users/${username}/.local/state/log/litellm.stdout.log 644 7 10000 * J
    /Users/${username}/.local/state/log/litellm.stderr.log 644 7 10000 * J
  '';

  # Activation script: install config, ensure XDG data dir exists, initialize SQLite DB,
  # and attempt to run `prisma generate` if possible to generate the Prisma client.
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff ${xdg.config}/litellm
    install -d -m 0755 -o ${username} -g staff ${xdg.data}/litellm
    install -d -m 0755 -o ${username} -g staff ${xdg.log}
    # Ensure ownership/permissions for all XDG paths used by LiteLLM.
    chown -R ${username}:staff ${xdg.config}/litellm
    chown -R ${username}:staff ${xdg.data}/litellm
    chown -R ${username}:staff ${xdg.log}
    chown -R ${username}:staff ${xdg.data}/litellm
    install -m 0644 -o ${username} -g staff ${../config/litellm_config.yaml} ${xdg.config}/litellm/config.yaml

    # Try to generate Prisma client binaries if a Prisma schema is present.
    # This will only run when a `prisma` CLI binary is available in PATH at activation time.
    init_log="${xdg.log}/litellm.init.log"
    echo "LiteLLM activation: starting initialization at $(date)" >> "$init_log"
    echo "Ensuring XDG dirs and config are present" >> "$init_log"

    if [ -f "${xdg.data}/litellm/schema.prisma" ]; then
      echo "Found schema.prisma in ${xdg.data}/litellm; attempting prisma generate" >> "$init_log"
      if command -v prisma >/dev/null 2>&1; then
        echo "prisma CLI found at $(command -v prisma)" >> "$init_log"
        cd "${xdg.data}/litellm" || {
          echo "Failed to cd to ${xdg.data}/litellm; aborting prisma generate" >> "$init_log"
        }
        # Run prisma generate and capture output to the init log
        if prisma generate >> "$init_log" 2>&1; then
          echo "prisma generate succeeded" >> "$init_log"
        else
          echo "prisma generate failed; check $init_log for details" >> "$init_log"
        fi
      else
        echo "prisma CLI not found on PATH; skipping prisma generate. You can install prisma or make it available during activation to auto-generate the client." >> "$init_log"
      fi
    else
      echo "No schema.prisma found at ${xdg.data}/litellm/schema.prisma; skipping prisma generate" >> "$init_log"
    fi

    echo "LiteLLM activation: completed at $(date)" >> "$init_log"
  '';

  # User-level launchd agent (starts at login, uses user HOME/XDG paths).
  launchd.agents.litellm = {
    serviceConfig = {
      Label = "sh.chezmoi.shodan.litellm";
      ProgramArguments = [
        "${litellm}"
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
      EnvironmentVariables = {
        # TODO: LiteLLM secrets (consider moving these to a secret store instead of embedding).
        LITELLM_MASTER_KEY = "admin";
        LITELLM_SALT_KEY = "admin";
        DATABASE_URL = "file:${xdg.data}/litellm/litellm.db";
      };
    };
  };
}
