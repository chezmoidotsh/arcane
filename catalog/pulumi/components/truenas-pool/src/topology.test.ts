import { expect } from "chai";
import { describe, it } from "mocha";

import { TrueNASTopology } from "./topology";
import type {
	TrueNASDiskInfo,
	TrueNASPoolInfo,
	TrueNASVdevNode,
} from "./truenas-api";

/**
 * `TrueNASTopology` is a plain class, no Pulumi Output or network involved
 * (topology/disk data come from a direct JSON-RPC call — see ./truenas-api —
 * which isn't a Pulumi invoke and so can't be mocked via
 * `pulumi.runtime.setMocks`), so it's tested directly against fixture
 * objects shaped exactly like real `pool.query`/`disk.query` responses.
 *
 * Rendering tests assert against full expected-output fixtures
 * (`expect(...).to.equal(FIXTURE)`) rather than a pile of `.include()` checks
 * on individual fields — a reviewer can read the exact rendered ASCII
 * directly in this file instead of reconstructing it mentally from scattered
 * assertions.
 */

function vdev(
	partial: Partial<TrueNASVdevNode> & Pick<TrueNASVdevNode, "type">,
): TrueNASVdevNode {
	return {
		type: partial.type,
		name: partial.name ?? partial.type,
		path: partial.path ?? null,
		guid: partial.guid ?? "0",
		status: partial.status ?? "ONLINE",
		stats: partial.stats ?? { size: 0 },
		children: partial.children,
		disk: partial.disk,
	};
}

// A mirror vdev (2 disks, 4To usable) and a RAIDZ1 vdev (3 disks, 16To
// usable), both under "data" — usable size is read straight from each vdev's
// own `stats.size`, exactly as ZFS/the real payloads report it (never
// computed from member disk sizes, since the API never carries those for
// individual redundant-vdev members).
const ZP1CS01_POOL: TrueNASPoolInfo = {
	id: 6,
	name: "zp1cs01",
	topology: {
		data: [
			vdev({
				type: "MIRROR",
				stats: { size: 4_000_000_000_000 },
				children: [
					vdev({ type: "DISK", path: "/dev/sda" }),
					vdev({ type: "DISK", path: "/dev/sdb" }),
				],
			}),
			vdev({
				type: "RAIDZ1",
				stats: { size: 16_000_000_000_000 },
				children: [
					vdev({ type: "DISK", path: "/dev/sdc" }),
					vdev({ type: "DISK", path: "/dev/sdd" }),
					vdev({ type: "DISK", path: "/dev/sde" }),
				],
			}),
		],
	},
};

describe("TrueNASTopology.toString()", () => {
	it("labels each vdev TYPE - SIZE and each disk DISK + an estimated size, mirror and RAIDZ1 side by side, no title", () => {
		expect(new TrueNASTopology(ZP1CS01_POOL, []).toString()).to.equal(
			"```text\n" +
				"──────────────────[ DATA ]──────────────────\n" +
				"┌────────────────┐┌────────────────────────┐\n" +
				"│  MIRROR - 4To  ││     RAIDZ1 - 16To      │\n" +
				"│┌──────┐┌──────┐││┌──────┐┌──────┐┌──────┐│\n" +
				"││ DISK ││ DISK ││││ DISK ││ DISK ││ DISK ││\n" +
				"││ 4To  ││ 4To  ││││ 8To  ││ 8To  ││ 8To  ││\n" +
				"│└──────┘└──────┘││└──────┘└──────┘└──────┘│\n" +
				"└────────────────┘└────────────────────────┘\n" +
				"```",
		);
	});

	it("wraps to a new row after 5 boxes, both across vdevs in a category (cache) and disks within a vdev (log/STRIPE)", () => {
		const pool: TrueNASPoolInfo = {
			id: 6,
			name: "zp1cs01",
			topology: {
				cache: Array.from({ length: 6 }, (_, i) =>
					vdev({ type: "DISK", path: `/dev/d${i}` }),
				),
				log: [
					vdev({
						type: "STRIPE",
						stats: { size: 6_000_000_000_000 },
						children: Array.from({ length: 6 }, (_, i) =>
							vdev({ type: "DISK", path: `/dev/l${i}` }),
						),
					}),
				],
			},
		};

		expect(new TrueNASTopology(pool, []).toString()).to.equal(
			"```text\n" +
				"───────────────[ CACHE ]────────────────\n" +
				"┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐\n" +
				"│ DISK ││ DISK ││ DISK ││ DISK ││ DISK │\n" +
				"│ 0Go  ││ 0Go  ││ 0Go  ││ 0Go  ││ 0Go  │\n" +
				"└──────┘└──────┘└──────┘└──────┘└──────┘\n" +
				"┌──────┐                                \n" +
				"│ DISK │                                \n" +
				"│ 0Go  │                                \n" +
				"└──────┘                                \n" +
				"\n" +
				"─────────────────[ LOG ]──────────────────\n" +
				"┌────────────────────────────────────────┐\n" +
				"│              STRIPE - 6To              │\n" +
				"│┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐│\n" +
				"││ DISK ││ DISK ││ DISK ││ DISK ││ DISK ││\n" +
				"││ 1To  ││ 1To  ││ 1To  ││ 1To  ││ 1To  ││\n" +
				"│└──────┘└──────┘└──────┘└──────┘└──────┘│\n" +
				"│┌──────┐                                │\n" +
				"││ DISK │                                │\n" +
				"││ 1To  │                                │\n" +
				"│└──────┘                                │\n" +
				"└────────────────────────────────────────┘\n" +
				"```",
		);
	});

	it("degrades to a placeholder when pool information is unavailable", () => {
		expect(new TrueNASTopology(undefined, []).toString()).to.equal(
			"_pool information unavailable_",
		);
	});

	it("reports no topology instead of an empty diagram when the pool has no vdevs at all", () => {
		expect(
			new TrueNASTopology(
				{ id: 6, name: "zp1cs01", topology: {} },
				[],
			).toString(),
		).to.equal("```text\n(no topology reported)\n```");
	});

	it("adds each disk's real type + a 4-hex-char model id line below its box", () => {
		const pool: TrueNASPoolInfo = {
			id: 5,
			name: "zp1hs01",
			topology: {
				data: [
					vdev({
						type: "MIRROR",
						stats: { size: 4_000_000_000_000 },
						children: [
							vdev({ type: "DISK", disk: "sda" }),
							vdev({ type: "DISK", disk: "sdb" }),
						],
					}),
				],
			},
		};
		const disks: TrueNASDiskInfo[] = [
			{ name: "sda", type: "SSD", model: "Samsung_SSD_870_EVO_1TB" },
			{ name: "sdb", type: "SSD", model: "Samsung_SSD_870_EVO_1TB" },
		];

		expect(new TrueNASTopology(pool, disks).toString()).to.equal(
			"```text\n" +
				"─────[ DATA ]─────\n" +
				"┌────────────────┐\n" +
				"│  MIRROR - 4To  │\n" +
				"│┌──────┐┌──────┐│\n" +
				"││ DISK ││ DISK ││\n" +
				"││ SSD  ││ SSD  ││\n" +
				"││ 4To  ││ 4To  ││\n" +
				"│└──────┘└──────┘│\n" +
				"│  74c4    74c4  │\n" +
				"└────────────────┘\n" +
				"```",
		);
	});

	it("omits the id line when a member disk isn't in disk.query (unknown device, no model to hash)", () => {
		const pool: TrueNASPoolInfo = {
			id: 5,
			name: "zp1hs01",
			topology: {
				data: [
					vdev({
						type: "DISK",
						disk: "sdz",
						stats: { size: 4_000_000_000_000 },
					}),
				],
			},
		};

		expect(new TrueNASTopology(pool, []).toString()).to.equal(
			"```text\n[ DATA ]\n┌──────┐\n│ DISK │\n│ 4To  │\n└──────┘\n```",
		);
	});
});

describe("TrueNASTopology.diskModels()", () => {
	it("dedupes by model -- two disks sharing a model yield one entry, keyed by their shared id", () => {
		const pool: TrueNASPoolInfo = {
			id: 5,
			name: "zp1hs01",
			topology: {
				data: [
					vdev({
						type: "MIRROR",
						children: [
							vdev({ type: "DISK", disk: "sda" }),
							vdev({ type: "DISK", disk: "sdb" }),
						],
					}),
				],
			},
		};
		const disks: TrueNASDiskInfo[] = [
			{ name: "sda", type: "SSD", model: "Samsung_SSD_870_EVO_1TB" },
			{ name: "sdb", type: "SSD", model: "Samsung_SSD_870_EVO_1TB" },
		];

		expect(new TrueNASTopology(pool, disks).diskModels()).to.deep.equal(
			new Map([["74c4", "Samsung_SSD_870_EVO_1TB"]]),
		);
	});

	it("is empty when pool information is unavailable, or when no disk is known to disk.query", () => {
		expect(new TrueNASTopology(undefined, []).diskModels()).to.deep.equal(
			new Map(),
		);

		const pool: TrueNASPoolInfo = {
			id: 5,
			name: "zp1hs01",
			topology: { data: [vdev({ type: "DISK", disk: "sdz" })] },
		};
		expect(new TrueNASTopology(pool, []).diskModels()).to.deep.equal(new Map());
	});
});
