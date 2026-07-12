import * as truenas from "@pulumi/truenas";

// -----------------------------------------------------------------------------
// TrueNAS SCALE cron jobs (nas.chezmoi.sh)
// -----------------------------------------------------------------------------
// Purpose
// - Host-level scheduled scripts that don't map to a dedicated TrueNAS
//   resource type. Pool-level maintenance (scrubs, snapshots) is declared
//   alongside its pool in zpools/*.ts instead; only plain shell commands
//   belong here.
// -----------------------------------------------------------------------------

// --- Cron / init scripts ----------------------------------------------------

// Runs a SHORT S.M.A.R.T. self-test against every disk daily at midnight.
// Catches failing hardware early; distinct from the ZFS scrub (zpools/*.ts),
// which checks data integrity rather than disk health.
new truenas.Cronjob("smart-test", {
	command: `midclt call disk.smart_test SHORT '["*"]'`,
	description: "S.M.A.R.T. Test",
	user: "root",
	enabled: true,
	scheduleMinute: "00",
	scheduleHour: "0",
	scheduleDom: "*",
	scheduleMonth: "*",
	scheduleDow: "*",
	stdout: true,
	stderr: true,
});

// TrueNAS doesn't create the per-user folder skeleton (Documents/Images/
// Vidéos/Musique) inside each userspace/<dataset> on its own, but SMB clients
// expect them to exist. Runs hourly (at :15) so a newly created userspace
// dataset gets its skeleton within the hour rather than needing a manual pass.
new truenas.Cronjob("userspace-folder-skeleton", {
	command:
		'for ds in $(zfs list -o name -H -d 1 zp1hs01/userspace | tail -n +2); do for dir in Documents Images "Vidéos" Musique; do mkdir -p "/mnt/$ds/$dir"; done; done',
	description:
		"Create Documents/Images/Vidéos/Musique folders in each userspace dataset if absent",
	user: "root",
	enabled: true,
	scheduleMinute: "15",
	scheduleHour: "*",
	scheduleDom: "*",
	scheduleMonth: "*",
	scheduleDow: "*",
	stdout: true,
	stderr: true,
});
