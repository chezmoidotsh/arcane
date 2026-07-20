import { expect } from "chai";
import { describe, it } from "mocha";

import { humanList, isSingular } from "./helpers";

describe("humanList", () => {
	it("renders an empty array as 'none'", () => {
		expect(humanList([])).to.equal("none");
	});

	it("renders a single-element array without a conjunction", () => {
		expect(humanList(["error"])).to.equal("error");
	});

	it("renders a two-element array with 'and'", () => {
		expect(humanList(["info", "error"])).to.equal("info and error");
	});

	it("renders a three-or-more-element array as a comma list plus 'and'", () => {
		expect(humanList(["info", "notice", "warning", "error"])).to.equal(
			"info, notice, warning and error",
		);
	});
});

describe("isSingular", () => {
	it("is true for a one-element array", () => {
		expect(isSingular(["backups"])).to.equal(true);
	});

	it("is false for arrays of any other length", () => {
		expect(isSingular([])).to.equal(false);
		expect(isSingular(["backups", "archive"])).to.equal(false);
	});
});
