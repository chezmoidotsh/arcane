import * as oci from "@pulumi/oci";

import { unsecure } from "../config";
import { ociCompartment } from "./oci-compartment";

// Dedicated dual-stack VCN (kazimierz-akn-vcn uses 172.16.0.0/26).
const VCN_CIDR = "172.16.1.0/26";
const SUBNET_CIDR = "172.16.1.0/28";

// `dnsLabel` keeps the host's former name ("rimbilliton"): it is NOT updatable, so changing it
// REPLACES the VCN, and with it the subnet, the NSG and the instance's VNIC, i.e. the
// machine holding the Minecraft worlds would lose its network (new public IP, DNS to redo,
// possible instance replacement). Do not touch it before the migration planned in #1601.
const vcn = new oci.core.Vcn("exusiai-akn-vcn", {
	compartmentId: ociCompartment.id,
	cidrBlocks: [VCN_CIDR],
	displayName: "exusiai-akn-vcn",
	dnsLabel: "rimbillitonvcn",
	isIpv6enabled: true,
	isOracleGuaAllocationEnabled: true,
});

const internetGateway = new oci.core.InternetGateway(
	"exusiai-akn-igw",
	{ compartmentId: ociCompartment.id, vcnId: vcn.id, enabled: true },
);

const routeTable = new oci.core.RouteTable("exusiai-akn-rt", {
	compartmentId: ociCompartment.id,
	vcnId: vcn.id,
	routeRules: [
		{
			destination: "0.0.0.0/0",
			destinationType: "CIDR_BLOCK",
			networkEntityId: internetGateway.id,
		},
		{
			destination: "::/0",
			destinationType: "CIDR_BLOCK",
			networkEntityId: internetGateway.id,
		},
	],
});

// The VCN's auto-created default SecurityList ships a blanket SSH ingress and
// can't be detached (OCI requires >= 1 list), so replace it with an
// ICMP-only list -- same reasoning as kazimierz-akn-default-sl.
const defaultSecurityList = new oci.core.SecurityList(
	"exusiai-akn-default-sl",
	{
		compartmentId: ociCompartment.id,
		vcnId: vcn.id,
		displayName: "exusiai-akn-default-sl",
		ingressSecurityRules: [
			{
				protocol: "1",
				source: "0.0.0.0/0",
				sourceType: "CIDR_BLOCK",
				icmpOptions: { type: 3, code: 4 },
			},
			{
				protocol: "1",
				source: VCN_CIDR,
				sourceType: "CIDR_BLOCK",
				icmpOptions: { type: 3 },
			},
			{
				protocol: "58",
				source: "::/0",
				sourceType: "CIDR_BLOCK",
				icmpOptions: { type: 2, code: 0 },
			},
		],
	},
);

export const subnet = new oci.core.Subnet("exusiai-akn-subnet", {
	compartmentId: ociCompartment.id,
	vcnId: vcn.id,
	cidrBlock: SUBNET_CIDR,
	routeTableId: routeTable.id,
	securityListIds: [defaultSecurityList.id],
	displayName: "exusiai-akn-subnet",
});

export const nsg = new oci.core.NetworkSecurityGroup("exusiai-akn-nsg", {
	compartmentId: ociCompartment.id,
	vcnId: vcn.id,
	displayName: "exusiai-akn-nsg",
	freeformTags: { project: "exusiai.akn", managed_by: "pulumi" },
});

// NSG rules, dual-stack (one rule per IP family):
//  - 25565-25580/tcp: pool of 16 game ports, allocated to Pelican's servers (keep in sync with
//    `allowedTCPPortRanges` in nix/configuration.nix)
//  - 80/443 tcp: Caddy (ACME, Pelican panel and Wings)
//  - 22/tcp: only when `unsecure`
//  - egress: all outbound TCP/UDP (Tailscale needs UDP)
const rules = [
	{ direction: "INGRESS", name: "minecraft", protocol: "6", ports: { min: 25565, max: 25580 } },
	{ direction: "INGRESS", name: "http", protocol: "6", ports: { min: 80, max: 80 } },
	{ direction: "INGRESS", name: "https", protocol: "6", ports: { min: 443, max: 443 } },
	{ direction: "INGRESS", name: "ssh", protocol: "6", ports: { min: 22, max: 22 } },
	{ direction: "EGRESS", name: "tcp", protocol: "6" },
	{ direction: "EGRESS", name: "udp", protocol: "17" },
] as const;

const families = [
	["ipv4", "0.0.0.0/0"],
	["ipv6", "::/0"],
] as const;

for (const rule of rules.filter((r) => unsecure || r.name !== "ssh")) {
	for (const [family, cidr] of families) {
		const peer =
			rule.direction === "INGRESS"
				? { source: cidr, sourceType: "CIDR_BLOCK" }
				: { destination: cidr, destinationType: "CIDR_BLOCK" };
		new oci.core.NetworkSecurityGroupSecurityRule(
			`exusiai-akn-nsg-${rule.direction.toLowerCase()}-${rule.name}-${family}`,
			{
				networkSecurityGroupId: nsg.id,
				direction: rule.direction,
				protocol: rule.protocol,
				...peer,
				...("ports" in rule ? { tcpOptions: { destinationPortRange: rule.ports } } : {}),
			},
		);
	}
}
