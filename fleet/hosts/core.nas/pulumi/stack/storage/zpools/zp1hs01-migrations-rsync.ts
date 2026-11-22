import * as pulumi from "@pulumi/pulumi";
import * as truenas from "@pulumi/truenas";

import { zp1hs01 } from "./zp1hs01";

// =============================================================================
// Temporary migration cronjobs — delete this file once old datasets are retired.
//
// One truenas.Cronjob per legacy -> new dataset pair, periodically rsync'ing
// so both stay roughly in sync while apps are cut over one at a time. Once a
// pair's app has fully moved to its new dataset, do a final manual rsync pass
// (to catch anything written since the last cron run), repoint the app, then
// drop that entry below. Delete this file (and its side-effect import in
// ../index.ts) once every pair is done.
//
// `-rt`: recursive, preserve modification times. No `-p`/`-o`/`-g`
// (permissions/owner/group) or `-A` (ACLs), but the job runs as root: every
// file it creates or rewrites belongs to root, not to the dataset's service
// account, and an `owner@`-only ACL then locks that account out. Immich hit
// it: the job rewrote its `.immich` marker files as root, and Immich refused
// to start until they were chowned back. Additive only (no `--delete`):
// files removed on the legacy side are left alone on the new dataset until
// the final manual cutover.
// =============================================================================

const MIGRATIONS = [
	{
		id: "userspace",
		source: "documents",
		target: "userspace",
		scheduleMinute: "30",
	},
];

for (const { id, source, target, scheduleMinute } of MIGRATIONS) {
	const sourceDataset = zp1hs01.get(source);
	const targetDataset = zp1hs01.get(target);

	new truenas.Cronjob(
		`zp1hs01-migrate-${id}`,
		{
			command: pulumi.interpolate`rsync -rt --info=stats1 "${sourceDataset.resource.mountPoint}/" "${targetDataset.resource.mountPoint}/"`,
			description: `Migration sync: ${source} -> ${target} (temporary, delete once cut over)`,
			user: "root",
			enabled: true,
			scheduleMinute,
			scheduleHour: "*",
			scheduleDom: "*",
			scheduleMonth: "*",
			scheduleDow: "*",
			stdout: true,
			stderr: true,
		},
		{ parent: targetDataset.resource },
	);
}
