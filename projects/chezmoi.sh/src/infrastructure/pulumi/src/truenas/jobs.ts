import * as truenas from "@pulumi/truenas";

// --- Cron / init scripts ----------------------------------------------------

new truenas.Cronjob("smart-test", {
	command: "midclt call disk.smart_test SHORT '[\"*\"]'",
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
