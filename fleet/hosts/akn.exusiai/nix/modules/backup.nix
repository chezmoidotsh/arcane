# Off-site backups to Backblaze B2 with restic.
#
# Wings writes consistent world archives to /var/lib/pelican/backups (schedule
# them in the Pelican panel: server -> Schedules, every 6h, keep 3). restic then
# ships that directory + the panel data (SQLite database, APP_KEY, plugins) to
# B2 daily, so we never snapshot a live, mid-write world.
{ config, ... }:
{
  sops.secrets.restic_password = {
    sopsFile = ../secrets/manual.sops.yaml;
    format = "yaml";
  };
  sops.secrets.restic_b2_env = { };
  # Written by pulumi/ (SopsFile): s3:<B2 endpoint>/<bucket>/restic, the bucket being a Pulumi resource.
  sops.secrets.restic_repository = { };
  # restic_b2_env (env file):
  #   AWS_ACCESS_KEY_ID=<pulumi output backupsKeyId>
  #   AWS_SECRET_ACCESS_KEY=<pulumi output backupsKeySecret>

  services.restic.backups.minecraft = {
    repositoryFile = config.sops.secrets.restic_repository.path;
    passwordFile = config.sops.secrets.restic_password.path;
    environmentFile = config.sops.secrets.restic_b2_env.path;
    paths = [
      "/var/lib/pelican/backups"
      "/var/lib/pelican-panel/data"
    ];
    initialize = true;
    timerConfig = {
      OnCalendar = "*-*-* 04:30:00";
      RandomizedDelaySec = "15m";
      Persistent = true;
    };
    pruneOpts = [
      "--keep-daily 7"
      "--keep-weekly 4"
      "--keep-monthly 6"
    ];
  };
}
