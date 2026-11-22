import * as b2 from "@pulumi/b2";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

// S3 endpoint of the Backblaze account, as reported by the provider (https://s3.<region>.backblazeb2.com).
const account = b2.getAccountInfoOutput();

const suffix = new random.RandomId("exusiai-backups-suffix", {
	byteLength: 4,
});

// Private bucket restic writes to. Bucket + key scoped to this bucket only.
// Lifecycle: restic manages its own retention (forget --prune); B2 only has
// to hide nothing -- we just cancel abandoned large uploads.
const backupsBucket = new b2.Bucket(
	"exusiai-backups",
	{
		// A bucket name cannot change: renaming it replaces the bucket (see `protect` below).
		bucketName: suffix.hex.apply((s) => `exusiai-minecraft-${s}`),
		bucketType: "allPrivate",
		lifecycleRules: [
			{
				fileNamePrefix: "",
				daysFromStartingToCancelingUnfinishedLargeFiles: 1,
			},
		],
	},
	{
		protect: true,
		retainOnDelete: true,
		// The b2 provider (0.13) reports these back on refresh although our inputs
		// are unchanged, which yields a permanent no-op update.
		ignoreChanges: ["defaultServerSideEncryption", "revision"],
	},
);

const backupsKey = new b2.ApplicationKey("exusiai-backups", {
	keyName: "exusiai-minecraft-restic",
	bucketIds: [backupsBucket.bucketId],
	capabilities: [
		"deleteFiles",
		"listBuckets",
		"listFiles",
		"readBuckets",
		"readFiles",
		"writeFiles",
	],
});

export const backupsBucketName = backupsBucket.bucketName;
export const backupsKeyId = backupsKey.applicationKeyId;
export const backupsKeySecret = backupsKey.applicationKey;

// What restic reads (`repositoryFile` in nix/modules/backup.nix).
export const resticRepository = pulumi.interpolate`s3:${account.s3ApiUrl}/${backupsBucketName}/restic`;
