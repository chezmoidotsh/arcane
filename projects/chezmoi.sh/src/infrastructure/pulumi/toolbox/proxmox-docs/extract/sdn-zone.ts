import type { ExportedResource } from "../stack-export";
import { byKey, logicalName, out, resourcesOfType, text } from "./index";

/**
 * Proxmox VE models each SDN zone backend as its own resource type, so this
 * extractor covers all five rather than just the one currently in use --
 * declaring a `vxlan` zone alongside the existing `simple` one then needs no
 * change here.
 */
const ZONE_TYPES: Array<[type: string, kind: string, idField: string]> = [
	["proxmox:index/sdnZoneSimple:SdnZoneSimple", "simple", "sdnZoneSimpleId"],
	["proxmox:index/sdnZoneVlan:SdnZoneVlan", "vlan", "sdnZoneVlanId"],
	["proxmox:index/sdnZoneVxlan:SdnZoneVxlan", "vxlan", "sdnZoneVxlanId"],
	["proxmox:index/sdnZoneQinq:SdnZoneQinq", "qinq", "sdnZoneQinqId"],
	["proxmox:index/sdnZoneEvpn:SdnZoneEvpn", "evpn", "sdnZoneEvpnId"],
];

export interface SdnZoneDoc {
	zoneId: string;
	/** The backend implementing the zone: `simple`, `vlan`, `vxlan`, `qinq` or `evpn`. */
	kind: string;
	ipam?: string;
	dhcp?: string;
	mtu?: number;
	nodes?: string[];
}

export function extractSdnZones(resources: ExportedResource[]): SdnZoneDoc[] {
	return ZONE_TYPES.flatMap(([type, kind, idField]) =>
		resourcesOfType(resources, type).map(
			(r): SdnZoneDoc => ({
				zoneId: out(r, idField) ?? logicalName(r.urn),
				kind,
				ipam: text(out(r, "ipam")),
				dhcp: text(out(r, "dhcp")),
				mtu: out(r, "mtu"),
				nodes: out(r, "nodes"),
			}),
		),
	).sort(byKey((z) => z.zoneId));
}
