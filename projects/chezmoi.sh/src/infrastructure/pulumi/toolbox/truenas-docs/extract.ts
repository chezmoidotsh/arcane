import { must } from "@chezmoi.sh/pulumi-lib";

import type { ExportedResource } from "./stack-export";

// -----------------------------------------------------------------------------
// Pure functions turning a `pulumi stack export` resource list (+ the
// `pulumi:pulumi:Stack` pseudo-resource's own outputs) into the plain-data
// shapes `template.hbs`/`partials/*.hbs` expect. No Pulumi, no network --
// everything here is a straight read of already-deployed state, grouped by
// stable type token instead of by hand-picked imports.
// -----------------------------------------------------------------------------

/** The resource's own logical name -- the URN's last `::`-separated segment, regardless of parenting depth. */
export function logicalName(urn: string): string {
	return urn.split("::").pop() as string;
}

/** The URN's own ancestor-to-self type chain (e.g. `["chezmoi:truenas:Pool", "truenas:index/dataset:Dataset", "truenas:index/shareNfs:ShareNfs"]`). */
export function typeChain(urn: string): string[] {
	const segments = urn.split("::");
	return segments[segments.length - 2].split("$");
}

/** True if `type` appears anywhere in `urn`'s ancestor chain (not counting the resource's own final type). */
export function hasAncestorType(urn: string, type: string): boolean {
	return typeChain(urn).slice(0, -1).includes(type);
}

/** Every resource whose type token is exactly `type`. */
export function resourcesOfType(
	resources: ExportedResource[],
	type: string,
): ExportedResource[] {
	return resources.filter((r) => r.type === type);
}

function out<T>(resource: ExportedResource, key: string): T {
	return resource.outputs?.[key] as T;
}

/**
 * Sorts by a string key, ascending. `pulumi stack export`'s own resource
 * order reflects incidental state-file/creation order, not a curated
 * reading order -- every list-returning extractor below sorts its output so
 * the generated doc stays stable across reruns instead of reshuffling every
 * time the underlying export order happens to differ.
 */
function byKey<T>(key: (item: T) => string) {
	return (a: T, b: T) => key(a).localeCompare(key(b));
}

export interface NfsShareDoc {
	name: string;
	comment: string;
	mapallUser?: string;
	enabled: boolean;
	readonly?: boolean;
}

/** `name` is the Pulumi resource's own logical name (from its URN), not `outputs.name` -- NFS shares don't even have a `name` field on the real resource. */
export function extractNfsShares(resources: ExportedResource[]): NfsShareDoc[] {
	return resourcesOfType(resources, "truenas:index/shareNfs:ShareNfs")
		.map(
			(r): NfsShareDoc => ({
				name: logicalName(r.urn),
				comment: out(r, "comment"),
				mapallUser: out(r, "mapallUser"),
				enabled: out(r, "enabled"),
				readonly: out(r, "readonly"),
			}),
		)
		.sort(byKey((s) => s.name));
}

export interface SmbShareDoc {
	name: string;
	comment: string;
	purpose: string;
	enabled: boolean;
	readonly?: boolean;
}

/**
 * `name` is the Pulumi resource's own logical name (from its URN), not
 * `outputs.name` -- that field is the TrueNAS-side display name (e.g.
 * `"Mes Documents"`), a different thing entirely.
 */
export function extractSmbShares(resources: ExportedResource[]): SmbShareDoc[] {
	return resourcesOfType(resources, "truenas:index/shareSmb:ShareSmb")
		.map(
			(r): SmbShareDoc => ({
				name: logicalName(r.urn),
				comment: out(r, "comment"),
				purpose: out(r, "purpose"),
				enabled: out(r, "enabled"),
				readonly: out(r, "readonly"),
			}),
		)
		.sort(byKey((s) => s.name));
}

export interface IdentityDoc {
	username: string;
	uid: number;
	gid: number;
	smb: boolean;
}

/**
 * `gid` reads `outputs.group` directly -- once reading fully-deployed state
 * (never preview-time unresolved Outputs), it's exactly the numeric gid
 * needed, with no `truenas.Group` cross-reference required (none of this
 * stack's 4 accounts declares a separate primary group; all use
 * `groupCreate: true`).
 */
export function extractIdentities(
	resources: ExportedResource[],
): IdentityDoc[] {
	return resourcesOfType(resources, "truenas:index/user:User")
		.map(
			(r): IdentityDoc => ({
				username: out(r, "username"),
				uid: out(r, "uid"),
				gid: out(r, "group"),
				smb: out(r, "smb"),
			}),
		)
		.sort(byKey((u) => u.username));
}

export interface AclTemplateDoc {
	name: string;
	acltype: string;
	comment: string;
}

export function extractAclTemplates(
	resources: ExportedResource[],
): AclTemplateDoc[] {
	return resourcesOfType(
		resources,
		"truenas:index/filesystemAclTemplate:FilesystemAclTemplate",
	)
		.map(
			(r): AclTemplateDoc => ({
				name: out(r, "name"),
				acltype: out(r, "acltype"),
				comment: out(r, "comment"),
			}),
		)
		.sort(byKey((t) => t.name));
}

export interface AclAssignmentDoc {
	dataset: string;
	template: string;
}

/** Reads the `nfs4AclAssignments` stack output (see `../truenas/index.ts`) -- the one doc section with no infrastructure resource of its own. */
export function extractAclAssignments(
	stackOutputs: Record<string, unknown>,
): AclAssignmentDoc[] {
	return (
		(stackOutputs.nfs4AclAssignments as AclAssignmentDoc[] | undefined) ?? []
	);
}

export interface CloudSyncJobDoc {
	description: string;
	source: string;
	direction: string;
	transferMode: string;
	enabled: boolean;
	schedule: {
		minute: string;
		hour: string;
		dom: string;
		month: string;
		dow: string;
	};
}

function toCloudSyncJob(r: ExportedResource): CloudSyncJobDoc {
	return {
		description: out(r, "description"),
		source: out(r, "path"), // `backups.hbs` reads `{{source}}`, the underlying resource field is `path`
		direction: out(r, "direction"),
		transferMode: out(r, "transferMode"),
		enabled: out(r, "enabled"),
		schedule: {
			minute: out(r, "scheduleMinute"),
			hour: out(r, "scheduleHour"),
			dom: out(r, "scheduleDom"),
			month: out(r, "scheduleMonth"),
			dow: out(r, "scheduleDow"),
		},
	};
}

/** Granular, per-dataset CloudSync jobs -- every `CloudSync` parented (transitively) under a `chezmoi:truenas:Pool`. */
export function extractCloudSyncJobs(
	resources: ExportedResource[],
): CloudSyncJobDoc[] {
	return resourcesOfType(resources, "truenas:index/cloudSync:CloudSync")
		.filter((r) => hasAncestorType(r.urn, "chezmoi:truenas:Pool"))
		.map(toCloudSyncJob)
		.sort(byKey((j) => j.source));
}

/** The one whole-pool CloudSync task declared directly under the stack -- it has no `chezmoi:truenas:Pool` ancestor, unlike the per-dataset jobs below it. */
export function extractLegacyGlobalSync(
	resources: ExportedResource[],
): CloudSyncJobDoc {
	const [legacy] = resourcesOfType(
		resources,
		"truenas:index/cloudSync:CloudSync",
	).filter((r) => !hasAncestorType(r.urn, "chezmoi:truenas:Pool"));
	return toCloudSyncJob(
		must(legacy, "No legacy global CloudSync task found in stack state"),
	);
}

export interface ScrubTaskDoc {
	poolName: string;
	thresholdDays: number;
	enabled: boolean;
	schedule: {
		minute: string;
		hour: string;
		dom: string;
		month: string;
		dow: string;
	};
}

/** `poolName` is the resource's own read-only output (populated by the API), not derived from URN ancestry. */
export function extractScrubTasks(
	resources: ExportedResource[],
): ScrubTaskDoc[] {
	return resourcesOfType(resources, "truenas:index/scrubTask:ScrubTask")
		.map(
			(r): ScrubTaskDoc => ({
				poolName: out(r, "poolName"),
				thresholdDays: out(r, "threshold"),
				enabled: out(r, "enabled"),
				schedule: {
					minute: out(r, "scheduleMinute"),
					hour: out(r, "scheduleHour"),
					dom: out(r, "scheduleDom"),
					month: out(r, "scheduleMonth"),
					dow: out(r, "scheduleDow"),
				},
			}),
		)
		.sort(byKey((t) => t.poolName));
}

export interface SnapshotTaskDoc {
	dataset: string;
	/** True when `dataset` is a bare pool name (no `/`) -- the whole-pool safety-net task, not a per-dataset one. */
	wholePool: boolean;
	recursive: boolean;
	lifetimeValue: number;
	lifetimeUnit: string;
	enabled: boolean;
	schedule: {
		minute: string;
		hour: string;
		dom: string;
		month: string;
		dow: string;
	};
}

/** `dataset` is pool-relative (e.g. `zp1hs01` or `zp1hs01/applications/managed/app.immich`), matching the `nfs4AclAssignments` dataset convention -- no `/mnt/` prefix, unlike CloudSync's `source`. */
export function extractSnapshotTasks(
	resources: ExportedResource[],
): SnapshotTaskDoc[] {
	return resourcesOfType(resources, "truenas:index/snapshotTask:SnapshotTask")
		.map((r): SnapshotTaskDoc => {
			const dataset = out<string>(r, "dataset");
			return {
				dataset,
				wholePool: !dataset.includes("/"),
				recursive: out(r, "recursive"),
				lifetimeValue: out(r, "lifetimeValue"),
				lifetimeUnit: out(r, "lifetimeUnit"),
				enabled: out(r, "enabled"),
				schedule: {
					minute: out(r, "scheduleMinute"),
					hour: out(r, "scheduleHour"),
					dom: out(r, "scheduleDom"),
					month: out(r, "scheduleMonth"),
					dow: out(r, "scheduleDow"),
				},
			};
		})
		.sort(byKey((t) => t.dataset));
}

export interface BucketDoc {
	name: string;
	retentionDays: number;
	lifecycleDeleteDays: number;
}

export function extractBuckets(resources: ExportedResource[]): BucketDoc[] {
	const buckets = resourcesOfType(resources, "b2:index/bucket:Bucket").map(
		(r) => {
			const name = out<string>(r, "bucketName");
			const lockConfigs = out<
				{ defaultRetention?: { period?: { duration: number } } }[]
			>(r, "fileLockConfigurations");
			const lifecycleRules = out<{ daysFromHidingToDeleting: number }[]>(
				r,
				"lifecycleRules",
			);
			const retention = must(
				must(lockConfigs, `${name}: no fileLockConfigurations`)[0]
					.defaultRetention,
				`${name}: no defaultRetention`,
			);
			return {
				name,
				retentionDays: must(retention.period, `${name}: no retention period`)
					.duration,
				lifecycleDeleteDays: must(
					lifecycleRules,
					`${name}: no lifecycleRules`,
				)[0].daysFromHidingToDeleting,
			};
		},
	);
	return buckets.sort(byKey((b) => b.name));
}

/** Logical pool names (`zp1cs01`, `zp1hs01`, ...) -- `chezmoi:truenas:Pool` registers no outputs of its own, so these come from each instance's own URN. */
export function extractPoolNames(resources: ExportedResource[]): string[] {
	return resourcesOfType(resources, "chezmoi:truenas:Pool")
		.map((r) => logicalName(r.urn))
		.sort();
}

export interface NetworkDoc {
	hostname: string;
	gateway: string;
	nameservers: string[];
	interfaces: {
		name: string;
		mtu: number;
		aliases: { address: string; netmask: number }[];
	}[];
}

export function extractNetwork(resources: ExportedResource[]): NetworkDoc {
	const config = must(
		resourcesOfType(resources, "truenas:index/networkConfig:NetworkConfig")[0],
		"No NetworkConfig resource found in stack state",
	);
	const nameservers = [
		out<string>(config, "nameserver1"),
		out<string>(config, "nameserver2"),
		out<string>(config, "nameserver3"),
	].filter((n) => n.length > 0);

	const interfaces = resourcesOfType(
		resources,
		"truenas:index/networkInterface:NetworkInterface",
	)
		.map((r) => ({
			name: out<string>(r, "name"),
			mtu: out<number>(r, "mtu"),
			aliases: out<{ address: string; netmask: number }[]>(r, "aliases").map(
				({ address, netmask }) => ({ address, netmask }),
			),
		}))
		.sort(byKey((i) => i.name));

	return {
		hostname: out(config, "hostname"),
		gateway: out(config, "ipv4gateway"),
		nameservers,
		interfaces,
	};
}

export interface ServicesDoc {
	enabledServiceNames: string[];
	disabledServiceNames: string[];
}

export function extractServices(resources: ExportedResource[]): ServicesDoc {
	const services = resourcesOfType(resources, "truenas:index/service:Service");
	return {
		enabledServiceNames: services
			.filter((r) => out(r, "enable"))
			.map((r) => out<string>(r, "service"))
			.sort(),
		disabledServiceNames: services
			.filter((r) => !out(r, "enable"))
			.map((r) => out<string>(r, "service"))
			.sort(),
	};
}

/** Pool names with no CloudSync job (granular or legacy) syncing from them -- called out explicitly in the Backups section. */
export function computeNotBackedUpPools(
	poolNames: string[],
	jobs: { source: string }[],
	legacyGlobalSync: { source: string },
): string[] {
	const backedUpPoolNames = new Set(
		[legacyGlobalSync, ...jobs].map(
			(j) => j.source.replace(/^\/mnt\//, "").split("/")[0],
		),
	);
	return poolNames.filter((n) => !backedUpPoolNames.has(n));
}
