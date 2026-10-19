import { expect } from "chai";
import { describe, it } from "mocha";

import {
	countryBlockRuleArgs,
	HIGH_RISK_COUNTRIES,
	withHealthcheck,
} from "./pangolin";

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

describe("withHealthcheck.http", () => {
	const args = { resourceId: 1, siteId: 2, ip: "app.ns.svc", port: 8080 };

	it("keeps the target arguments and probes its own ip and port", () => {
		const out = withHealthcheck.http(args, { path: "/healthz" });
		expect(out).to.include(args);
		expect(out).to.include({
			hcEnabled: true,
			hcMode: "http",
			hcHostname: "app.ns.svc",
			hcPort: 8080,
			hcPath: "/healthz",
			hcStatus: 200,
		});
	});

	it("lets any probe setting be overridden", () => {
		const out = withHealthcheck.http(args, {
			path: "/ping",
			status: 204,
			port: 9000,
			timeout: 2,
		});
		expect(out).to.include({ hcStatus: 204, hcPort: 9000, hcTimeout: 2 });
	});
});
