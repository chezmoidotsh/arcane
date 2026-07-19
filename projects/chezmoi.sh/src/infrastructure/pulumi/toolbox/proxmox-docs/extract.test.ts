import { expect } from "chai";
import { describe, it } from "mocha";

import {
	extractAcls,
	extractAcmeAccounts,
	extractAcmeCertificates,
	extractAcmeDnsPlugins,
	extractPoolMemberships,
	extractPools,
	extractRoles,
	extractSdnSubnets,
	extractSdnVnets,
	extractSdnZones,
	extractSecurityGroups,
	extractStoragePbs,
	extractTokens,
	extractUsers,
	logicalName,
	resourcesOfType,
	text,
} from "./extract";
import { resources } from "./fixture";

describe("logicalName", () => {
	it("returns the last URN segment", () => {
		expect(logicalName("urn:a::b::type::my-name")).to.equal("my-name");
	});
});

describe("resourcesOfType", () => {
	it("filters by exact type token", () => {
		expect(
			resourcesOfType(resources, "proxmox:index/acl:Acl"),
		).to.have.lengthOf(2);
	});
});

describe("text", () => {
	it("treats the provider's empty strings as absent", () => {
		expect(text("")).to.equal(undefined);
		expect(text("   ")).to.equal(undefined);
	});

	it("passes real values through, trimmed", () => {
		expect(text(" ACCEPT ")).to.equal("ACCEPT");
	});
});

describe("extractRoles", () => {
	it("flags a role whose privileges are all audit-only", () => {
		const roles = extractRoles(resources);
		expect(roles.find((r) => r.roleId === "Exporter")?.auditOnly).to.equal(
			true,
		);
		expect(roles.find((r) => r.roleId === "OmniProvider")?.auditOnly).to.equal(
			false,
		);
	});

	it("sorts privileges so the doc is stable across reruns", () => {
		const exporter = extractRoles(resources).find(
			(r) => r.roleId === "Exporter",
		);
		expect(exporter?.privileges).to.deep.equal([
			"Datastore.Audit",
			"Sys.Audit",
			"VM.Audit",
		]);
	});
});

describe("extractUsers", () => {
	it("extracts the comment that drives the Purpose column", () => {
		const user = extractUsers(resources).find(
			(u) => u.userId === "prometheus@pve",
		);
		expect(user?.comment).to.equal("prometheus-pve-exporter monitoring");
	});

	it("normalises an empty email to undefined", () => {
		const user = extractUsers(resources).find(
			(u) => u.userId === "prometheus@pve",
		);
		expect(user?.email).to.equal(undefined);
	});
});

describe("extractTokens", () => {
	it("builds the user@realm!name form and never reads the secret value", () => {
		const [token] = extractTokens(resources);
		expect(token.tokenId).to.equal("prometheus@pve!exporter");
		expect(token.privilegeSeparation).to.equal(false);
		expect(token).to.not.have.property("value");
	});
});

describe("extractAcls", () => {
	it("marks a root grant as global and extracts the pool from a pool path", () => {
		const acls = extractAcls(resources);
		const root = acls.find((a) => a.path === "/");
		const pool = acls.find((a) => a.path === "/pool/talos");
		expect(root?.global).to.equal(true);
		expect(root?.poolId).to.equal(undefined);
		expect(pool?.global).to.equal(false);
		expect(pool?.poolId).to.equal("talos");
		expect(pool?.grantee).to.equal("omni@pve");
	});
});

describe("extractPools / extractPoolMemberships", () => {
	it("extracts pools and their storage memberships", () => {
		expect(extractPools(resources).map((p) => p.poolId)).to.deep.equal([
			"core",
			"talos",
		]);
		const [membership] = extractPoolMemberships(resources);
		expect(membership.poolId).to.equal("talos");
		expect(membership.storageId).to.equal("local");
	});
});

describe("SDN extractors", () => {
	it("labels a zone by its backend kind", () => {
		const [zone] = extractSdnZones(resources);
		expect(zone.zoneId).to.equal("pvenet");
		expect(zone.kind).to.equal("simple");
	});

	it("keeps the zone/vnet join keys", () => {
		expect(extractSdnVnets(resources)[0].zone).to.equal("pvenet");
		expect(extractSdnSubnets(resources)[0].vnet).to.equal("talosnet");
	});

	it("normalises a single dhcpRange object into an array", () => {
		const [subnet] = extractSdnSubnets(resources);
		expect(subnet.dhcpRanges).to.have.lengthOf(1);
		expect(subnet.dhcpRanges[0].startAddress).to.equal("10.128.0.10");
	});
});

describe("extractStoragePbs", () => {
	it("renders keep-all retention in words and never reads the secrets", () => {
		const [storage] = extractStoragePbs(resources);
		expect(storage.retention).to.equal("none — keep-all");
		expect(storage).to.not.have.property("password");
		expect(storage).to.not.have.property("encryptionKey");
	});

	it("summarises explicit keep tiers when set", () => {
		const [storage] = extractStoragePbs([
			{
				urn: "urn:x::y::proxmox:index/storagePbs:StoragePbs::s",
				type: "proxmox:index/storagePbs:StoragePbs",
				outputs: {
					storagePbsId: "s",
					backups: { keepDaily: 4, keepWeekly: 2 },
				},
			},
		]);
		expect(storage.retention).to.equal("keep-daily=4, keep-weekly=2");
	});
});

describe("ACME extractors", () => {
	it("labels a well-known directory and flags staging", () => {
		const [account] = extractAcmeAccounts(resources);
		expect(account.directoryLabel).to.equal("Let's Encrypt production");
		expect(account.staging).to.equal(false);
	});

	it("never reads the DNS plugin's credential map", () => {
		const [plugin] = extractAcmeDnsPlugins(resources);
		expect(plugin.plugin).to.equal("cloudflare");
		expect(plugin.api).to.equal("cf");
		expect(plugin).to.not.have.property("data");
	});

	it("collects the plugins a certificate validates through", () => {
		const [cert] = extractAcmeCertificates(resources);
		expect(cert.primaryDomain).to.equal("pve-01.example.test");
		expect(cert.plugins).to.deep.equal(["cloudflare"]);
	});
});

describe("extractSecurityGroups", () => {
	it("falls back to the action when the macro field is an empty string", () => {
		const [group] = extractSecurityGroups(resources);
		expect(group.rules[0].action).to.equal("ACCEPT");
	});

	it("preserves rule order, which is evaluation order", () => {
		const [group] = extractSecurityGroups(resources);
		expect(group.rules.map((r) => r.comment)).to.deep.equal([
			"Allow ICMP",
			"Talos apid",
		]);
	});

	it("leaves a missing destination port absent, rather than pre-rendering a dash", () => {
		const [group] = extractSecurityGroups(resources);
		expect(group.rules[0].port).to.equal(undefined);
		expect(group.rules[1].port).to.equal("50000");
	});
});
