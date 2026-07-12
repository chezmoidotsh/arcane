// =============================================================================
// Temporary migration replications — delete this file once old datasets are retired.
//
// These replications copy data from legacy dataset locations into the new
// managed / userspace datasets. When the old datasets are no longer needed this
// entire file (and its side-effect import) should be removed.
// =============================================================================

import { must } from "@chezmoi.sh/pulumi-lib";
import * as truenas from "@pulumi/truenas";
import { SNAPSHOT_HOURLY_PRESET, SNAPSHOT_NAMING_SCHEMA } from "./const";
import { zp1hs01 } from "./zp1hs01";

// --- Migrations: legacy → managed / userspace --------------------------------

const migrations = [
	{
		id: "immich",
		source: must(
			zp1hs01.get("applications/immich"),
			"original immich.app dataset not found",
		),
		target: must(
			zp1hs01.get("applications/managed/app.immich"),
			"new immich.app dataset not found",
		),
	},
	{
		id: "paperless-ngx",
		source: must(
			zp1hs01.get("applications/paperless"),
			"original paperless-ngx.com dataset not found",
		),
		target: must(
			zp1hs01.get("applications/managed/com.paperless-ngx"),
			"new paperless-ngx.com dataset not found",
		),
	},
	{
		id: "userspace",
		source: must(
			zp1hs01.get("documents"),
			"original userspace dataset not found",
		),
		target: must(zp1hs01.get("userspace"), "new userspace dataset not found"),
	},
];

for (const m of migrations) {
	// The truenas provider has no field to bind a Replication to a SnapshotTask by
	// id, so TrueNAS can only match them by naming schema — which does not satisfy
	// its "auto" push-replication requirement. This task keeps a matching snapshot
	// available; the replication itself must be triggered manually (auto: false).
	// Hourly with a 1-hour lifetime keeps only the latest snapshot for now.
	const snapshotTask = new truenas.SnapshotTask(
		`zp1hs01-snap-${m.id}`,
		{
			dataset: m.source.path,
			namingSchema: SNAPSHOT_NAMING_SCHEMA,
			recursive: false,
			allowEmpty: true,
			lifetimeValue: 1,
			lifetimeUnit: "HOUR",
			enabled: true,
			...SNAPSHOT_HOURLY_PRESET,
		},
		{ parent: m.source.resource },
	);

	new truenas.Replication(
		`zp1hs01-repl-${m.id}`,
		{
			name: `${m.source.path} -> ${m.target.path}`,
			direction: "PUSH",
			transport: "LOCAL",
			sourceDatasets: [m.source.path],
			targetDataset: m.target.path,
			auto: false,
			alsoIncludeNamingSchemas: [SNAPSHOT_NAMING_SCHEMA],
			retentionPolicy: "SOURCE",
		},
		{ parent: snapshotTask },
	);
}
