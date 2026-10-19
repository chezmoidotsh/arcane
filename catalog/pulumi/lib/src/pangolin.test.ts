import { expect } from "chai";
import { describe, it } from "mocha";

import {
	ALLOWED_COUNTRIES,
	DENIED_ASNS,
	edgeAccess,
	HIGH_RISK_COUNTRIES,
	withHealthcheck,
} from "./pangolin";

describe("edgeAccess.ruleArgs", () => {
	const { denyCountries, denyAsns, allowCountries } = edgeAccess.ruleArgs(42);
	const all = [...denyCountries, ...denyAsns, ...allowCountries];

	it("emits one rule per list entry, on the given resource", () => {
		expect(denyCountries).to.have.lengthOf(HIGH_RISK_COUNTRIES.length);
		expect(denyAsns).to.have.lengthOf(DENIED_ASNS.length);
		expect(allowCountries).to.have.lengthOf(ALLOWED_COUNTRIES.length);
		for (const { args } of all) expect(args.resourceId).to.equal(42);
	});

	it("drops denied countries and ASNs, accepts allowed countries", () => {
		for (const { args } of denyCountries) {
			expect(args).to.include({ action: "DROP", match: "COUNTRY" });
		}
		for (const { args } of denyAsns) {
			expect(args).to.include({ action: "DROP", match: "ASN" });
			expect(args.value).to.match(/^AS\d+$/);
		}
		for (const { args } of allowCountries) {
			expect(args).to.include({ action: "ACCEPT", match: "COUNTRY" });
		}
	});

	it("checks denied countries first, then ASNs, then the allow-list", () => {
		const prios = (rules: typeof all) => rules.map((r) => r.args.priority as number);
		expect(Math.max(...prios(denyCountries))).to.be.lessThan(
			Math.min(...prios(denyAsns)),
		);
		expect(Math.max(...prios(denyAsns))).to.be.lessThan(
			Math.min(...prios(allowCountries)),
		);
		// the catch-all DROP sits at priority 500
		expect(Math.max(...prios(allowCountries))).to.be.lessThan(500);
	});

	it("gives every rule a unique name and priority", () => {
		expect(new Set(all.map((r) => r.name)).size).to.equal(all.length);
		expect(new Set(all.map((r) => r.args.priority)).size).to.equal(all.length);
	});

	it("never lists an ASN twice, nor a country in both lists", () => {
		const asns = DENIED_ASNS.map(([asn]) => asn);
		expect(new Set(asns).size).to.equal(asns.length);
		for (const code of HIGH_RISK_COUNTRIES) {
			expect(ALLOWED_COUNTRIES).to.not.include(code);
		}
	});

	it("allows Japan and Europe only", () => {
		expect(ALLOWED_COUNTRIES).to.include.members(["JP", "FR", "DE", "GB", "CH"]);
		expect(ALLOWED_COUNTRIES).to.not.include.members(["US", "CN", "RU", "IN"]);
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
