import * as proxmox from "@pulumi/proxmox";
import * as pulumi from "@pulumi/pulumi";

import { omniUser } from "./access";

// -----------------------------------------------------------------------------
// pvenet / talosnet -- shared node-traffic network for all Talos/Omni
// clusters (lungmen.akn, rhodes.akn, the sandbox, and any future cluster)
// -----------------------------------------------------------------------------
// See docs/procedures/infrastructure/INF-20260627-00.proxmox-sdn-setup.md for
// the full design rationale (dual-NIC ADR-014, why a single shared VNet
// instead of one per cluster, and why `simple` instead of `vxlan` on this
// single-node cluster). This declares the same zone/VNet/subnet that
// procedure provisioned by hand -- codifying it here replaces that manual
// `pvesh create`/`pveum acl modify` recipe for future cluster recreations.
export const pvenetZone = new proxmox.SdnZoneSimple(
	"pve-sdn-zone-pvenet",
	{
		sdnZoneSimpleId: "pvenet",
		ipam: "pve",
		dhcp: "dnsmasq",
	},
	{ protect: true },
);

export const talosnetVnet = new proxmox.SdnVnet(
	"pve-sdn-vnet-talosnet",
	{
		sdnVnetId: "talosnet",
		zone: pvenetZone.sdnZoneSimpleId,
		alias: "Shared Talos node traffic (eth1) for all clusters",
	},
	{ protect: true },
);

// `snat: true` is what lets a Talos node (no VLAN 5 IP) reach the Proxmox API
// at `pve-01:8006`, which `proxmox-csi-plugin` requires to attach/detach
// volumes -- do not unset it, see the setup procedure's "Do not skip
// `snat 1`" callout.
export const talosnetSubnet = new proxmox.SdnSubnet(
	"pve-sdn-subnet-talosnet",
	{
		vnet: talosnetVnet.sdnVnetId,
		cidr: "10.128.0.0/24",
		gateway: "10.128.0.1",
		snat: true,
		dhcpRange: {
			startAddress: "10.128.0.10",
			endAddress: "10.128.0.250",
		},
	},
	{ protect: true },
);

// omni@pve's SDN.Use grant on this VNet -- see ./access.ts for the matching
// grant on the legacy `vmbr1` bridge (the `eth0` Cilium-L2 plane, unmanaged).
const talosnetAclPath = pulumi.interpolate`/sdn/zones/${pvenetZone.sdnZoneSimpleId}/${talosnetVnet.sdnVnetId}`;

export const omniSdnTalosnetAcl = new proxmox.Acl(
	"pve-acl-omni-sdn-talosnet",
	{
		path: talosnetAclPath,
		userId: omniUser.userId,
		roleId: "PVESDNUser",
		propagate: true,
	},
	{ protect: true },
);

// SDN changes are staged, not live, until applied -- this mirrors the setup
// procedure's final `pvesh set /cluster/sdn` step. Runs on every `pulumi up`
// that touches SDN state; a no-op apply when nothing changed.
export const sdnApplier = new proxmox.SdnApplier(
	"pve-sdn-applier",
	{},
	{ dependsOn: [pvenetZone, talosnetVnet, talosnetSubnet, omniSdnTalosnetAcl] },
);
