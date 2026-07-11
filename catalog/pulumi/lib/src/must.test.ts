import { expect } from "chai";
import { describe, it } from "mocha";

import { must } from "./must";

describe("must", () => {
	it("returns the value unchanged when it's defined", () => {
		expect(must(42)).to.equal(42);
		expect(must(0)).to.equal(0);
		expect(must(null)).to.equal(null);
	});

	it("throws with a default message when the value is undefined", () => {
		expect(() => must(undefined)).to.throw("must(): value is undefined");
	});

	it("throws with the given message when the value is undefined", () => {
		expect(() => must(undefined, "custom message")).to.throw("custom message");
	});
});
