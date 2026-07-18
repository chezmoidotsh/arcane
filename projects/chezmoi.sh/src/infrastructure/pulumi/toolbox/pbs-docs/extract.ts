import type { ExportedResource } from "./stack-export";

// -----------------------------------------------------------------------------
// Pure functions turning a `pulumi stack export` resource list into the plain
// -data shapes `template.hbs`/`partials/*.hbs` expect. No Pulumi, no network
// -- everything here is a straight read of already-deployed state, grouped by
// stable type token instead of by hand-picked imports. Mirrors
// `../truenas-docs/extract.ts`; see that file for the origin of this pattern.
// -----------------------------------------------------------------------------

/** The resource's own logical name -- the URN's last `::`-separated segment, regardless of parenting depth. */
export function logicalName(urn: string): string {
	return urn.split("::").pop() as string;
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

export interface DatastoreDoc {
	name: string;
	comment?: string;
	path?: string;
	s3Bucket?: string;
	s3Client?: string;
	gcSchedule?: string;
	notificationMode?: string;
	disabled?: boolean;
}

export function extractDatastores(
	resources: ExportedResource[],
): DatastoreDoc[] {
	return resourcesOfType(resources, "pbs:index/datastore:Datastore")
		.map(
			(r): DatastoreDoc => ({
				name: out(r, "name") ?? logicalName(r.urn),
				comment: out(r, "comment"),
				path: out(r, "path"),
				s3Bucket: out(r, "s3Bucket"),
				s3Client: out(r, "s3Client"),
				gcSchedule: out(r, "gcSchedule"),
				notificationMode: out(r, "notificationMode"),
				disabled: out(r, "disabled"),
			}),
		)
		.sort(byKey((d) => d.name));
}

export interface PruneJobDoc {
	id: string;
	store: string;
	schedule: string;
	retentionSummary: string;
	comment?: string;
	disabled?: boolean;
}

const KEEP_FIELDS: Array<[key: string, label: string]> = [
	["keepLast", "keep-last"],
	["keepHourly", "keep-hourly"],
	["keepDaily", "keep-daily"],
	["keepWeekly", "keep-weekly"],
	["keepMonthly", "keep-monthly"],
	["keepYearly", "keep-yearly"],
];

/** Renders only the `keep*` fields the job actually sets, e.g. `"keep-daily=4, keep-weekly=2, keep-monthly=3"` -- unset tiers are omitted rather than printed as `undefined`. */
function retentionSummary(r: ExportedResource): string {
	const parts = KEEP_FIELDS.map(([key, label]) => {
		const value = out<number | undefined>(r, key);
		return value !== undefined ? `${label}=${value}` : undefined;
	}).filter((part): part is string => part !== undefined);
	return parts.length > 0 ? parts.join(", ") : "no retention limit set";
}

export function extractPruneJobs(resources: ExportedResource[]): PruneJobDoc[] {
	return resourcesOfType(resources, "pbs:index/pruneJob:PruneJob")
		.map(
			(r): PruneJobDoc => ({
				id: out(r, "pruneJobId") ?? logicalName(r.urn),
				store: out(r, "store"),
				schedule: out(r, "schedule"),
				retentionSummary: retentionSummary(r),
				comment: out(r, "comment"),
				disabled: out(r, "disable"),
			}),
		)
		.sort(byKey((j) => j.id));
}

export interface VerifyJobDoc {
	id: string;
	store: string;
	schedule: string;
	ignoreVerified?: boolean;
	outdatedAfter?: number;
	comment?: string;
	disabled?: boolean;
}

export function extractVerifyJobs(
	resources: ExportedResource[],
): VerifyJobDoc[] {
	return resourcesOfType(resources, "pbs:index/verifyJob:VerifyJob")
		.map(
			(r): VerifyJobDoc => ({
				id: out(r, "verifyJobId") ?? logicalName(r.urn),
				store: out(r, "store"),
				schedule: out(r, "schedule"),
				ignoreVerified: out(r, "ignoreVerified"),
				outdatedAfter: out(r, "outdatedAfter"),
				comment: out(r, "comment"),
				disabled: out(r, "disable"),
			}),
		)
		.sort(byKey((j) => j.id));
}

export interface NotificationTargetDoc {
	name: string;
	kind: string;
	comment?: string;
	disabled?: boolean;
}

/**
 * Deliberately never reads `outputs.url`/`outputs.server`/etc -- a Slack (or
 * Gotify/SMTP) endpoint URL is sensitive in practice (anyone holding it can
 * post to the channel), but this provider does not mark it as a secret
 * output (only `pbs.WebhookNotification`'s `secret` field is -- see
 * `./stack-export.ts`), so `pulumi stack export` returns it in plaintext.
 * The generated doc names *that a target exists and what kind it is*, never
 * where it points.
 */
export function extractNotificationTargets(
	resources: ExportedResource[],
): NotificationTargetDoc[] {
	const kinds: Record<string, string> = {
		"pbs:index/webhookNotification:WebhookNotification": "Webhook",
		"pbs:index/gotifyNotification:GotifyNotification": "Gotify",
		"pbs:index/smtpNotification:SmtpNotification": "SMTP",
		"pbs:index/sendmailNotification:SendmailNotification": "Sendmail",
	};
	return Object.entries(kinds)
		.flatMap(([type, kind]) =>
			resourcesOfType(resources, type).map(
				(r): NotificationTargetDoc => ({
					name: out(r, "name") ?? logicalName(r.urn),
					kind,
					comment: out(r, "comment"),
					disabled: out(r, "disable"),
				}),
			),
		)
		.sort(byKey((t) => t.name));
}

export interface NotificationMatcherDoc {
	name: string;
	comment?: string;
	mode?: string;
	matchSeverities?: string[];
	targets?: string[];
	disabled?: boolean;
}

export function extractNotificationMatchers(
	resources: ExportedResource[],
): NotificationMatcherDoc[] {
	return resourcesOfType(
		resources,
		"pbs:index/notificationMatcher:NotificationMatcher",
	)
		.map(
			(r): NotificationMatcherDoc => ({
				name: out(r, "name") ?? logicalName(r.urn),
				comment: out(r, "comment"),
				mode: out(r, "mode"),
				matchSeverities: out(r, "matchSeverities") ?? [],
				targets: out(r, "targets") ?? [],
				disabled: out(r, "disable"),
			}),
		)
		.sort(byKey((m) => m.name));
}

export interface UserDoc {
	userid: string;
	comment?: string;
	email?: string;
	enabled?: boolean;
}

export function extractUsers(resources: ExportedResource[]): UserDoc[] {
	return resourcesOfType(resources, "pbs:index/user:User")
		.map(
			(r): UserDoc => ({
				userid: out(r, "userid") ?? logicalName(r.urn),
				comment: out(r, "comment"),
				email: out(r, "email"),
				enabled: out(r, "enable"),
			}),
		)
		.sort(byKey((u) => u.userid));
}

export interface ApiTokenDoc {
	tokenid: string;
	userid: string;
	tokenName: string;
	comment?: string;
	enabled?: boolean;
}

/** Never reads `outputs.value` -- the one-time token secret, marked as an additional secret output by the provider itself. */
export function extractApiTokens(resources: ExportedResource[]): ApiTokenDoc[] {
	return resourcesOfType(resources, "pbs:index/apiToken:ApiToken")
		.map(
			(r): ApiTokenDoc => ({
				tokenid:
					out(r, "tokenid") ?? `${out(r, "userid")}!${out(r, "tokenName")}`,
				userid: out(r, "userid"),
				tokenName: out(r, "tokenName"),
				comment: out(r, "comment"),
				enabled: out(r, "enable"),
			}),
		)
		.sort(byKey((t) => t.tokenid));
}

export interface AclDoc {
	path: string;
	ugid: string;
	roleId: string;
	propagate: boolean;
}

export function extractAcls(resources: ExportedResource[]): AclDoc[] {
	return resourcesOfType(resources, "pbs:index/acl:Acl")
		.map(
			(r): AclDoc => ({
				path: out(r, "path"),
				ugid: out(r, "ugid"),
				roleId: out(r, "roleId"),
				propagate: out(r, "propagate"),
			}),
		)
		.sort(byKey((a) => `${a.path}/${a.ugid}`));
}
