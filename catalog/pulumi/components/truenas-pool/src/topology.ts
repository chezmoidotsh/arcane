// -----------------------------------------------------------------------------
// Pool vdev/disk topology rendering: `TrueNASTopology` (the public class
// returned by `TrueNASPool.topology()`, see ./pool) plus the ASCII box-drawing
// engine behind its `toString()`. No Pulumi Output or network access here --
// this only renders whatever `TrueNASPoolInfo`/`TrueNASDiskInfo[]` it's
// constructed with, which is why it's unit-tested directly against fixture
// data (see truenas-pool.test.ts) rather than through a live fetch.
// -----------------------------------------------------------------------------

import { createHash } from "node:crypto";

import type {
	TrueNASDiskInfo,
	TrueNASPoolInfo,
	TrueNASVdevNode,
} from "./truenas-api";

/**
 * A resolved snapshot of one pool's physical vdev topology, from a direct,
 * read-only JSON-RPC call to the TrueNAS API itself (see ./truenas-api) —
 * neither topology nor per-disk model round-trips through the managed
 * `truenas.Dataset`/`truenas.Pool` resources or their data sources at all,
 * confirmed empirically. Returned by `TrueNASPool.topology()`.
 */
export class TrueNASTopology {
	private readonly diskByName: Map<string, TrueNASDiskInfo>;

	constructor(
		private readonly pool: TrueNASPoolInfo | undefined,
		disks: TrueNASDiskInfo[],
	) {
		this.diskByName = buildDiskLookup(disks);
	}

	/**
	 * The nested-box vdev/mirror diagram (no title). Each vdev box is labeled
	 * `TYPE - SIZE`, `SIZE` being that vdev's own `stats.size` — ZFS's own
	 * usable-capacity figure, not computed here from member disk sizes. Each
	 * disk box reads `DISK`, its physical type (`SSD`/`HDD`, when known), and
	 * a size — real for a bare top-level disk, *estimated* for a redundant
	 * vdev member (back-derived from the vdev's own `stats.size` + redundancy
	 * type + member count, see `estimateMemberDiskSize`), since `topology`
	 * never carries a real size for an individual redundant-vdev member. A
	 * disk's model id (see `diskModels()`) is rendered as an unbordered line
	 * just below its box.
	 */
	toString(): string {
		if (!this.pool) {
			return "_pool information unavailable_";
		}
		return [
			"```text",
			renderTopology(this.pool.topology, this.diskByName),
			"```",
		].join("\n");
	}

	/**
	 * Every *unique* disk model referenced anywhere in the topology, keyed by
	 * its 4-hex-char id (see `modelId`) — the same id rendered below each disk
	 * box in `toString()`. One entry per distinct model actually present, not
	 * one per physical disk (a pool with ten identical drives has one entry).
	 */
	diskModels(): Map<string, string> {
		if (!this.pool) {
			return new Map();
		}
		const names = new Set<string>();
		for (const nodes of Object.values(this.pool.topology)) {
			if (nodes) collectDiskNames(nodes, names);
		}
		const modelById = new Map<string, string>();
		for (const name of names) {
			const model = this.diskByName.get(name)?.model;
			if (model) modelById.set(modelId(model), model);
		}
		return modelById;
	}
}

/** Builds a lookup of every disk referenced anywhere in `topology`, keyed by device name (e.g. "sdc"). */
function buildDiskLookup(
	disks: TrueNASDiskInfo[],
): Map<string, TrueNASDiskInfo> {
	return new Map(disks.map((d) => [d.name, d]));
}

/** Collects every real device name (`node.disk`) referenced anywhere in a topology, depth-first. */
function collectDiskNames(
	nodes: TrueNASVdevNode[],
	acc: Set<string> = new Set(),
): Set<string> {
	for (const node of nodes) {
		if (node.disk) acc.add(node.disk);
		if (node.children) collectDiskNames(node.children, acc);
	}
	return acc;
}

/**
 * Stable 4-character lowercase hex identifier for a disk model, e.g.
 * `Samsung_SSD_870_EVO_1TB` -> `a1b2`. Two disks of the same model always get
 * the same id — that's what lets `TrueNASTopology.diskModels()` dedupe by
 * model instead of listing one entry per physical disk.
 */
function modelId(model: string): string {
	return createHash("sha256").update(model).digest("hex").slice(0, 4);
}

// -- box drawing -------------------------------------------------------------
// A "box" is an array of same-length lines, complete with its own ┌─┐/│ │/└─┘
// border — nesting is just placing boxes' lines side by side or wrapping a
// row of boxes in one more frame.

type Box = string[];

function centerText(text: string, width: number): string {
	const pad = Math.max(width - text.length, 0);
	const left = Math.floor(pad / 2);
	return " ".repeat(left) + text + " ".repeat(pad - left);
}

/** Inserts blank interior rows just above the bottom border so shorter boxes match `height`. */
function padBoxHeight(box: Box, height: number): Box {
	if (box.length >= height) return box;
	const width = box[0].length;
	const filler = `│${" ".repeat(width - 2)}│`;
	const top = box[0];
	const bottom = box[box.length - 1];
	const middle = box.slice(1, box.length - 1);
	return [top, ...middle, ...Array(height - box.length).fill(filler), bottom];
}

/** Places boxes side by side (row by row), padding to the tallest box's height first. */
function joinHorizontal(boxes: Box[], gap = 0): Box {
	const height = Math.max(...boxes.map((b) => b.length));
	const padded = boxes.map((b) => padBoxHeight(b, height));
	const spacer = " ".repeat(gap);
	const lines: string[] = [];
	for (let i = 0; i < height; i++) {
		lines.push(padded.map((b) => b[i]).join(spacer));
	}
	return lines;
}

/** At most this many boxes per row before wrapping to a new one below — applies to both disks within a vdev and vdev boxes within a pool. */
const MAX_BOXES_PER_ROW = 5;

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size)
		chunks.push(items.slice(i, i + size));
	return chunks;
}

/** Lays boxes out in rows of at most `MAX_BOXES_PER_ROW`, wrapping to additional rows stacked below. */
function layoutInRows(
	boxes: Box[],
	gap: number,
): { lines: string[]; width: number } {
	const rows = chunk(boxes, MAX_BOXES_PER_ROW).map((row) =>
		joinHorizontal(row, gap),
	);
	const width = Math.max(...rows.map((row) => row[0].length));
	const lines = rows.flatMap((row) => row.map((line) => line.padEnd(width)));
	return { lines, width };
}

/** `spaced` inserts a space before the unit (heading use) instead of the box labels' tight "4To". */
function formatDiskSize(bytes: number, spaced = false): string {
	const To = bytes / 1_000_000_000_000;
	const [value, unit] = To >= 1 ? [To, "To"] : [bytes / 1_000_000_000, "Go"];
	return `${Number(value.toFixed(1))}${spaced ? " " : ""}${unit}`;
}

/**
 * Estimated raw per-member-disk size for a vdev, back-derived from that
 * vdev's own `stats.size` (its usable capacity — the only real size the API
 * gives us, since a disk nested inside a redundant vdev always reports
 * `stats.size: 0` for itself). Assumes uniform member disk sizes, same as ZFS
 * itself does when striping/mirroring:
 * - MIRROR: usable == one member's raw size (mirroring doesn't add capacity).
 * - RAIDZ*N*: usable == `(members - N) * raw size` -> raw = usable / (members - N).
 * - STRIPE/unknown: usable == sum of all members -> raw = usable / members.
 */
function estimateMemberDiskSize(vdev: TrueNASVdevNode): number {
	const usable = vdev.stats?.size ?? 0;
	const memberCount = vdev.children?.length ?? 0;
	if (memberCount === 0) return usable;

	const type = (vdev.type ?? "").toUpperCase();
	if (type.startsWith("MIRROR")) return usable;

	const raidzParity = type.match(/^RAIDZ(\d)$/);
	const dataDisks = raidzParity
		? memberCount - Number(raidzParity[1])
		: memberCount;
	return dataDisks > 0 ? usable / dataDisks : 0;
}

/**
 * Leaf box for a single physical disk: "DISK", its type (e.g. "SSD", when
 * known), and its (real or estimated) size. `id`, when given, is the disk's
 * model id (see `modelId`) rendered as an unbordered line just below the
 * box itself — cross-referenced in the `Disks:` legend, not repeated inside
 * every box (model strings are far wider than these boxes).
 */
function diskBox(sizeBytes: number, type?: string, id?: string): Box {
	const lines = type
		? ["DISK", type, formatDiskSize(sizeBytes)]
		: ["DISK", formatDiskSize(sizeBytes)];
	const width = Math.max(...lines.map((l) => l.length)) + 2;
	const top = `┌${"─".repeat(width)}┐`;
	const bottom = `└${"─".repeat(width)}┘`;
	const box = [top, ...lines.map((l) => `│${centerText(l, width)}│`), bottom];
	return id ? [...box, centerText(id, width + 2)] : box;
}

/** Outer frame wrapping already-laid-out inner content, labeled (e.g. "MIRROR - 4To") — caller controls casing. */
function frameBox(label: string, innerLines: string[], width: number): Box {
	const top = `┌${"─".repeat(width)}┐`;
	const bottom = `└${"─".repeat(width)}┘`;
	const labelRow = `│${centerText(label, width)}│`;
	return [top, labelRow, ...innerLines.map((l) => `│${l}│`), bottom];
}

/** Renders a single leaf disk box, looking up its type + model id (when the device is known to `disk.query`). */
function renderDiskBox(
	sizeBytes: number,
	disk: string | null | undefined,
	diskByName: Map<string, TrueNASDiskInfo>,
): Box {
	const info = disk ? diskByName.get(disk) : undefined;
	return diskBox(sizeBytes, info?.type, info ? modelId(info.model) : undefined);
}

function renderVdevNode(
	node: TrueNASVdevNode,
	diskByName: Map<string, TrueNASDiskInfo>,
): Box {
	if (!node.children || node.children.length === 0) {
		// A bare top-level disk acting as its own vdev — its own stats.size is real.
		return renderDiskBox(node.stats?.size ?? 0, node.disk, diskByName);
	}
	// Beyond MAX_BOXES_PER_ROW disks, wrap to additional rows stacked inside the frame.
	const memberDiskSize = estimateMemberDiskSize(node);
	const childBoxes = node.children.map((child) =>
		child.children && child.children.length > 0
			? renderVdevNode(child, diskByName)
			: renderDiskBox(memberDiskSize, child.disk, diskByName),
	);
	const { lines, width } = layoutInRows(childBoxes, 0);
	const label = `${(node.type ?? "VDEV").toUpperCase()} - ${formatDiskSize(node.stats?.size ?? 0)}`;
	return frameBox(label, lines, width);
}

/** A full-width `─────[ NAME ]─────` rule, matching the width of the row it introduces. */
function categorySeparator(name: string, width: number): string {
	const label = `[ ${name.toUpperCase()} ]`;
	const pad = Math.max(width - label.length, 0);
	const left = Math.floor(pad / 2);
	const right = pad - left;
	return `${"─".repeat(left)}${label}${"─".repeat(right)}`;
}

function renderCategory(
	name: string,
	nodes: TrueNASVdevNode[],
	diskByName: Map<string, TrueNASDiskInfo>,
): string {
	// Same row-wrapping as within a vdev, but for the vdev boxes themselves —
	// beyond MAX_BOXES_PER_ROW vdevs, wrap to additional rows.
	const boxes = nodes.map((node) => renderVdevNode(node, diskByName));
	const { lines, width } = layoutInRows(boxes, 0);
	return [categorySeparator(name, width), ...lines].join("\n");
}

function renderTopology(
	topology: Record<string, TrueNASVdevNode[] | undefined>,
	diskByName: Map<string, TrueNASDiskInfo>,
): string {
	const categories = (
		["data", "cache", "log", "spare", "special", "dedup"] as const
	)
		.map((name): [string, TrueNASVdevNode[] | undefined] => [
			name,
			topology[name],
		])
		.filter(
			(entry): entry is [string, TrueNASVdevNode[]] =>
				Array.isArray(entry[1]) && entry[1].length > 0,
		);

	if (categories.length === 0) {
		return "(no topology reported)";
	}

	return categories
		.map(([name, nodes]) => renderCategory(name, nodes, diskByName))
		.join("\n\n");
}
