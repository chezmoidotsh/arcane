# ┌───────────────────────────────────────────────────────────────────────────┐
# │ PostgreSQL user-level service module (XDG paths + launchd agent).         │
# │ Installs Postgres locally for the user, listening only on 127.0.0.1       │
# └───────────────────────────────────────────────────────────────────────────┘
{
  lib,
  pkgs,
  username,
  xdg,
  ...
}: let
  pg = pkgs.postgresql;
  pgData = "${xdg.data}/postgres";
in {
  # Log rotation for Postgres logs
  environment.etc."newsyslog.d/shodan.akn-postgres.conf".text = ''
    ${xdg.log}/postgres.stdout.log 644 7 10000 * J
    ${xdg.log}/postgres.stderr.log 644 7 10000 * J
  '';

  # Activation script: create data dir, run initdb safely using trust auth, 
  # set simple config and create the database for litellm.
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0700 -o ${username} -g staff ${pgData}
    
    if [ ! -f "${pgData}/PG_VERSION" ]; then
      echo "PostgreSQL activation: Initializing database cluster at ${pgData}..."
      sudo -u ${username} ${pg}/bin/initdb -D ${pgData} --auth=trust --no-locale --encoding=UTF8

      # Listen only on localhost (no remote connections)
      echo "listen_addresses = '127.0.0.1, ::1'" >> ${pgData}/postgresql.conf
      echo "unix_socket_directories = '${pgData}'" >> ${pgData}/postgresql.conf
      
      # Start postgres temporarily to create the litellm database
      echo "PostgreSQL activation: Creating litellm database..."
      sudo -u ${username} ${pg}/bin/pg_ctl -D ${pgData} -l ${xdg.log}/postgres-init.log -w start
      sudo -u ${username} ${pg}/bin/createdb -h ${pgData} litellm || true
      sudo -u ${username} ${pg}/bin/pg_ctl -D ${pgData} -m fast -w stop
    fi
  '';

  # User-level launchd agent
  launchd.agents.postgresql = {
    serviceConfig = {
      Label = "sh.chezmoi.shodan.postgresql";
      ProgramArguments = [
        "${pg}/bin/postgres"
        "-D"
        "${pgData}"
      ];
      KeepAlive = {
        SuccessfulExit = false;
      };
      RunAtLoad = true;
      UserName = username;
      StandardOutPath = "${xdg.log}/postgres.stdout.log";
      StandardErrorPath = "${xdg.log}/postgres.stderr.log";
    };
  };
}
