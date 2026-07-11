import * as b2 from "@pulumi/b2";
import * as pulumi from "@pulumi/pulumi";
import * as truenas from "@pulumi/truenas";

// -----------------------------------------------------------------------------
// B2 backup buckets
// -----------------------------------------------------------------------------
// Two private, off-site backup buckets on Backblaze B2. Both are File Lock
// (Object Lock) protected in governance mode: uploads become immutable for 7
// days against deletion/overwrite (including by a leaked application key,
// since neither key below has the bypassGovernance capability), while the
// account root key retains bypassGovernance for genuine recovery needs. The
// 60d lifecycle rule prunes superseded file versions once they're no longer
// locked, so storage cost doesn't grow unbounded.
//
// Bucket names carry a random suffix (not a secret — B2 bucket names are
// globally unique across all accounts, like S3) purely to avoid collisions
// in that shared namespace.

const FILE_LOCK_RETENTION_DAYS = 7;
const LIFECYCLE_DELETE_DAYS = 60;
const NAS_BACKUP_BUCKET_NAME = "nas-backup-50a30f2b";
const GARAGE_BACKUP_BUCKET_NAME = "garage-backup-51891f906ced";
const CLOUDSYNC_SCHEDULE = {
	minute: "0",
	hour: "0",
	dom: "*",
	month: "*",
	dow: "0",
};

/** Summary of B2 backup buckets and their sync schedule, for documentation. */
export const backupSummary = {
	destination: "Backblaze B2",
	buckets: [
		{
			name: NAS_BACKUP_BUCKET_NAME,
			retentionDays: FILE_LOCK_RETENTION_DAYS,
			lifecycleDeleteDays: LIFECYCLE_DELETE_DAYS,
			// The only bucket with a Pulumi-managed sync task -- see
			// `nas-backup-cloudsync` below.
			sync: {
				source: "/mnt/zp1hs01",
				direction: "PUSH",
				transferMode: "SYNC",
				schedule: CLOUDSYNC_SCHEDULE,
			},
		},
		{
			name: GARAGE_BACKUP_BUCKET_NAME,
			retentionDays: FILE_LOCK_RETENTION_DAYS,
			lifecycleDeleteDays: LIFECYCLE_DELETE_DAYS,
			// Garage replicates to this bucket itself, outside Pulumi -- no
			// CloudSync task here.
			sync: undefined,
		},
	],
};

// Standard read/write access for backup tools (restic, rclone, kopia, …) that
// manage their own pruning; deletion is still bounded by the File Lock above.
const backupKeyCapabilities = [
	"listBuckets",
	"listFiles",
	"readFiles",
	"writeFiles",
];

// -----------------------------------------------------------------------------
// nas-backup: primary off-site copy of the NAS.
// -----------------------------------------------------------------------------
const nasBackupBucket = new b2.Bucket("nas-backup", {
	bucketName: NAS_BACKUP_BUCKET_NAME,
	bucketType: "allPrivate",
	fileLockConfigurations: [
		{
			isFileLockEnabled: true,
			defaultRetention: {
				mode: "governance",
				period: { duration: FILE_LOCK_RETENTION_DAYS, unit: "days" },
			},
		},
	],
	lifecycleRules: [
		{ fileNamePrefix: "", daysFromHidingToDeleting: LIFECYCLE_DELETE_DAYS },
	],
});

const nasBackupApplicationKey = new b2.ApplicationKey(
	"truenas-replication",
	{
		keyName: "truenas-replication",
		bucketIds: [nasBackupBucket.bucketId],
		capabilities: backupKeyCapabilities,
	},
	{ parent: nasBackupBucket },
);
export const nasBackupApplicationKeyId =
	nasBackupApplicationKey.applicationKeyId;
export const nasBackupApplicationKeySecret =
	nasBackupApplicationKey.applicationKey;

// -----------------------------------------------------------------------------
// garage-backup: backup of the Garage S3 cluster only.
// -----------------------------------------------------------------------------
const garageBackupBucket = new b2.Bucket("garage-backup", {
	bucketName: GARAGE_BACKUP_BUCKET_NAME,
	bucketType: "allPrivate",
	fileLockConfigurations: [
		{
			isFileLockEnabled: true,
			defaultRetention: {
				mode: "governance",
				period: { duration: FILE_LOCK_RETENTION_DAYS, unit: "days" },
			},
		},
	],
	lifecycleRules: [
		{ fileNamePrefix: "", daysFromHidingToDeleting: LIFECYCLE_DELETE_DAYS },
	],
});

const garageBackupApplicationKey = new b2.ApplicationKey(
	"garage-replication",
	{
		keyName: "garage-replication",
		bucketIds: [garageBackupBucket.bucketId],
		capabilities: backupKeyCapabilities,
	},
	{ parent: garageBackupBucket },
);
export const garageBackupApplicationKeyId =
	garageBackupApplicationKey.applicationKeyId;
export const garageBackupApplicationKeySecret =
	garageBackupApplicationKey.applicationKey;

// -----------------------------------------------------------------------------
// TrueNAS cloud sync -- nas.chezmoi.sh replicating to nas-backup over B2.
// -----------------------------------------------------------------------------
// Uses the B2 credential managed above (`nasBackupApplicationKey`) instead of
// a separate untracked key.
//
// Several real settings aren't in this provider's `CloudSync` schema at all
// (`include`/`exclude` filters, `encryption`/`encryption_password`,
// `transfers`, `bwlimit`, ...) -- not managed or overwritten by Pulumi, just
// invisible to it.
const nasBackupCloudsyncCredential = new truenas.CloudsyncCredential(
	"nas-backup-b2-credential",
	{
		name: "Backblaze B2",
		providerType: "B2",
		providerAttributesJson: pulumi.jsonStringify({
			account: nasBackupApplicationKey.applicationKeyId,
			key: nasBackupApplicationKey.applicationKey,
		}),
	},
);

// No `parent` here (unlike most resources in this file) -- this task was
// imported as a top-level resource; adding a parent now would change its
// URN and Pulumi would delete + recreate the real cloud sync task instead
// of updating it in place.
new truenas.CloudSync("nas-backup-cloudsync", {
	description: "Backblaze B2 - zp1hs01 sync",
	path: "/mnt/zp1hs01",
	direction: "PUSH",
	transferMode: "SYNC",
	enabled: true,
	credentials: nasBackupCloudsyncCredential.id.apply((id) => Number(id)),
	attributesJson: JSON.stringify({
		bucket: NAS_BACKUP_BUCKET_NAME,
		chunk_size: 96,
		fast_list: true,
		folder: "/nas.chezmoi.uk/truenas/zp1hs01",
	}),
	scheduleMinute: CLOUDSYNC_SCHEDULE.minute,
	scheduleHour: CLOUDSYNC_SCHEDULE.hour,
	scheduleDom: CLOUDSYNC_SCHEDULE.dom,
	scheduleMonth: CLOUDSYNC_SCHEDULE.month,
	scheduleDow: CLOUDSYNC_SCHEDULE.dow,
});
