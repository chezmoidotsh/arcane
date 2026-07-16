import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as b2 from "@pulumi/b2";
import * as config from "../config";

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for pbs.pve.chezmoi.sh
// -----------------------------------------------------------------------------
// Proxmox Backup Server's web UI (port 8007) isn't publicly reachable, so
// HTTP-01 validation has no way to reach it — DNS-01 is the only viable ACME
// challenge here, same reasoning as TrueNAS's cert (truenas/certificates.ts).
// Proxmox Backup Server's built-in ACME client supports Cloudflare as a DNS
// plugin directly, no Caddy involved. This stack runs upstream of any
// Kubernetes cluster, so the token isn't pushed to Vault here — Vault itself
// lives inside amiya.akn and can't be a dependency of something that has to
// exist before it. Exported as a Pulumi stack output for manual injection into
// Proxmox Backup Server's ACME DNS plugin configuration.
const acmeDns01Token = new Dns01TokenComponent("acme-dns-pbs", {
	owner: "chezmoi.sh",
	application: "Proxmox Backup Server ACME (pbs.pve.chezmoi.sh)",
	accountId: config.cloudflare.accountId,
	zoneId: config.cloudflare.zoneId,
});
export const pbsDns01Token = acmeDns01Token.tokenValue;

// -----------------------------------------------------------------------------
// Backblaze B2 bucket + application key for Proxmox Backup Server's S3
// datastore (VM backups)
// -----------------------------------------------------------------------------
// No file-lock on the bucket, unlike the TrueNAS buckets (truenas/cloudsync.ts):
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

export const pbsBackupBucketName = pbsBackupBucket.bucketName;
export const pbsBackupApplicationKeyId =
	pbsBackupApplicationKey.applicationKeyId;
export const pbsBackupApplicationKeySecret =
	pbsBackupApplicationKey.applicationKey;
