import { expect } from "chai";
import { describe, it } from "mocha";

import { sameIds } from "./oidc-app";

describe("sameIds", () => {
	it("is true for identical sets regardless of order", () => {
		expect(sameIds(["a", "b"], ["b", "a"])).to.equal(true);
	});

	it("is false when a group id differs", () => {
		expect(sameIds(["a", "b"], ["a", "c"])).to.equal(false);
	});

	it("is false when the count differs", () => {
		expect(sameIds(["a"], ["a", "b"])).to.equal(false);
	});

	it("is true for two empty lists", () => {
		expect(sameIds([], [])).to.equal(true);
	});
});
