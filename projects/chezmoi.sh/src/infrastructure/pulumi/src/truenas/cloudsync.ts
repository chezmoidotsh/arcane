import type { TrueNASPool } from "@chezmoi.sh/pulumi-truenas-pool";
import * as b2 from "@pulumi/b2";
import * as pulumi from "@pulumi/pulumi";
import * as truenas from "@pulumi/truenas";

import { legacyTrueNASBackupBucket, trueNASBackupBucket } from "../backblaze";
import { zp1hs01 } from "./zpools/zp1hs01";

import path = require("node:path");

// -----------------------------------------------------------------------------
// TrueNAS CloudSync configuration (nas.chezmoi.sh -> Backblaze B2)
// -----------------------------------------------------------------------------
// Purpose
// - Define CloudSync jobs that push selected datasets from the local TrueNAS
//   pool (`zp1hs01`) to Backblaze B2 buckets used for backups.
// - Prefer many small, targeted sync jobs (one per dataset or logical group)
//   rather than a single global sync. Targeted jobs make restores simpler and
//   limit the blast radius of configuration mistakes.
//
// Important provider limitations
// - The Pulumi TrueNAS provider's `CloudSync` resource is incomplete: several
//   runtime options commonly available in the TrueNAS UI / API are not exposed
//   in the resource schema. Examples include `include`/`exclude` filters,
//   advanced `encryption` options, transfer tuning (`transfers`, `bwlimit`),
//   and similar. Those settings will not be managed or changed by Pulumi; if
//   you need to rely on them, apply them directly through the TrueNAS UI or
//   API in addition to this Pulumi-managed configuration.
//
// Attributes JSON
// - The provider accepts a free-form `attributesJson` field (stringified JSON)
//   where provider-specific options live. Common fields here are:
//     - `bucket`: target bucket name
//     - `folder`: path inside the bucket to use as destination
//     - `chunk_size`, `fast_list`, ... provider-specific tuning options
// - Because these are opaque to Pulumi, validate them against the TrueNAS
//   API / UI when in doubt.
//
// Naming caveats
// - Changing a resource's `parent` changes its URN and causes Pulumi to
//   delete + recreate the resource; the global sync below is intentionally
//   created without a `parent` option to avoid that.
// -----------------------------------------------------------------------------

// Daily schedule preset (cron equivalent: 0 1 * * *)
const DAILY_SCHEDULE_PRESET = {
	scheduleMinute: "0",
	scheduleHour: "1",
	scheduleDom: "*",
	scheduleMonth: "*",
	scheduleDow: "*",
};

// Weekly schedule preset (cron equivalent: 0 2 * * 0)
const WEEKLY_SCHEDULE_PRESET = {
	scheduleMinute: "0",
	scheduleHour: "2",
	scheduleDom: "*",
	scheduleMonth: "*",
	scheduleDow: "0",
};

// --- B2 credential for nas-backup --------------------------------------------
// Create an application key restricted to the two backup buckets and the
// minimal capabilities required for sync (list/read/write). Scoping to
// `bucketIds` is safe here even though it's a multi-bucket key: the S3
// credential below authenticates with a plain access/secret key pair, not
// through B2's native `b2_authorize_account`, so it isn't affected by the b2
// SDK's v4-only multi-bucket-key restriction (see
// https://github.com/Backblaze/terraform-provider-b2/issues/129).

const nasBackupApplicationKey = new b2.ApplicationKey("truenas-replication", {
	keyName: "truenas-replication",
	bucketIds: [legacyTrueNASBackupBucket.bucketId, trueNASBackupBucket.bucketId],
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

export const nasBackupApplicationKeyId =
	nasBackupApplicationKey.applicationKeyId;
export const nasBackupApplicationKeySecret =
	nasBackupApplicationKey.applicationKey;

// CloudsyncCredential stores the provider attributes (account/key) in the
// TrueNAS credential object. We stringify the attributes to match the
// provider's expectation.
const nasBackupCloudsyncCredential = new truenas.CloudsyncCredential(
	"nas-backup-b2-credential",
	{
		name: "Backblaze B2",
		providerType: "S3",
		// Key order matters here: `providerAttributesJson` is an opaque string to
		// Pulumi's diff engine (never parsed as JSON), and TrueNAS always
		// re-serializes it with keys sorted alphabetically before storing it in
		// state. A different key order in this literal -- even with byte-identical
		// values -- makes every `pulumi up` see a perpetual "changed" string and
		// re-apply forever. Keep these four keys alphabetical.
		providerAttributesJson: pulumi.jsonStringify({
			access_key_id: nasBackupApplicationKey.applicationKeyId,
			endpoint: "https://s3.eu-central-003.backblazeb2.com/",
			region: "eu-central-003",
			secret_access_key: nasBackupApplicationKey.applicationKey,
		}),
	},
	{ parent: nasBackupApplicationKey },
);

// --- Global sync (active, whole-pool) -----------------------------------------
// A top-level CloudSync task syncing the entire zp1hs01 pool to the legacy
// `legacyTrueNASBackupBucket`, running alongside the granular per-dataset jobs
// below (which target the newer `trueNASBackupBucket`). It stays enabled as a
// coarse whole-pool safety net -- since it writes to a different bucket, it
// doesn't duplicate or conflict with the granular jobs' backups. Do NOT add a
// `parent` to this resource — changing its URN would recreate the resource
// during the next `pulumi up`.

export const legacyGlobalSync = new truenas.CloudSync("nas-backup-cloudsync", {
	description: "Backblaze B2 - zp1hs01 sync",
	path: "/mnt/zp1hs01",
	direction: "PUSH",
	transferMode: "SYNC",
	enabled: true,
	credentials: nasBackupCloudsyncCredential.id.apply((id) => Number(id)),
	attributesJson: pulumi.jsonStringify({
		bucket: legacyTrueNASBackupBucket.bucketName,
		fast_list: true,
		folder: "/nas.chezmoi.uk/truenas/zp1hs01",
		storage_class: "STANDARD",
	}),
	// Runs weekly at midnight UTC Sunday (cron: 0 0 * * 0)
	...WEEKLY_SCHEDULE_PRESET,
});

// --- Granular CloudSync jobs -------------------------------------------------
// Define the per-dataset jobs we want to run. Each entry uses `must(...)` to
// validate that the referenced dataset exists on the pool during Pulumi's
// program evaluation. The `scheduler` object is spread into the CloudSync
// resource to set the run cadence.

const cloudSyncJobs: Array<{
	description: string;
	pool: TrueNASPool;
	dataset: NonNullable<ReturnType<TrueNASPool["get"]>>;
	scheduler: typeof DAILY_SCHEDULE_PRESET | typeof WEEKLY_SCHEDULE_PRESET;
	overrides?: { enabled?: boolean };
}> = [
	{
		description: "Daily sync of users' spaces (shared excluded)",
		pool: zp1hs01,
		// Sync the userspace dataset root; use specific include/exclude rules via
		// TrueNAS UI if you want to exclude subfolders such as 'shared'.
		dataset: zp1hs01.get("userspace"),
		scheduler: DAILY_SCHEDULE_PRESET,
	},
	{
		description: "Weekly sync of immich.app application",
		pool: zp1hs01,
		dataset: zp1hs01.get("applications/managed/app.immich"),
		scheduler: WEEKLY_SCHEDULE_PRESET,
	},
	{
		description: "Weekly sync of paperless-ngx.com application",
		pool: zp1hs01,
		dataset: zp1hs01.get("applications/managed/com.paperless-ngx"),
		scheduler: WEEKLY_SCHEDULE_PRESET,
	},
	{
		description: "Weekly sync of TrueNAS applications",
		pool: zp1hs01,
		dataset: zp1hs01.get("applications/truenas"),
		scheduler: WEEKLY_SCHEDULE_PRESET,
	},
];

for (const job of cloudSyncJobs) {
	const mountPoint = job.dataset.resource.mountPoint;
	const task = new truenas.CloudSync(
		`cs-b2-${job.pool.name}-${job.dataset.path.replace("/", "-")}`,
		{
			description: `B2 — ${job.description}`,
			path: mountPoint,
			direction: "PUSH",
			transferMode: "SYNC",
			enabled: true,
			// Provider requires a numeric credential id, convert the Pulumi id to a
			// Number inside an `.apply()`.
			credentials: nasBackupCloudsyncCredential.id.apply((id) => Number(id)),
			attributesJson: pulumi.jsonStringify({
				bucket: trueNASBackupBucket.bucketName,
				fast_list: true,
				// Use the dataset path as the destination folder inside the bucket so
				// the bucket mirrors the pool structure (easier to find backups later).
				folder: pulumi.interpolate`${mountPoint.apply((mp) => path.relative("/mnt", mp))}`,
				storage_class: "STANDARD",
			}),

			...job.scheduler,

			// Apply any overrides from the job definition if present (e.g., to disable a job temporarily).
			...(job.overrides ?? {}),
		},
		{ parent: job.dataset.resource },
	);
}
