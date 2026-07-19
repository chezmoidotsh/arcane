import * as pbs from "@pulumi/proxmox-backup-server";

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
// Verification: weekly, checksum-verifies each backup exactly once
// -----------------------------------------------------------------------------
// `ignoreVerified: true` with no `outdatedAfter` means a verified snapshot is
// never re-checked. PBS does not cache verification state per chunk across
// separate job runs -- re-verifying later would mean re-downloading every
// chunk again from B2, not just what changed. That periodic re-check exists
// to catch storage-level bitrot, which B2 already guards against at the
// object level (checksums, replication); it isn't worth its own egress cost
// here. The one-time first verify (never skipped) still confirms every
// backup is restorable before it's ever relied on.
export const backupsVerifyJob = new pbs.VerifyJob(
	"pbs-verify-backups",
	{
		verifyJobId: "backups-weekly-verify",
		store: backupsDatastore.name,
		schedule: "Sun 03:30",
		ignoreVerified: true,
		comment: "Weekly checksum verification of new backups",
	},
	{ parent: backupsDatastore },
);
