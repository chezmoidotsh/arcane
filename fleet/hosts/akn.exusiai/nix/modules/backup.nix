# Off-site backups to Backblaze B2 with restic.
#
# Wings writes consistent world archives to /var/lib/pelican/backups (schedule
# them in the Pelican panel: server -> Schedules, every 6h, keep 3). restic then
# ships that directory + the panel data (SQLite database, APP_KEY, plugins) to
# B2 daily, so we never snapshot a live, mid-write world.
{ config, ... }:
let
  # Backblaze S3 endpoint of the account (same one as pbs-vm-backup).
  b2Endpoint = "s3.eu-central-003.backblazeb2.com";
  # Pulumi output `backupsBucketName`.
  bucket = "REPLACE_WITH_PULUMI_OUTPUT_backupsBucketName";
in
{
  sops.secrets.restic_password = { };
  sops.secrets.restic_b2_env = { };
  # restic_b2_env (env file):
  #   AWS_ACCESS_KEY_ID=<pulumi output backupsKeyId>
  #   AWS_SECRET_ACCESS_KEY=<pulumi output backupsKeySecret>

  services.restic.backups.minecraft = {
    repository = "s3:${b2Endpoint}/${bucket}/restic";
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
