import * as pbs from "@pulumi/pbs";

import { backupsDatastore } from "./datastore";

// -----------------------------------------------------------------------------
// Retention: keep-daily=4, keep-weekly=2, keep-monthly=3
// -----------------------------------------------------------------------------
// See ./README.md, "Retention policy", for the full reasoning -- daily
// backups feeding PBS's chunk-level incremental dedup is what makes the
// monthly tier affordable. Same policy for both LXC and VM jobs to start;
// revisit per-workload if an opaque/compressed backup (e.g. a NAS archive)
// doesn't dedup well in practice.
export const backupsPruneJob = new pbs.PruneJob(
	"pbs-prune-backups",
	{
		pruneJobId: "backups-retention",
		store: backupsDatastore.name,
		schedule: "Mon..Sun 03:00", // nightly, ahead of the Sunday verify (03:30) and GC (04:00) -- see ./datastore.ts
		keepDaily: 4,
		keepWeekly: 2,
		keepMonthly: 3,
		comment: "Nightly retention prune",
	},
	{ parent: backupsDatastore },
);

// -----------------------------------------------------------------------------
// Verification: weekly, checksum-verifies every backup in the datastore
// -----------------------------------------------------------------------------
// Weekly is a reasonable default given the retention depth above -- deep
// enough to catch bitrot before the oldest kept snapshot is pruned away.
// `outdatedAfter: 30` skips backups re-verified within the last 30 days, so a
// second manual verify run doesn't redundantly re-check everything.
export const backupsVerifyJob = new pbs.VerifyJob(
	"pbs-verify-backups",
	{
		verifyJobId: "backups-weekly-verify",
		store: backupsDatastore.name,
		schedule: "Sun 03:30",
		ignoreVerified: true,
		outdatedAfter: 30,
		comment: "Weekly checksum verification",
	},
	{ parent: backupsDatastore },
);
