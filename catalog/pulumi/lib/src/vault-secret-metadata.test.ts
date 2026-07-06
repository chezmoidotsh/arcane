import * as pulumi from "@pulumi/pulumi";
import { expect } from "chai";
import { before, describe, it } from "mocha";

import { vaultSecretMetadata } from "./vault-secret-metadata";

/**
 * Unit tests for vaultSecretMetadata.
 *
 * The caller-detection logic is exercised for real: because the caller of
 * vaultSecretMetadata in these tests is THIS file, `created-by` must resolve to
 * this test file's own repo-relative path — proving the stack walk + repo-root
 * anchor work end to end.
 */

before(async () => {
	await pulumi.runtime.setMocks(
		{
			newResource(args: pulumi.runtime.MockResourceArgs) {
				return { id: `${args.name}_id`, state: args.inputs };
			},
			call(args: pulumi.runtime.MockCallArgs) {
				return args.inputs;
			},
		},
		"test",
		"test",
	);
});

function unwrap<T>(output: pulumi.Output<T>): Promise<T> {
	return new Promise((resolve) => output.apply((value) => resolve(value)));
}

describe("vaultSecretMetadata", () => {
	it("returns exactly the three convention fields", () => {
		const source = new pulumi.ComponentResource("test:Source", "src-1", {});
		const meta = vaultSecretMetadata(source);
		expect(Object.keys(meta).sort()).to.deep.equal(
			["created-by", "renewal-process", "x-renewal-cmd"].sort(),
		);
	});

	it("derives created-by from the caller's own file (this test file)", () => {
		const source = new pulumi.ComponentResource("test:Source", "src-2", {});
		const meta = vaultSecretMetadata(source);
		expect(meta["created-by"]).to.equal(
			"catalog/pulumi/lib/src/vault-secret-metadata.test.ts",
		);
	});

	it("uses the single fixed renewal-process sentence", () => {
		const source = new pulumi.ComponentResource("test:Source", "src-3", {});
		const meta = vaultSecretMetadata(source);
		expect(meta["renewal-process"]).to.equal(
			"Rotate the credential below; this secret's value is recomputed from it " +
				"and picks up the new one automatically on the next `pulumi up`.",
		);
	});

	it("builds x-renewal-cmd from the source resource's own URN by default", async () => {
		const source = new pulumi.ComponentResource("test:Source", "src-4", {});
		const meta = vaultSecretMetadata(source);
		const urn = await unwrap(source.urn);
		expect(await unwrap(meta["x-renewal-cmd"])).to.equal(
			`pulumi up --replace '${urn}'`,
		);
	});

	it("honours an explicit renewalUrn override for component-backed credentials", async () => {
		const source = new pulumi.ComponentResource("test:Source", "src-5", {});
		const innerUrn = pulumi.output("urn:pulumi:test::test::test:Inner::inner");
		const meta = vaultSecretMetadata(source, { renewalUrn: innerUrn });
		expect(await unwrap(meta["x-renewal-cmd"])).to.equal(
			"pulumi up --replace 'urn:pulumi:test::test::test:Inner::inner'",
		);
	});
});
