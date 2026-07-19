import type { ExportedResource } from "./stack-export";

/**
 * A hand-trimmed fixture shaped like a real `pulumi stack export` -- type
 * tokens and output field names copied verbatim from
 * `catalog/pulumi/sdks/proxmox/*.ts`, including the provider's habit of
 * emitting empty strings rather than omitting unset fields.
 *
 * Shared by `extract.test.ts`, `derive.test.ts` and `render.test.ts` so all
 * three exercise the same data, and none of them touches the network or
 * `child_process`.
 */
const STACK =
	"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::pulumi:pulumi:Stack::chezmoi-sh-infra-chezmoi_sh.live";

/** The Cloudflare token an `AcmeDnsPlugin`'s `data` map carries in plaintext. Must never reach rendered output. */
export const SECRET_DNS_TOKEN = "cf-token-should-never-appear-in-doc";

export const resources: ExportedResource[] = [
	{
		urn: "urn:x::y::proxmox:index/virtualEnvironmentRole:VirtualEnvironmentRole::pve-role-exporter",
		type: "proxmox:index/virtualEnvironmentRole:VirtualEnvironmentRole",
		parent: STACK,
		outputs: {
			roleId: "Exporter",
			privileges: ["Sys.Audit", "VM.Audit", "Datastore.Audit"],
		},
	},
	{
		urn: "urn:x::y::proxmox:index/virtualEnvironmentRole:VirtualEnvironmentRole::pve-role-omni",
		type: "proxmox:index/virtualEnvironmentRole:VirtualEnvironmentRole",
		parent: STACK,
		outputs: {
			roleId: "OmniProvider",
			privileges: ["VM.Allocate", "VM.Audit", "VM.Clone"],
		},
	},
	{
		urn: "urn:x::y::proxmox:index/virtualEnvironmentUser:VirtualEnvironmentUser::pve-user-prometheus",
		type: "proxmox:index/virtualEnvironmentUser:VirtualEnvironmentUser",
		parent: STACK,
		outputs: {
			userId: "prometheus@pve",
			comment: "prometheus-pve-exporter monitoring",
			email: "",
			enabled: true,
		},
	},
	{
		urn: "urn:x::y::proxmox:index/virtualEnvironmentUser:VirtualEnvironmentUser::pve-user-omni",
		type: "proxmox:index/virtualEnvironmentUser:VirtualEnvironmentUser",
		parent: STACK,
		outputs: {
			userId: "omni@pve",
			comment: "Omni infra provider",
			enabled: true,
		},
	},
	{
		urn: "urn:x::y::proxmox:index/userToken:UserToken::pve-token-prometheus",
		type: "proxmox:index/userToken:UserToken",
		parent: STACK,
		outputs: {
			userId: "prometheus@pve",
			tokenName: "exporter",
			comment: "pve-exporter scrape token",
			privilegesSeparation: false,
			// A real export carries `value` as ciphertext; never read.
			value: {
				"4dabf18193072939515e22adb298388d": "1b47061264138c4ac30d75fd1eb44270",
			},
		},
	},
	{
		urn: "urn:x::y::proxmox:index/acl:Acl::pve-acl-prometheus",
		type: "proxmox:index/acl:Acl",
		parent: STACK,
		outputs: {
			path: "/",
			userId: "prometheus@pve",
			roleId: "Exporter",
			propagate: true,
		},
	},
	{
		urn: "urn:x::y::proxmox:index/acl:Acl::pve-acl-omni-pool",
		type: "proxmox:index/acl:Acl",
		parent: STACK,
		outputs: {
			path: "/pool/talos",
			userId: "omni@pve",
			roleId: "OmniProvider",
			propagate: true,
		},
	},
	{
		urn: "urn:x::y::proxmox:index/virtualEnvironmentPool:VirtualEnvironmentPool::pve-pool-talos",
		type: "proxmox:index/virtualEnvironmentPool:VirtualEnvironmentPool",
		parent: STACK,
		outputs: { poolId: "talos", comment: "Omni-managed Talos VMs" },
	},
	{
		urn: "urn:x::y::proxmox:index/virtualEnvironmentPool:VirtualEnvironmentPool::pve-pool-core",
		type: "proxmox:index/virtualEnvironmentPool:VirtualEnvironmentPool",
		parent: STACK,
		outputs: { poolId: "core", comment: "Critical platform LXCs" },
	},
	{
		urn: "urn:x::y::proxmox:index/poolMembership:PoolMembership::pve-pool-talos-storage-local",
		type: "proxmox:index/poolMembership:PoolMembership",
		parent: STACK,
		outputs: { poolId: "talos", storageId: "local" },
	},
	{
		urn: "urn:x::y::proxmox:index/sdnZoneSimple:SdnZoneSimple::pve-sdn-zone-pvenet",
		type: "proxmox:index/sdnZoneSimple:SdnZoneSimple",
		parent: STACK,
		outputs: { sdnZoneSimpleId: "pvenet", ipam: "pve", dhcp: "dnsmasq" },
	},
	{
		urn: "urn:x::y::proxmox:index/sdnVnet:SdnVnet::pve-sdn-vnet-talosnet",
		type: "proxmox:index/sdnVnet:SdnVnet",
		parent: STACK,
		outputs: {
			sdnVnetId: "talosnet",
			zone: "pvenet",
			alias: "Shared Talos node traffic",
		},
	},
	{
		urn: "urn:x::y::proxmox:index/sdnSubnet:SdnSubnet::pve-sdn-subnet-talosnet",
		type: "proxmox:index/sdnSubnet:SdnSubnet",
		parent: STACK,
		outputs: {
			vnet: "talosnet",
			cidr: "10.128.0.0/24",
			gateway: "10.128.0.1",
			snat: true,
			dhcpRange: {
				startAddress: "10.128.0.10",
				endAddress: "10.128.0.250",
			},
		},
	},
	{
		urn: "urn:x::y::proxmox:index/storagePbs:StoragePbs::pve-storage-pbs",
		type: "proxmox:index/storagePbs:StoragePbs",
		parent: STACK,
		outputs: {
			storagePbsId: "pbs.example",
			server: "pbs.example",
			datastore: "Backblaze-B2",
			username: "pve-backup@pbs!pve-storage",
			contents: ["backup"],
			backups: { keepAll: true },
			namespace: "",
			// Secret outputs; never read.
			password: { "4dabf18193072939515e22adb298388d": "ciphertext" },
			encryptionKey: { "4dabf18193072939515e22adb298388d": "ciphertext" },
		},
	},
	{
		urn: "urn:x::y::proxmox:index/acmeAccount:AcmeAccount::pve-acme-account-default",
		type: "proxmox:index/acmeAccount:AcmeAccount",
		parent: STACK,
		outputs: {
			name: "default",
			contact: "someone@example.test",
			directory: "https://acme-v02.api.letsencrypt.org/directory",
			tos: "https://example.test/tos",
		},
	},
	{
		urn: "urn:x::y::proxmox:index/acmeDnsPlugin:AcmeDnsPlugin::pve-acme-dns-plugin-cloudflare",
		type: "proxmox:index/acmeDnsPlugin:AcmeDnsPlugin",
		parent: STACK,
		outputs: {
			plugin: "cloudflare",
			api: "cf",
			// Plaintext in a real export -- the provider does not mark it secret.
			data: { CF_Account_ID: "acct", CF_Token: SECRET_DNS_TOKEN },
			digest: "abc123",
		},
	},
	{
		urn: "urn:x::y::proxmox:index/acmeCertificate:AcmeCertificate::pve-acme-certificate",
		type: "proxmox:index/acmeCertificate:AcmeCertificate",
		parent: STACK,
		outputs: {
			nodeName: "pve-01",
			account: "default",
			domains: [{ domain: "pve-01.example.test", plugin: "cloudflare" }],
		},
	},
	{
		urn: "urn:x::y::proxmox:index/virtualEnvironmentClusterFirewallSecurityGroup:VirtualEnvironmentClusterFirewallSecurityGroup::pve-sg-talos",
		type: "proxmox:index/virtualEnvironmentClusterFirewallSecurityGroup:VirtualEnvironmentClusterFirewallSecurityGroup",
		parent: STACK,
		outputs: {
			name: "talos",
			comment: "Baseline firewall policy for Talos VMs",
			rules: [
				{
					action: "ACCEPT",
					comment: "Allow ICMP",
					proto: "icmp",
					source: "+rfc1918",
					type: "in",
					// The provider emits "" rather than omitting unset fields.
					dport: "",
					macro: "",
					iface: "",
					enabled: true,
				},
				{
					action: "ACCEPT",
					comment: "Talos apid",
					proto: "tcp",
					dport: "50000",
					source: "+rfc1918",
					type: "in",
					macro: "",
					enabled: true,
				},
			],
		},
	},
];
