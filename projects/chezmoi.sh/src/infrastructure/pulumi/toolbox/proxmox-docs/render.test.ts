import { expect } from "chai";
import { describe, it } from "mocha";

import { resources, SECRET_DNS_TOKEN } from "./fixture";
import { buildContext } from "./index";
import { render } from "./render";

const context = buildContext(resources, "https://pve-01.example.test:8006");
const md = render(context);

describe("PROXMOX-VE.md template", () => {
	it("renders every top-level section", () => {
		expect(md).to.include("# Proxmox VE (pve-01.pve.chezmoi.sh)");
		expect(md).to.include("## Quick reference");
		expect(md).to.include("## The host");
		expect(md).to.include("## Identities & access");
		expect(md).to.include("### Resource pools");
		expect(md).to.include("## Network (SDN)");
		expect(md).to.include("## Backup storage");
		expect(md).to.include("## Certificates");
		expect(md).to.include("## Firewall");
		expect(md).to.include("## What this stack does not manage");
		expect(md).to.include("## Procedures");
		expect(md).to.include("## Appendix");
	});

	it("never leaks the DNS plugin's credential, which state holds in plaintext", () => {
		expect(md).to.not.include(SECRET_DNS_TOKEN);
		expect(md).to.not.include("CF_Token");
	});

	it("never leaks a token secret or storage password", () => {
		expect(md).to.not.include("ciphertext");
		expect(md).to.not.include("4dabf18193072939515e22adb298388d");
	});
});

describe("derived prose", () => {
	it("counts identities in words rather than digits", () => {
		expect(md).to.include("Two service accounts");
	});

	it("names the only root-granted identity and says its role is read-only", () => {
		expect(md).to.include(
			"`prometheus@pve` is the only identity granted anything at `/`",
		);
		expect(md).to.include("carries audit privileges exclusively");
	});

	it("separates token-based from password-based identities", () => {
		expect(md).to.include(
			"One identity authenticates with an API token (`prometheus@pve!exporter`)",
		);
		expect(md).to.include("privilege separation disabled");
		expect(md).to.include("`omni@pve` has no token");
	});

	it("renders a subject partial under the heading of the resource it documents", () => {
		// `partials.firewall.talos.hbs` is included inside the securityGroups
		// loop, guarded on the group's name, so its prose lands under
		// `### talos` and not after the section.
		const talosHeading = md.indexOf("### `talos`");
		const prose = md.indexOf("Only the ports every Talos node needs");
		const nextSection = md.indexOf("## What this stack does not manage");
		expect(prose).to.be.greaterThan(talosHeading);
		expect(prose).to.be.lessThan(nextSection);
	});

	it("omits a subject partial when its subject is absent", () => {
		// The guard is what stops prose about one resource leaking onto a
		// sibling: rename the group and its rationale stops rendering rather
		// than attaching to something it was never written about.
		const renamed = render({
			...context,
			securityGroups: context.securityGroups.map((g) => ({
				...g,
				name: "other",
			})),
		});
		expect(renamed).to.include("### `other`");
		expect(renamed).to.not.include("Only the ports every Talos node needs");
	});

	it("calls an ACL-referenced pool an enforcement boundary and warns about it", () => {
		expect(md).to.include("`talos` is referenced by ACL bindings");
		expect(md).to.include("Pool membership _is_ the permission");
	});

	it("says a pool no ACL references keeps its members unreachable", () => {
		expect(md).to.include("`core` is referenced by no grant at all");
	});

	it("omits the pool caution entirely when no pool is a boundary", () => {
		const noBoundary = render({
			...context,
			pools: context.pools.map((p) => ({
				...p,
				isBoundary: false,
				grants: [],
			})),
			boundaryPools: [],
			boundaryPoolIds: [],
		});
		expect(noBoundary).to.not.include("Pool membership _is_ the permission");
	});
});

describe("data-driven tables", () => {
	it("renders the SDN row from joined zone/vnet/subnet state", () => {
		expect(md).to.include(
			"| `pvenet` | `simple` | `talosnet` | `10.128.0.0/24` |",
		);
		expect(md).to.include("10.128.0.10–10.128.0.250");
	});

	it("renders the firewall action, which the provider leaves blank as a macro", () => {
		expect(md).to.include(
			"| `ACCEPT` | `icmp` | — | `+rfc1918` | Allow ICMP |",
		);
	});

	it("renders retention in words", () => {
		expect(md).to.include("none — keep-all");
	});

	it("renders the certificate's account directory without HTML-escaping it", () => {
		expect(md).to.include("Let's Encrypt production");
		expect(md).to.not.include("&#x27;");
	});
});
