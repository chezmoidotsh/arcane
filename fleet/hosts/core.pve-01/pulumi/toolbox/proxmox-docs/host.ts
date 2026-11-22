// -----------------------------------------------------------------------------
// Facts the Pulumi provider cannot know
// -----------------------------------------------------------------------------
// Everything else in this document comes from `pulumi stack export`. These do
// not: the bridged provider models Proxmox VE's *configuration*, not the
// machine underneath it, and this stack deliberately never queries the node
// API (`/nodes/<name>/status`) -- doing so would make the generator depend on
// the host being reachable, when its whole point is to render deployed state.
//
// The bridges are here for the same reason but a different cause: they are
// host network config, set up at install time and out of this stack's scope.
// They are documented anyway because every SDN object and firewall rule is
// meaningless without knowing which bridge it sits on.
//
// Keep this file small. Anything the provider *does* expose belongs in
// `./extract/`, where it stays true on its own.
// -----------------------------------------------------------------------------

export interface HardwareComponent {
	component: string;
	reference: string;
}

export interface Bridge {
	name: string;
	role: string;
}

export interface HostFacts {
	/** Node name as Proxmox VE knows it -- matches `AcmeCertificate.nodeName` and the `/nodes/<name>` ACL paths. */
	nodeName: string;
	fqdn: string;
	hardware: HardwareComponent[];
	bridges: Bridge[];
}

export const host: HostFacts = {
	nodeName: "pve-01",
	fqdn: "pve-01.pve.chezmoi.sh",
	hardware: [
		{ component: "Chassis", reference: "SilverStone RM400 · 4U rackmount" },
		{
			component: "Board",
			reference: "Supermicro X10SLR-F · IPMI 2.0 on a dedicated port",
		},
		{ component: "CPU", reference: "16 cores / 32 threads" },
		{ component: "Memory", reference: "128 GiB DDR4 ECC" },
		{
			component: "Storage",
			reference: "2 × NVMe — one for the hypervisor, one for guest disks",
		},
		{
			component: "Network",
			reference: "1 × IPMI · 2 × 1GbE (onboard) · 1 × 10GbE",
		},
	],
	bridges: [
		{
			name: "vmbr0",
			role: "Management only — VLAN 5 access port, carries the host's own address",
		},
		{
			name: "vmbr1",
			role: "Guest trunk — VLAN-aware, carries every VM/LXC port on its own tag",
		},
	],
};
