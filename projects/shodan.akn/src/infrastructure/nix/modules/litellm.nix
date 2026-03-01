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
  # Import the heavily modernized native package!
  litellmPkg = import ../packages/litellm/default.nix { inherit pkgs; };
  litellmBin = litellmPkg.bin;
  # schema.prisma extrait du tarball source upstream (BerriAI/litellm, racine du repo)
  schemaSrc = litellmPkg.schema;

  # Launch script for LiteLLM that exactly follows upstream
  litellmLaunchScript = pkgs.writeShellScript "litellm-launch.sh" ''
    export DATABASE_URL="postgresql://${username}@127.0.0.1:5432/litellm"

    echo "Running prisma generate to build the python client..."
    ${pkgs.prisma_7}/bin/prisma generate --schema=${xdg.data}/litellm/schema.prisma

    echo "Starting litellm proxy with db migrations enabled..."
    exec ${litellmBin} --config ${xdg.config}/litellm/config.yaml --host 127.0.0.1 --port 4000 --use_prisma_migrate
  '';

in {
  # Log rotation for LiteLLM logs (newsyslog is system-level).
  environment.etc."newsyslog.d/shodan.akn-litellm.conf".text = ''
    ${xdg.log}/litellm.stdout.log 644 7 10000 * J
    ${xdg.log}/litellm.stderr.log 644 7 10000 * J
  '';

  # Activation script: install config and ensure XDG data dir exists
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff ${xdg.config}/litellm
    install -d -m 0755 -o ${username} -g staff ${xdg.data}/litellm
    install -d -m 0755 -o ${username} -g staff ${xdg.log}
    
    # Ensure ownership/permissions for all XDG paths used by LiteLLM.
    chown -R ${username}:staff ${xdg.config}/litellm
    chown -R ${username}:staff ${xdg.data}/litellm
    chown -R ${username}:staff ${xdg.log}
    
    install -m 0644 -o ${username} -g staff ${../config/litellm_config.yaml} ${xdg.config}/litellm/config.yaml

    # Sync prisma schema directly from the package source
    cp ${schemaSrc} ${xdg.data}/litellm/schema.prisma
    chown ${username}:staff ${xdg.data}/litellm/schema.prisma
  '';

  # User-level launchd agent (starts at login, uses user HOME/XDG paths).
  launchd.agents.litellm = {
    serviceConfig = {
      Label = "sh.chezmoi.shodan.litellm";
      ProgramArguments = [
        "${litellmLaunchScript}"
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
        DATABASE_URL = "postgresql://${username}@127.0.0.1:5432/litellm";
      };
    };
  };
}
