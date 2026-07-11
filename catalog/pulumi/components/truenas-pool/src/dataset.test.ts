import { ByteSize } from "@chezmoi.sh/pulumi-lib";
import { expect } from "chai";
import { describe, it } from "mocha";

import { TrueNASDataset } from "./dataset";

/**
 * `TrueNASDataset.toString()` is plain rendering, no Pulumi Output or
 * network involved — `live` is set directly on fixture nodes here rather
 * than going through `TrueNASPool.datasetsTree()`'s fetch (see pool.test.ts
 * for the materialization side, which does need Pulumi mocks).
 */

function datasetProp<T>(parsed: T): {
	parsed: T;
	rawvalue: string;
	value: string | null;
	source: string;
} {
	return {
		parsed,
		rawvalue: String(parsed),
		value: String(parsed),
		source: "LOCAL",
	};
}

describe("TrueNASDataset.toString()", () => {
	it("renders itself and its children as a tree, quota in the info column, comments as description, no title", () => {
		const inbox = new TrueNASDataset("inbox");
		inbox.live = {
			id: "x",
			name: "zp1cs01/media/inbox",
			pool: "zp1cs01",
			type: "FILESYSTEM",
			encrypted: false,
			encryption_root: null,
			quota: datasetProp(50 * ByteSize.Gi),
		};
		const media = new TrueNASDataset("media", {}, [inbox]);
		media.live = {
			id: "x",
			name: "zp1cs01/media",
			pool: "zp1cs01",
			type: "FILESYSTEM",
			encrypted: false,
			encryption_root: null,
			user_properties: { comments: datasetProp("media library") },
		};

		expect(media.toString()).to.equal(
			"└─ media                 media library\n   └─ inbox  quota=50Gi",
		);
	});

	it("joins multiple info items with a bare comma, no space, and shows encrypted (read from live, never the managed resource)", () => {
		const documents = new TrueNASDataset("documents");
		documents.live = {
			id: "x",
			name: "zp1hs01/documents",
			pool: "zp1hs01",
			type: "FILESYSTEM",
			encrypted: true,
			encryption_root: "zp1hs01/documents",
			quota: datasetProp(50 * ByteSize.Gi),
		};

		expect(documents.toString()).to.equal("└─ documents  quota=50Gi,encrypted");
	});

	it("leaves the info/description columns blank (no dash placeholder) when there's no live data at all", () => {
		expect(new TrueNASDataset("media").toString()).to.equal("└─ media");
	});

	it("positions itself via prefix/isLast, for a parent composing several children (or siblings) together", () => {
		const immich = new TrueNASDataset("immich");
		immich.live = {
			id: "x",
			name: "immich",
			pool: "zp1hs01",
			type: "FILESYSTEM",
			encrypted: false,
			encryption_root: null,
			quota: datasetProp(50 * ByteSize.Gi),
		};
		const paperless = new TrueNASDataset("paperless");
		paperless.live = {
			id: "x",
			name: "paperless",
			pool: "zp1hs01",
			type: "FILESYSTEM",
			encrypted: false,
			encryption_root: null,
			quota: datasetProp(10 * ByteSize.Gi),
		};

		const rendered = [
			immich.toString("", false),
			paperless.toString("", true),
		].join("\n");

		expect(rendered).to.equal(
			"├─ immich  quota=50Gi\n└─ paperless  quota=10Gi",
		);
	});
});
