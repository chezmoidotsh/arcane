import { expect } from "chai";
import { describe, it } from "mocha";

import { countryBlockRuleArgs, HIGH_RISK_COUNTRIES } from "./pangolin";

describe("countryBlockRuleArgs", () => {
	it("emits one rule per high-risk country", () => {
		expect(countryBlockRuleArgs(42)).to.have.lengthOf(
			HIGH_RISK_COUNTRIES.length,
		);
	});

	it("passes the resourceId through unchanged", () => {
		for (const { args } of countryBlockRuleArgs(42)) {
			expect(args.resourceId).to.equal(42);
			expect(args.action).to.equal("DROP");
			expect(args.match).to.equal("COUNTRY");
		}
	});

	it("gives every rule a unique name and priority", () => {
		const rules = countryBlockRuleArgs(42);
		expect(new Set(rules.map((r) => r.name)).size).to.equal(rules.length);
		expect(new Set(rules.map((r) => r.args.priority)).size).to.equal(
			rules.length,
		);
	});
});
