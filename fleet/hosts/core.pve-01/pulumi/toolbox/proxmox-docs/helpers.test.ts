import { expect } from "chai";
import { describe, it } from "mocha";

import { countWord, humanList, isSingular, yesNo } from "./helpers";

describe("humanList", () => {
	it("renders an empty array as 'none'", () => {
		expect(humanList([])).to.equal("none");
	});

	it("renders a single element without a conjunction", () => {
		expect(humanList(["a"])).to.equal("a");
	});

	it("renders two elements with 'and'", () => {
		expect(humanList(["a", "b"])).to.equal("a and b");
	});

	it("renders three or more as a comma list plus 'and'", () => {
		expect(humanList(["a", "b", "c"])).to.equal("a, b and c");
	});
});

describe("countWord", () => {
	it("spells small counts as words so sentences read as prose", () => {
		expect(countWord([])).to.equal("No");
		expect(countWord(["a"])).to.equal("One");
		expect(countWord(["a", "b", "c"])).to.equal("Three");
	});

	it("accepts a number as well as an array", () => {
		expect(countWord(4)).to.equal("Four");
	});

	it("falls back to digits past ten, where words stop helping", () => {
		expect(countWord(11)).to.equal("11");
	});
});

describe("isSingular", () => {
	it("is true only for a one-element array", () => {
		expect(isSingular(["a"])).to.equal(true);
		expect(isSingular([])).to.equal(false);
		expect(isSingular(["a", "b"])).to.equal(false);
	});
});

describe("yesNo", () => {
	it("renders booleans as yes/no", () => {
		expect(yesNo(true)).to.equal("yes");
		expect(yesNo(false)).to.equal("no");
	});

	it("renders an unset value as a dash rather than 'no'", () => {
		expect(yesNo(undefined)).to.equal("—");
	});
});
