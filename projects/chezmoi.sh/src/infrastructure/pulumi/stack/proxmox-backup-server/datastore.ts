import * as b2 from "@pulumi/b2";
import * as pbs from "@pulumi/proxmox-backup-server";

// -----------------------------------------------------------------------------
// Backblaze B2 bucket + application key backing the S3 datastore
// -----------------------------------------------------------------------------
// No file-lock on the bucket, unlike the TrueNAS buckets (../truenas/cloudsync.ts):
// Proxmox Backup Server's own garbage collection actively deletes unreferenced
// chunks through plain S3 DeleteObject calls (no bypass-governance header). A
// governance-mode retention would silently block those deletes, defeating GC
// and growing storage unbounded instead of protecting anything.
//
// The application key is scoped to this single bucket, with the capabilities
// Proxmox Backup Server needs to operate an S3-backed datastore: list/read/write
// for normal chunk operations, plus deleteFiles for garbage collection.
const pbsBackupBucket = new b2.Bucket(
	"pbs-vm-backup",
	{
		bucketName: "pbs-vm-backup-fcc7acb9",
		bucketType: "allPrivate",
		lifecycleRules: [
			{
				fileNamePrefix: "",
				daysFromStartingToCancelingUnfinishedLargeFiles: 1,
			},
		],
	},
	{ protect: true, retainOnDelete: true },
);

const pbsBackupApplicationKey = new b2.ApplicationKey("pbs-vm-backup", {
	keyName: "pbs-vm-backup",
	bucketIds: [pbsBackupBucket.bucketId],
	capabilities: [
		"deleteFiles",
		"listAllBucketNames",
		"listBuckets",
		"listFiles",
		"readBucketEncryption",
		"readBucketReplications",
		"readBucketRetentions",
		"readBuckets",
		"readFileLegalHolds",
		"readFileRetentions",
		"readFiles",
		"writeFiles",
	],
});

// -----------------------------------------------------------------------------
// S3 endpoint (Proxmox Backup Server side)
// -----------------------------------------------------------------------------
// `pathStyle: true` addresses the bucket as `endpoint/bucket` instead of
// `bucket.endpoint` -- Backblaze's own S3-compatible endpoint answers both,
// but path-style avoids depending on wildcard DNS/TLS for the bucket
// subdomain, which this endpoint's certificate doesn't cover.
//
// `providerQuirks: ["skip-if-none-match-header"]` works around a Backblaze B2
// API incompatibility with the standard S3 `If-None-Match` header Proxmox
// Backup Server sends on chunk upload -- without it, every chunk write fails.
const backupsS3Endpoint = new pbs.S3Endpoint(
	"pbs-s3-endpoint-backblaze",
	{
		s3EndpointId: "Backblaze-B2",
		endpoint: "s3.eu-central-003.backblazeb2.com",
		region: "eu-central-003",
		accessKey: pbsBackupApplicationKey.applicationKeyId,
		secretKey: pbsBackupApplicationKey.applicationKey,
		pathStyle: true,
		providerQuirks: ["skip-if-none-match-header"],
	},
	{ parent: pbsBackupApplicationKey },
);

// -----------------------------------------------------------------------------
// Datastore
// -----------------------------------------------------------------------------
// A single S3-backed datastore as the *primary* datastore (PBS >=3.x supports
// S3 natively) rather than a local bulk datastore synced to B2 -- see
// ./README.md, "Datastore architecture", for the full reasoning.
//
// `path` is still required even for an S3 datastore: PBS uses it as the
// *local* chunk cache directory on the VM's own disk before upload, sized
// for cache headroom only, not for the full backup set. This directory must
// already exist (on its own dedicated disk, not the OS disk -- see
// ./README.md, "Bootstrapping") before the first `pulumi up`; the provider
// doesn't create it, and Datastore creation fails if it's missing.
//
// Retention (`keepDaily`/`keepWeekly`/`keepMonthly`) is enforced by a
// dedicated `pbs.PruneJob` (see ./jobs.ts), not by this resource's own
// `pruneSchedule`/`keep*` fields -- those are the legacy, now-deprecated
// datastore-level prune model; `prune.cfg` jobs are the current PBS practice.
// Garbage collection stays here: it's inherently a datastore-level
// maintenance operation, with no separate job resource in this provider.
export const backupsDatastore = new pbs.Datastore(
	"pbs-datastore-backups",
	{
		name: "Backblaze-B2",
		comment: "Primary S3-backed datastore (Backblaze B2)",
		path: "/mnt/datastore/cache", // local chunk cache on its own dedicated disk, not the full backup set -- see ./README.md, "Bootstrapping"
		s3Client: backupsS3Endpoint.s3EndpointId,
		s3Bucket: pbsBackupBucket.bucketName,
		gcSchedule: "Sun 04:00", // off-peak, after the Sunday prune (03:00) + verify (03:30) window -- see ./jobs.ts
		notificationMode: "notification-system",
	},
	{ parent: backupsS3Endpoint },
);
export const pbsDatastoreName = backupsDatastore.name;
