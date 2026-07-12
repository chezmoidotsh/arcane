import * as pulumi from "@pulumi/pulumi";
import { expect } from "chai";
import { before, beforeEach, describe, it } from "mocha";

import { TrueNASPool } from "./pool";

/**
 * `TrueNASPool` materialization exercises real Pulumi resource creation
 * (`truenas.Dataset`), so these tests register Pulumi runtime mocks and
 * record every resource the pool materializes.
 *
 * `TrueNASPool.topology()`/`datasetsTree()` themselves (the thin orchestrators
 * that fetch over JSON-RPC then delegate to ./topology and ./dataset) are
 * intentionally not unit tested here — that would just be re-exercising
 * already-tested rendering (see topology.test.ts / dataset.test.ts) over a
 * live network dependency that isn't a Pulumi invoke and so can't be mocked
 * via `setMocks`.
 */

const TYPE_DATASET = "truenas:index/dataset:Dataset";

/** Captures every Dataset resource registered under mocks, keyed by resource name. */
const created: Record<string, pulumi.runtime.MockResourceArgs> = {};

async function installMocks(): Promise<void> {
	await pulumi.runtime.setMocks(
		{
			newResource(args: pulumi.runtime.MockResourceArgs) {
				if (args.type === TYPE_DATASET) {
					created[args.name] = args;
				}
				return {
					id: `${args.name}_id`,
					state: args.inputs,
				};
			},
			call(args: pulumi.runtime.MockCallArgs) {
				return args.inputs;
			},
		},
		"test",
		"test",
	);
}

before(installMocks);

beforeEach(() => {
	for (const key of Object.keys(created)) delete created[key];
});

/**
 * Resource construction schedules registerResource on the event loop, so the
 * mock's newResource fires AFTER the constructor returns — and, for a nested
 * dataset tree, each level only registers once its parent's urn has
 * resolved, spreading completion across several ticks. Spin until two
 * consecutive idle ticks record no new captures, guaranteeing the full
 * dataset tree is present before assertions read `created`.
 */
async function drain(): Promise<void> {
	let previous = -1;
	for (let idle = 0, ticks = 0; idle < 2 && ticks < 50; ticks++) {
		await new Promise<void>((resolve) => setImmediate(resolve));
		const total = Object.keys(created).length;
		idle = total === previous ? idle + 1 : 0;
		previous = total;
	}
}

describe("TrueNASPool dataset materialization", () => {
	it("creates one Dataset per path, named after its full pool-relative path", async () => {
		new TrueNASPool("zp1cs01", {
			"/media": {},
			"/media/animes": {},
			"/media/movies": {},
		});
		await drain();

		expect(Object.keys(created).sort()).to.deep.equal([
			"zp1cs01-media",
			"zp1cs01-media-animes",
			"zp1cs01-media-movies",
		]);
		expect(created["zp1cs01-media"].inputs).to.include({
			pool: "zp1cs01",
			name: "media",
		});
		expect(created["zp1cs01-media"].inputs).to.not.have.property(
			"parentDataset",
		);
		expect(created["zp1cs01-media-animes"].inputs).to.include({
			pool: "zp1cs01",
			name: "animes",
			parentDataset: "media",
		});
	});

	it("passes dataset args (e.g. quota) through to the Dataset resource", async () => {
		new TrueNASPool("zp1cs01", {
			"/media": {},
			"/media/inbox": { quota: 100 },
		});
		await drain();

		expect(created["zp1cs01-media-inbox"].inputs.quota).to.equal(100);
	});

	it("links datasets by path regardless of declaration order", async () => {
		new TrueNASPool("zp1cs01", {
			"/media/animes": {},
			"/media": {},
		});
		await drain();

		expect(created["zp1cs01-media-animes"].inputs).to.include({
			parentDataset: "media",
		});
	});

	it("throws when a dataset's parent path isn't declared", () => {
		expect(() => new TrueNASPool("zp1cs01", { "/media/animes": {} })).to.throw(
			'Dataset "/media/animes" has no parent dataset declared at "/media"',
		);
	});
});

describe("TrueNASPool dataset lookup", () => {
	it("get() resolves nested datasets by pool-relative path", async () => {
		const pool = new TrueNASPool("zp1cs01", {
			"/media": {},
			"/media/animes": {},
		});
		await drain();

		expect(pool.get("media/animes").path).to.equal("zp1cs01/media/animes");
		expect(pool.get("media").resource).to.exist;
	});

	it("get() throws for an unknown dataset path", async () => {
		const pool = new TrueNASPool("zp1cs01", { "/media": {} });
		await drain();

		expect(() => pool.get("does/not/exist")).to.throw(
			'Unknown dataset "does/not/exist" in pool "zp1cs01"',
		);
	});
});
