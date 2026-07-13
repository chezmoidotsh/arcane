// -----------------------------------------------------------------------------
// Backblaze B2 buckets for TrueNAS backups
// -----------------------------------------------------------------------------
// Two B2 buckets are defined here:
// - `legacyTrueNASBackupBucket`: the bucket backing the whole-pool CloudSync task
//   (see `truenas/cloudsync.ts`). It's protected and retained on delete to avoid
//   accidental data loss.
// - `trueNASBackupBucket`: the current bucket intended for TrueNAS backups. It
//   has file-locking and lifecycle rules to retain recent versions for a short
//   retention window and to expire older/hide superseded files automatically.
//
// Both buckets enable file-lock (governance mode, 7 days default retention).
// The lifecycle rules remove hidden/superseded files after 60 days; the
// production bucket also cancels unfinished large-file uploads after 1 day.
// -----------------------------------------------------------------------------

import * as b2 from "@pulumi/b2";

export const legacyTrueNASBackupBucket = new b2.Bucket(
	"nas-backup",
	{
		bucketName: "nas-backup-50a30f2b",
		bucketType: "allPrivate",
		fileLockConfigurations: [
			{
				isFileLockEnabled: true,
				defaultRetention: {
					mode: "governance",
					period: { duration: 7, unit: "days" },
				},
			},
		],
		lifecycleRules: [{ fileNamePrefix: "", daysFromHidingToDeleting: 60 }],
	},
	{ protect: true, retainOnDelete: true },
);

export const trueNASBackupBucket = new b2.Bucket(
	"truenas-backup",
	{
		bucketName: "nas-backup-4e6b1351",
		bucketType: "allPrivate",
		fileLockConfigurations: [
			{
				isFileLockEnabled: true,
				defaultRetention: {
					mode: "governance",
					period: { duration: 7, unit: "days" },
				},
			},
		],
		lifecycleRules: [
			{
				// Default rule for all files: delete 60 days after hiding (superseded by newer version)
				// and cancel unfinished large files after 1 day.
				fileNamePrefix: "",
				daysFromHidingToDeleting: 60,
				daysFromStartingToCancelingUnfinishedLargeFiles: 1,
			},
		],
	},
	{ protect: true, retainOnDelete: true },
);
