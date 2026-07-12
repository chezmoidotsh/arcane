import * as truenas from "@pulumi/truenas";

// --- Cron / init scripts ----------------------------------------------------

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
