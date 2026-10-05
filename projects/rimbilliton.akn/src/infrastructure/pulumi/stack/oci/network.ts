import * as oci from "@pulumi/oci";
import * as pulumi from "@pulumi/pulumi";

import { rimbilliton } from "./compartments";

const config = new pulumi.Config();

// Opt-in SSH (tcp/22), closed by default: administration goes through
// Tailscale (see ../tailscale.ts). Flip with `pulumi config set unsecure true`
// for a break-glass session.
const unsecure = config.getBoolean("unsecure") ?? false;

// Dedicated dual-stack VCN, distinct from kazimierz-akn-vcn (172.16.0.0/26).
export const VCN_CIDR = "172.16.1.0/26";
export const SUBNET_CIDR = "172.16.1.0/28";

export const vcn = new oci.core.Vcn("rimbilliton-akn-vcn", {
	compartmentId: rimbilliton.id,
	cidrBlocks: [VCN_CIDR],
	displayName: "rimbilliton-akn-vcn",
	dnsLabel: "rimbillitonvcn",
	isIpv6enabled: true,
	isOracleGuaAllocationEnabled: true,
});

export const internetGateway = new oci.core.InternetGateway(
	"rimbilliton-akn-igw",
	{ compartmentId: rimbilliton.id, vcnId: vcn.id, enabled: true },
);

export const routeTable = new oci.core.RouteTable("rimbilliton-akn-rt", {
	compartmentId: rimbilliton.id,
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
export const defaultSecurityList = new oci.core.SecurityList(
	"rimbilliton-akn-default-sl",
	{
		compartmentId: rimbilliton.id,
		vcnId: vcn.id,
		displayName: "rimbilliton-akn-default-sl",
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

export const subnet = new oci.core.Subnet("rimbilliton-akn-subnet", {
	compartmentId: rimbilliton.id,
	vcnId: vcn.id,
	cidrBlock: SUBNET_CIDR,
	routeTableId: routeTable.id,
	securityListIds: [defaultSecurityList.id],
	displayName: "rimbilliton-akn-subnet",
});

export const nsg = new oci.core.NetworkSecurityGroup("rimbilliton-akn-nsg", {
	compartmentId: rimbilliton.id,
	vcnId: vcn.id,
	displayName: "rimbilliton-akn-nsg",
	freeformTags: { project: "rimbilliton.akn", managed_by: "pulumi" },
});

// Ingress, dual-stack:
//  - 25565-25580/tcp: pool of 16 game ports, allocated to Pelican's servers
//  - 80/443 tcp: Caddy (ACME, Pelican panel and Wings)
//  - 22/tcp: only when `unsecure`
// Keep the game range in sync with `allowedTCPPortRanges` in nixos/configuration.nix.
const ingressRules = [
	{ name: "minecraft", protocol: "6", min: 25565, max: 25580 },
	{ name: "http", protocol: "6", min: 80, max: 80 },
	{ name: "https", protocol: "6", min: 443, max: 443 },
	{ name: "ssh", protocol: "6", min: 22, max: 22 },
] as const;

for (const { name, protocol, min, max } of ingressRules.filter(
	(rule) => unsecure || rule.name !== "ssh",
)) {
	for (const [suffix, source] of [
		["ipv4", "0.0.0.0/0"],
		["ipv6", "::/0"],
	] as const) {
		new oci.core.NetworkSecurityGroupSecurityRule(
			`rimbilliton-akn-nsg-ingress-${name}-${suffix}`,
			{
				networkSecurityGroupId: nsg.id,
				direction: "INGRESS",
				protocol,
				source,
				sourceType: "CIDR_BLOCK",
				tcpOptions: { destinationPortRange: { min, max } },
			},
		);
	}
}

// Egress: all outbound TCP/UDP, dual-stack (Tailscale needs UDP).
for (const [name, protocol] of [
	["tcp", "6"],
	["udp", "17"],
] as const) {
	for (const [suffix, destination] of [
		["ipv4", "0.0.0.0/0"],
		["ipv6", "::/0"],
	] as const) {
		new oci.core.NetworkSecurityGroupSecurityRule(
			`rimbilliton-akn-nsg-egress-${name}-${suffix}`,
			{
				networkSecurityGroupId: nsg.id,
				direction: "EGRESS",
				protocol,
				destination,
				destinationType: "CIDR_BLOCK",
			},
		);
	}
}
