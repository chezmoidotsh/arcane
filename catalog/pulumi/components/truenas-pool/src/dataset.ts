// -----------------------------------------------------------------------------
// A single ZFS dataset node, materialized as a `truenas.Dataset`, plus its
// tree-rendering (`toString()`). Nothing here talks to the network directly
// -- `live` is only ever populated by `TrueNASPool.datasetsTree()` (see
// ./pool), which is what actually fetches it over JSON-RPC.
// -----------------------------------------------------------------------------

import { ByteSize } from "@chezmoi.sh/pulumi-lib";
import type * as pulumi from "@pulumi/pulumi";
import * as truenas from "@pulumi/truenas";

import type {
	Compression,
	Deduplication,
	OnOffInherit,
	RecordSize,
	SnapshotDirectory,
	Sync,
} from "./enums";
import type { TrueNASDatasetInfo } from "./truenas-api";

export type DatasetArgs = Omit<
	truenas.DatasetArgs,
	| "name"
	| "pool"
	| "parentDataset"
	| "atime"
	| "readonly"
	| "compression"
	| "sync"
	| "deduplication"
	| "snapdir"
	| "recordSize"
> & {
	atime?: pulumi.Input<OnOffInherit>;
	readonly?: pulumi.Input<OnOffInherit>;
	compression?: pulumi.Input<Compression>;
	sync?: pulumi.Input<Sync>;
	deduplication?: pulumi.Input<Deduplication>;
	snapdir?: pulumi.Input<SnapshotDirectory>;
	recordSize?: pulumi.Input<RecordSize>;
};

/**
 * One node of a ZFS dataset tree, materialized as a `truenas.Dataset` once
 * attached to a `TrueNASPool` (or nested under another `TrueNASDataset`).
 *
 * Ownership/mode (uid/gid/mode) is not modeled here — the TrueNAS provider
 * exposes that as a separate filesystem-ACL resource, not a field on
 * `Dataset` itself. There's also no `casesensitivity` here: unlike the old
 * bmanojlovic provider, this one (PjSalty/terraform-provider-truenas) doesn't
 * expose it as a settable attribute at all — it's fixed at creation by the
 * TrueNAS API's own default and can't be pinned or drifted from here.
 *
 * `opts` is a plain `pulumi.CustomResourceOptions` passthrough (`parent` is
 * always forced to the position in the tree, overriding anything passed
 * here).
 */
export class TrueNASDataset {
	public resource?: truenas.Dataset;

	/**
	 * Real, live state for this dataset (quota/encrypted/comments/...), attached by
	 * `TrueNASPool.datasetsTree()` — `undefined` until that's been called at least
	 * once, or if the fetch failed. Never read from `resource`'s own outputs: the
	 * managed `truenas.Dataset` resource has no encryption field at all, and keeping
	 * `toString()` consistently sourced from one place (live, real NAS state) was
	 * simpler than splitting it.
	 */
	public live?: TrueNASDatasetInfo;

	constructor(
		public readonly path: string,
		public readonly args: DatasetArgs = {},
		public readonly children: TrueNASDataset[] = [],
		public readonly opts: pulumi.CustomResourceOptions = {},
	) {}

	/** @internal creates this node under `pool`/`parentPath` and recurses into children. */
	materialize(
		pool: string,
		parentPath: string | undefined,
		parent: pulumi.Resource,
	): truenas.Dataset {
		const relativePath = parentPath ? `${parentPath}/${this.path}` : this.path;
		const resourceName = `${pool}-${relativePath}`.replace(/[/.]/g, "-");
		this.resource = new truenas.Dataset(
			resourceName,
			{ ...this.args, pool, parentDataset: parentPath, name: this.path },
			{ ...this.opts, parent },
		);
		for (const child of this.children) {
			child.materialize(pool, relativePath, this.resource);
		}
		return this.resource;
	}

	/** @internal registers this node and its descendants into `index`, keyed by path relative to the pool root. */
	index(relativePath: string, into: Map<string, TrueNASDataset>): void {
		into.set(relativePath, this);
		for (const child of this.children) {
			child.index(`${relativePath}/${child.path}`, into);
		}
	}

	/** @internal populates `live` on this node and its descendants, matched by full dataset name (e.g. `zp1cs01/media/inbox`). */
	attachLive(
		fullPath: string,
		liveByName: Map<string, TrueNASDatasetInfo>,
	): void {
		this.live = liveByName.get(fullPath);
		for (const child of this.children) {
			child.attachLive(`${fullPath}/${child.path}`, liveByName);
		}
	}

	/**
	 * Tree-prefixed rendering of this node and its descendants (no title, no code
	 * fence) — quota/encrypted/readonly/dedup in the info column, `comments` as a
	 * free-form description, columns aligned across just this subtree. Reads from
	 * `live`, so it renders blank info/description until `TrueNASPool.datasetsTree()`
	 * has populated it at least once.
	 *
	 * `prefix`/`isLast` exist so a parent can position this node correctly among
	 * its siblings (`TrueNASPool.datasetsTree()` does exactly that, across every
	 * top-level dataset at once so columns line up across the whole pool, not just
	 * within one subtree). Called with no arguments — e.g. via string coercion,
	 * `` `${dataset}` `` — it renders as if it were an isolated root.
	 */
	toString(prefix = "", isLast = true): string {
		return renderRows(collectDatasetRows(this, prefix, isLast));
	}
}

interface DatasetRow {
	name: string;
	info: string;
	description: string;
}

/**
 * Builds one row per dataset (tree-prefixed name, quota/encryption info,
 * comments), depth-first. Exported for `TrueNASPool.datasetsTree()` (see
 * ./pool), which collects rows across every top-level dataset before handing
 * them all to `renderRows()` together, so columns align pool-wide instead of
 * per-subtree.
 */
export function collectDatasetRows(
	dataset: TrueNASDataset,
	prefix: string,
	isLast: boolean,
): DatasetRow[] {
	const connector = isLast ? "└─ " : "├─ ";
	const childPrefix = prefix + (isLast ? "   " : "│  ");

	const live = dataset.live;
	const info: string[] = [];
	const quota = live?.quota?.parsed ?? 0;
	if (quota > 0) info.push(`quota=${(quota / ByteSize.Gi).toFixed(0)}Gi`);
	if (live?.encrypted) info.push("encrypted");
	if (live?.readonly?.parsed) info.push("readonly");
	const dedup = live?.deduplication?.parsed;
	if (dedup && dedup !== "off") info.push(`dedup=${dedup.toUpperCase()}`);

	const rows: DatasetRow[] = [
		{
			name: `${prefix}${connector}${dataset.path}`,
			info: info.join(","),
			description: live?.user_properties?.comments?.value ?? "",
		},
	];
	dataset.children.forEach((child, i) => {
		rows.push(
			...collectDatasetRows(
				child,
				childPrefix,
				i === dataset.children.length - 1,
			),
		);
	});
	return rows;
}

/** Joins rows into aligned text (tree-prefixed name / info / description columns) — the alignment scope is just whatever rows are passed in. */
export function renderRows(rows: DatasetRow[]): string {
	if (rows.length === 0) return "";
	const nameWidth = Math.max(...rows.map((r) => r.name.length));
	const infoWidth = Math.max(...rows.map((r) => r.info.length));
	return rows
		.map((r) =>
			`${r.name.padEnd(nameWidth)}  ${r.info.padEnd(infoWidth)}  ${r.description}`.trimEnd(),
		)
		.join("\n");
}
