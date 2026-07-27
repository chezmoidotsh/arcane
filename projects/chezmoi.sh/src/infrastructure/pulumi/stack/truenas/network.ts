import * as truenas from "@pulumi/truenas";

export interface NetworkInterfaceSpec {
	name: string;
	mtu: number;
	aliases: { address: string; netmask: number }[];
}

// --- Network ---------------------------------------------------------------
// `pulumi preview` reports a perpetual, harmless `~ (update)` on the `hosts`
// list attribute (Terraform-bridge plan-modifier quirk, not a real drift).

const networkConfig = {
	hostname: "nas.chezmoi.sh",
	gateway: "10.0.0.1",
	nameservers: ["10.0.0.1", "9.9.9.9"],
};

new truenas.NetworkConfig("network-config", {
	hostname: networkConfig.hostname,
	ipv4gateway: networkConfig.gateway,
	nameserver1: networkConfig.nameservers[0],
	nameserver2: networkConfig.nameservers[1],
	hosts: ["127.0.0.1 ix-truenas ix-truenas.local"],
});

// --- Network interfaces ------------------------------------------------
// `type: "PHYSICAL"` adopts the existing hardware NIC by name rather than
// creating one. `rollback` defaults to true (TrueNAS auto-reverts any change
// not checked in within 60s) -- safety net for the NAS's management
// interfaces. Same `~ (update)` bridge quirk as `network-config` above,
// tied to the `aliases` attribute.

const networkInterfaces: NetworkInterfaceSpec[] = [
	{
		name: "ens18",
		mtu: 1500,
		aliases: [
			{ address: "10.0.0.30", netmask: 22 },
			{ address: "10.0.0.31", netmask: 22 },
		],
	},
	{
		name: "ens27",
		mtu: 1500,
		aliases: [{ address: "172.31.255.253", netmask: 30 }],
	},
	// talosnet (Proxmox SDN VNet shared by all Talos/Omni clusters) -- gives
	// Garage/nginx a static IP directly on that subnet so talosnet pods can
	// reach them without traversing the SDN's SNAT path, which drops
	// forwarded (non-locally-destined) return traffic due to an asymmetric
	// conntrack-zone assignment on pve-01 (see the DR drill session that
	// diagnosed this). Backing NIC (net1 on VM 2022100, bridge=talosnet) was
	// added directly on pve-01, matching how `ens18`/net0 was provisioned --
	// the VM's virtual NICs aren't Pulumi-managed, only the TrueNAS-side
	// interface config here is. Confirmed via the TrueNAS API
	// (GET /api/v2.0/interface) that the new NIC surfaced as `ens19`.
	{
		name: "ens19",
		mtu: 1500,
		aliases: [{ address: "10.128.0.6", netmask: 24 }],
	},
];

for (const iface of networkInterfaces) {
	new truenas.NetworkInterface(`network-interface-${iface.name}`, {
		name: iface.name,
		type: "PHYSICAL",
		mtu: iface.mtu,
		ipv4Dhcp: false,
		ipv6Auto: false,
		aliases: iface.aliases,
	});
}
