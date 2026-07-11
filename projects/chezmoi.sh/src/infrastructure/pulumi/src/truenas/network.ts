import * as truenas from "@pulumi/truenas";

// --- Network ---------------------------------------------------------------
// `pulumi preview` reports a perpetual, harmless `~ (update)` on the `hosts`
// list attribute (Terraform-bridge plan-modifier quirk, not a real drift).

new truenas.NetworkConfig("network-config", {
	hostname: "nas.chezmoi.sh",
	ipv4gateway: "10.0.0.1",
	nameserver1: "10.0.0.1",
	nameserver2: "9.9.9.9",
	hosts: ["127.0.0.1 ix-truenas ix-truenas.local"],
});

// --- Network interfaces ------------------------------------------------
// `type: "PHYSICAL"` adopts the existing hardware NIC by name rather than
// creating one. `rollback` defaults to true (TrueNAS auto-reverts any change
// not checked in within 60s) -- safety net for the NAS's management
// interfaces. Same `~ (update)` bridge quirk as `network-config` above,
// tied to the `aliases` attribute.

new truenas.NetworkInterface("network-interface-ens18", {
	name: "ens18",
	type: "PHYSICAL",
	mtu: 1500,
	ipv4Dhcp: false,
	ipv6Auto: false,
	aliases: [
		{ address: "10.0.0.30", netmask: 22 },
		{ address: "10.0.0.31", netmask: 22 },
	],
});

new truenas.NetworkInterface("network-interface-ens27", {
	name: "ens27",
	type: "PHYSICAL",
	mtu: 1500,
	ipv4Dhcp: false,
	ipv6Auto: false,
	aliases: [{ address: "172.31.255.253", netmask: 30 }],
});
