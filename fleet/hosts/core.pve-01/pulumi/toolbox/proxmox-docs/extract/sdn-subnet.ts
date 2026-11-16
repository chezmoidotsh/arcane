import type { ExportedResource } from "../stack-export";
import { byKey, out, resourcesOfType, text } from "./index";

export const SDN_SUBNET_TYPE = "proxmox:index/sdnSubnet:SdnSubnet";

interface DhcpRange {
	startAddress: string;
	endAddress: string;
}

export interface SdnSubnetDoc {
	/** The VNet this subnet addresses -- the join key `../derive.ts` uses to nest subnets under VNets. */
	vnet: string;
	cidr: string;
	gateway?: string;
	snat?: boolean;
	dhcpRanges: DhcpRange[];
	dhcpDnsServer?: string;
}

export function extractSdnSubnets(
	resources: ExportedResource[],
): SdnSubnetDoc[] {
	return resourcesOfType(resources, SDN_SUBNET_TYPE)
		.map((r): SdnSubnetDoc => {
			// The provider accepts a single `dhcpRange` object or a list
			// depending on the resource version; normalise both to an array so
			// the template only ever iterates.
			const raw = r.outputs?.dhcpRange ?? r.outputs?.dhcpRanges;
			const dhcpRanges = Array.isArray(raw)
				? (raw as DhcpRange[])
				: raw
					? [raw as DhcpRange]
					: [];
			return {
				vnet: out(r, "vnet"),
				cidr: out(r, "cidr"),
				gateway: text(out(r, "gateway")),
				snat: out(r, "snat"),
				dhcpRanges,
				dhcpDnsServer: text(out(r, "dhcpDnsServer")),
			};
		})
		.sort(byKey((s) => `${s.vnet} ${s.cidr}`));
}
