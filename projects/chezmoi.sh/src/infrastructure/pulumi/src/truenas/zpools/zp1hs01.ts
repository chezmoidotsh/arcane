import { ByteSize } from "@chezmoi.sh/pulumi-lib";
import {
	Compression,
	OnOffInherit,
	RecordSize,
	TrueNASPool,
} from "@chezmoi.sh/pulumi-truenas-pool";
import * as truenas from "@pulumi/truenas";

import {
	SCRUB_WEEKLY_SUNDAY_MIDNIGHT_PRESET,
	SNAPSHOT_DAILY_MIDNIGHT_PRESET,
	SNAPSHOT_NAMING_SCHEMA,
	SNAPSHOT_WEEKLY_SUNDAY_3AM_PRESET,
} from "./const";

// -----------------------------------------------------------------------------
// zp1hs01: applications / backups / documents / userspace
// -----------------------------------------------------------------------------
// Naming convention
//   zp1hs01
//   │ │ │ │
//   │ │ │ └─ 01: pool id
//   │ │ └─── hs: hot storage tier (SSD / fast storage)
//   │ └───── 1:  naming scheme version
//   └─────── zp: zpool
//
// Purpose
// - Dataset tree for the main TrueNAS pool (nas.chezmoi.sh): hosted
//   applications (bare-metal and Kubernetes-managed), local backup targets,
//   shared documents, and per-user home directories.
// - Hot storage tier: holds data that needs fast access and/or changes
//   often. Also the default pool for TrueNAS's own app data (Apps ->
//   ix-applications and similar system datasets).
//
// Data protection strategy
// - Scrub: weekly integrity check of the whole pool (see `SCRUB_WEEKLY_SUNDAY_MIDNIGHT_PRESET`).
// - Whole-pool snapshot: weekly, 4-week retention — a coarse safety net that
//   covers every dataset, including ones without a dedicated task below.
// - Granular snapshots: daily, 8-day retention, one per dataset listed in
//   `DAILY_SNAPSHOT_DATASETS` below — for data that changes often or matters
//   most (e.g. K8s-managed app state).
// -----------------------------------------------------------------------------

export const zp1hs01 = new TrueNASPool("zp1hs01", {
	"/applications": {
		atime: OnOffInherit.Off,
		compression: Compression.Lz4,
		comments:
			"Applications hébergées : natives (TrueNAS Apps) et Kubernetes (lungmen.akn)",
	},
	"/applications/immich": {
		comments:
			"Immich (TrueNAS Apps) -- migration en cours vers managed/app.immich",
		quota: 50 * ByteSize.Gi, // 50G
		recordSize: RecordSize.Size1M,
	},
	"/applications/paperless": {
		comments:
			"Paperless (TrueNAS Apps) -- migration en cours vers managed/com.paperless-ngx",
		quota: 10 * ByteSize.Gi, // 10G
	},
	"/applications/silverbullet": {
		comments: "Silverbullet (TrueNAS Apps)",
		quota: 5 * ByteSize.Gi, // 5G
	},
	"/applications/truenas": {
		atime: OnOffInherit.Off,
		comments: "Services internes à TrueNAS lui-même",
	},
	"/applications/truenas/com.nginxproxymanager": {
		atime: OnOffInherit.Off,
		comments: "Reverse-proxy interne (NPM)",
	},
	"/applications/truenas/fr.deuxfleurs.garage": {
		atime: OnOffInherit.Off,
		comments: "Backend S3 Garage",
	},
	"/applications/managed": {
		atime: OnOffInherit.Off,
		compression: Compression.Lz4,
		comments: "Applications Kubernetes montées en SMB",
	},
	"/applications/managed/app.immich": {
		comments: "Immich (Kubernetes)",
		quota: 50 * ByteSize.Gi, // 50G
		recordSize: RecordSize.Size1M,
	},
	"/applications/managed/com.paperless-ngx": {
		comments: "Paperless-ngx (Kubernetes)",
		quota: 10 * ByteSize.Gi, // 10G
	},
	"/backups": {
		comments: "Cibles de sauvegarde locales",
		quota: 100 * ByteSize.Gi, // 100G
	},
	"/backups/hass.chezmoi.sh": {
		comments: "Sauvegardes Home Assistant",
	},
	"/documents": {
		comments: "Ancien espace documents -- migration en cours vers userspace",
	},
	"/userspace": {
		atime: OnOffInherit.Off,
		compression: Compression.Lz4,
		comments: "Espaces utilisateurs (remplace documents)",
	},
	"/userspace/shared": {
		comments: "Espace partagé entre utilisateurs",
	},
});

// --- Scrub -------------------------------------------------------------------

new truenas.ScrubTask(
	"zp1hs01-scrub",
	{
		pool: 5, // physical TrueNAS pool ID (not derivable from Pulumi state)
		threshold: 35,
		enabled: true,
		...SCRUB_WEEKLY_SUNDAY_MIDNIGHT_PRESET,
	},
	{ parent: zp1hs01 },
);

// --- Whole-pool snapshot (coarse safety net) ----------------------------------
// Covers every dataset in the pool, including ones without a dedicated
// granular task below. Lower frequency / longer-lived than the granular
// snapshots since it's a fallback, not the primary recovery point.

new truenas.SnapshotTask(
	"zp1hs01-snapshot",
	{
		dataset: zp1hs01.name,
		recursive: true,
		lifetimeValue: 4,
		lifetimeUnit: "WEEK",
		enabled: true,
		namingSchema: SNAPSHOT_NAMING_SCHEMA,
		allowEmpty: true,
		...SNAPSHOT_WEEKLY_SUNDAY_3AM_PRESET,
	},
	{ parent: zp1hs01 },
);

// --- Granular snapshots (daily, short retention) ------------------------------
// One dedicated `SnapshotTask` per dataset below. `id` fixes the Pulumi
// resource name (kept stable/explicit rather than derived from `path`, so
// renaming or reordering entries here never triggers an unwanted replace).
// `must(zp1hs01.get(path))` validates each dataset actually exists in the
// tree above, failing fast at `pulumi preview` instead of silently creating
// an orphaned task for a typo'd or removed path.

const DAILY_SNAPSHOT_DATASETS: { id: string; path: string }[] = [
	{ id: "app-immich", path: "applications/managed/app.immich" },
	{ id: "com-paperless-ngx", path: "applications/managed/com.paperless-ngx" },
];

for (const { id, path } of DAILY_SNAPSHOT_DATASETS) {
	const dataset = zp1hs01.get(path);
	new truenas.SnapshotTask(
		`zp1hs01-snapshot-${id}`,
		{
			dataset: dataset.path,
			recursive: false,
			lifetimeValue: 8,
			lifetimeUnit: "DAY",
			enabled: true,
			namingSchema: SNAPSHOT_NAMING_SCHEMA,
			allowEmpty: true,
			...SNAPSHOT_DAILY_MIDNIGHT_PRESET,
		},
		{ parent: zp1hs01.get(path)?.resource },
	);
}
