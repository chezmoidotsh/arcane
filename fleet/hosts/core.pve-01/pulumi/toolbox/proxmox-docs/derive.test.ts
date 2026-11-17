import { expect } from "chai";
import { describe, it } from "mocha";

import {
	deriveAccessSummary,
	deriveIdentities,
	derivePools,
	deriveSdn,
} from "./derive";
import {
	extractAcls,
	extractPoolMemberships,
	extractPools,
	extractRoles,
	extractSdnSubnets,
	extractSdnVnets,
	extractSdnZones,
	extractTokens,
	extractUsers,
} from "./extract";
import { resources } from "./fixture";

const identities = deriveIdentities(
	extractUsers(resources),
	extractTokens(resources),
	extractAcls(resources),
);

describe("deriveIdentities", () => {
	it("joins an identity to its tokens and grants", () => {
		const prometheus = identities.find((i) => i.userId === "prometheus@pve");
		expect(prometheus?.tokens.map((t) => t.tokenId)).to.deep.equal([
			"prometheus@pve!exporter",
		]);
		expect(prometheus?.grants.map((g) => g.path)).to.deep.equal(["/"]);
		expect(prometheus?.hasGlobalGrant).to.equal(true);
	});

	it("marks an identity with no token as password-only", () => {
		const omni = identities.find((i) => i.userId === "omni@pve");
		expect(omni?.passwordOnly).to.equal(true);
		expect(omni?.hasGlobalGrant).to.equal(false);
	});
});

describe("deriveAccessSummary", () => {
	const summary = deriveAccessSummary(identities, extractRoles(resources));

	it("separates token-authenticated from password-authenticated identities", () => {
		expect(summary.tokenIdentities.map((i) => i.userId)).to.deep.equal([
			"prometheus@pve",
		]);
		expect(summary.passwordIdentities.map((i) => i.userId)).to.deep.equal([
			"omni@pve",
		]);
	});

	it("detects that every token inherits its user's permissions", () => {
		expect(summary.allTokensInheritUser).to.equal(true);
	});

	it("detects that the only root grant is audit-only", () => {
		expect(summary.globalIdentities.map((i) => i.userId)).to.deep.equal([
			"prometheus@pve",
		]);
		expect(summary.globalGrantsAreReadOnly).to.equal(true);
	});

	it("does not claim read-only when a root grant uses an unknown role", () => {
		const acls = [
			{
				path: "/",
				grantee: "someone@pve",
				roleId: "Administrator",
				propagate: true,
				global: true,
			},
		];
		const risky = deriveIdentities(
			[{ userId: "someone@pve" }],
			[],
			acls as never,
		);
		expect(
			deriveAccessSummary(risky, extractRoles(resources))
				.globalGrantsAreReadOnly,
		).to.equal(false);
	});
});

describe("derivePools", () => {
	const pools = derivePools(
		extractPools(resources),
		extractPoolMemberships(resources),
		extractAcls(resources),
	);

	it("marks a pool referenced by an ACL as an enforcement boundary", () => {
		const talos = pools.find((p) => p.poolId === "talos");
		expect(talos?.isBoundary).to.equal(true);
		expect(talos?.grants).to.have.lengthOf(1);
		expect(talos?.storages).to.deep.equal(["local"]);
	});

	it("leaves a pool no ACL references as a plain label", () => {
		const core = pools.find((p) => p.poolId === "core");
		expect(core?.isBoundary).to.equal(false);
		expect(core?.grants).to.have.lengthOf(0);
	});
});

describe("deriveSdn", () => {
	it("flattens zone/vnet/subnet into one row per subnet", () => {
		const rows = deriveSdn(
			extractSdnZones(resources),
			extractSdnVnets(resources),
			extractSdnSubnets(resources),
		);
		expect(rows).to.have.lengthOf(1);
		expect(rows[0].zoneId).to.equal("pvenet");
		expect(rows[0].vnetId).to.equal("talosnet");
		expect(rows[0].cidr).to.equal("10.128.0.0/24");
		expect(rows[0].dhcp).to.equal("10.128.0.10–10.128.0.250");
	});

	it("scales to several zones without nesting", () => {
		const rows = deriveSdn(
			[
				{ zoneId: "a", kind: "simple" },
				{ zoneId: "b", kind: "vxlan" },
			],
			[
				{ vnetId: "v1", zone: "a" },
				{ vnetId: "v2", zone: "b" },
			],
			[
				{ vnet: "v1", cidr: "10.0.0.0/24", dhcpRanges: [] },
				{ vnet: "v2", cidr: "10.1.0.0/24", dhcpRanges: [] },
				{ vnet: "v2", cidr: "10.2.0.0/24", dhcpRanges: [] },
			],
		);
		expect(rows.map((r) => `${r.zoneId}/${r.vnetId}/${r.cidr}`)).to.deep.equal([
			"a/v1/10.0.0.0/24",
			"b/v2/10.1.0.0/24",
			"b/v2/10.2.0.0/24",
		]);
	});

	it("still shows a zone whose VNet has no subnet, rather than hiding it", () => {
		const rows = deriveSdn(
			[{ zoneId: "a", kind: "simple" }],
			[{ vnetId: "v1", zone: "a" }],
			[],
		);
		expect(rows).to.have.lengthOf(1);
		expect(rows[0].cidr).to.equal("—");
	});
});
