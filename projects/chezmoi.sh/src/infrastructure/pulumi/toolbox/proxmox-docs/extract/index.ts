import type { ExportedResource } from "../stack-export";

// -----------------------------------------------------------------------------
// Shared plumbing for every extractor in this folder, plus the barrel re-export
// -----------------------------------------------------------------------------
// One file per resource type: each knows a single Pulumi type token and the
// plain shape the templates want for it. Nothing here reaches across resource
// types -- cross-cutting statements (which pool is an ACL boundary, which
// identity has no token) are computed in ../derive.ts instead, so an extractor
// never depends on another extractor's output.
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

/** Reads one output field off a resource, typed at the call site. */
export function out<T>(resource: ExportedResource, key: string): T {
	return resource.outputs?.[key] as T;
}

/**
 * Normalises an optional string field to `undefined` when it carries no value.
 *
 * The bridged Proxmox provider emits **empty strings**, not `undefined`, for
 * every unset string field (`macro: ""`, `dport: ""`, `iface: ""`, …). A plain
 * `??` therefore never falls back -- `"" ?? "ACCEPT"` is `""` -- which silently
 * renders blank table cells. Route every optional string from state through
 * this.
 */
export function text(value: unknown): string | undefined {
	if (typeof value !== "string")
		return value === undefined ? undefined : String(value);
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Sorts by a string key, ascending. `pulumi stack export`'s own resource order
 * reflects incidental state-file/creation order, not a curated reading order --
 * every list-returning extractor sorts its output so the generated document
 * stays stable across reruns instead of reshuffling whenever the export order
 * happens to differ.
 */
export function byKey<T>(key: (item: T) => string) {
	return (a: T, b: T) => key(a).localeCompare(key(b));
}

export * from "./acl";
export * from "./acme-account";
export * from "./acme-certificate";
export * from "./acme-dns-plugin";
export * from "./pool";
export * from "./pool-membership";
export * from "./role";
export * from "./sdn-subnet";
export * from "./sdn-vnet";
export * from "./sdn-zone";
export * from "./security-group";
export * from "./storage-pbs";
export * from "./token";
export * from "./user";
