import * as b2 from "@pulumi/b2";
import * as random from "@pulumi/random";

const suffix = new random.RandomId("rimbilliton-backups-suffix", {
	byteLength: 4,
});

// Private bucket restic writes to. Bucket + key scoped to this bucket only.
// Lifecycle: restic manages its own retention (forget --prune); B2 only has
// to hide nothing -- we just cancel abandoned large uploads.
const backupsBucket = new b2.Bucket(
	"rimbilliton-backups",
	{
		bucketName: suffix.hex.apply((s) => `rimbilliton-minecraft-${s}`),
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

const backupsKey = new b2.ApplicationKey("rimbilliton-backups", {
	keyName: "rimbilliton-minecraft-restic",
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
