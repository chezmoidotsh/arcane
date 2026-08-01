import * as oci from "@pulumi/oci";
import * as pulumi from "@pulumi/pulumi";

import { kazimierz } from "./compartments";

const config = new pulumi.Config();

// Opt-in: SSH (tcp/22) ingress is only created when explicitly enabled.
// Defaults to closed -- flip with `pulumi config set unsecure true`.
const unsecure = config.getBoolean("unsecure") ?? false;

// Dual-stack VCN/subnet/NSG for kazimierz.akn, ported from the abandoned
// Crossplane implementation (issue 1010/1076 -- see
// projects/kazimierz.akn/src/infrastructure/crossplane on branch
// i1076-crossplane-oci-publicinstance for the original manifests). CIDR
// ranges are kept identical.
export const vcn = new oci.core.Vcn("kazimierz-akn-vcn", {
	compartmentId: kazimierz.id,
	cidrBlocks: ["172.16.0.0/26"],
	displayName: "kazimierz-akn-vcn",
	dnsLabel: "kazimierzaknvcn",
	isIpv6enabled: true,
	isOracleGuaAllocationEnabled: true,
});

export const internetGateway = new oci.core.InternetGateway(
	"kazimierz-akn-igw",
	{
		compartmentId: kazimierz.id,
		vcnId: vcn.id,
		enabled: true,
	},
);

export const routeTable = new oci.core.RouteTable("kazimierz-akn-rt", {
	compartmentId: kazimierz.id,
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

// No securityListIds: the subnet uses the VCN's default (empty, unmanaged)
// SecurityList by convention. All traffic control goes through the NSG
// below, which is attached at the VNIC level instead of the subnet level --
// that decouples network topology from application-level security rules.
export const subnet = new oci.core.Subnet("kazimierz-akn-subnet", {
	compartmentId: kazimierz.id,
	vcnId: vcn.id,
	cidrBlock: "172.16.0.0/28",
	routeTableId: routeTable.id,
});

export const nsg = new oci.core.NetworkSecurityGroup("kazimierz-akn-nsg", {
	compartmentId: kazimierz.id,
	vcnId: vcn.id,
	displayName: "kazimierz-akn-nsg",
	freeformTags: { project: "kazimierz.akn", managed_by: "pulumi" },
});

// Ingress: SSH (pubkey-only, only when `unsecure` is on), HTTP/HTTPS
// (Traefik), and the two WireGuard (Newt) ports -- dual-stack. NSG rules are
// always stateful (OCI doesn't allow stateless rules in NSGs, unlike
// SecurityLists).
const allIngressRules = [
	{ name: "ssh", protocol: "6", port: 22 },
	{ name: "http", protocol: "6", port: 80 },
	{ name: "https", protocol: "6", port: 443 },
	{ name: "newt-site", protocol: "17", port: 51820 },
	{ name: "newt-client", protocol: "17", port: 21820 },
] as const;

const unsecure_mode = (rule: { name: string }) =>
	unsecure || rule.name !== "ssh";
for (const { name, protocol, port } of allIngressRules.filter(unsecure_mode)) {
	const portRange = { destinationPortRange: { min: port, max: port } };
	for (const [suffix, source] of [
		["ipv4", "0.0.0.0/0"],
		["ipv6", "::/0"],
	] as const) {
		new oci.core.NetworkSecurityGroupSecurityRule(
			`kazimierz-akn-nsg-ingress-${name}-${suffix}`,
			{
				networkSecurityGroupId: nsg.id,
				direction: "INGRESS",
				protocol,
				source,
				sourceType: "CIDR_BLOCK",
				tcpOptions: protocol === "6" ? portRange : undefined,
				udpOptions: protocol === "17" ? portRange : undefined,
			},
		);
	}
}

// Egress: all outbound TCP/UDP, dual-stack.
const egressProtocols = [
	{ name: "tcp", protocol: "6" },
	{ name: "udp", protocol: "17" },
] as const;

for (const { name, protocol } of egressProtocols) {
	for (const [suffix, destination] of [
		["ipv4", "0.0.0.0/0"],
		["ipv6", "::/0"],
	] as const) {
		new oci.core.NetworkSecurityGroupSecurityRule(
			`kazimierz-akn-nsg-egress-${name}-${suffix}`,
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
