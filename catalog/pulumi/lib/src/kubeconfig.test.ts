import { expect } from "chai";
import { describe, it } from "mocha";

import { kubeconfigFor } from "./kubeconfig";

describe("kubeconfigFor", () => {
	it("asks kubectl for the minified, raw config of the given context", async () => {
		let called: { file: string; args: string[] } | undefined;
		const out = kubeconfigFor("omni-rhodes-akn", (file, args) => {
			called = { file, args };
			return "apiVersion: v1\nkind: Config\n";
		});

		expect(called).to.deep.equal({
			file: "kubectl",
			args: ["config", "view", "--minify", "--raw", "--context", "omni-rhodes-akn"],
		});
		expect(await new Promise((r) => out.apply(r))).to.equal(
			"apiVersion: v1\nkind: Config\n",
		);
	});

	it("propagates a kubectl failure instead of falling back on a path", () => {
		expect(() =>
			kubeconfigFor("nope", () => {
				throw new Error("context not found");
			}),
		).to.throw("context not found");
	});
});
