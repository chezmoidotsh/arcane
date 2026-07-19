import type { ExportedResource } from "../stack-export";
import { byKey, logicalName, out, resourcesOfType, text } from "./index";

export const SDN_VNET_TYPE = "proxmox:index/sdnVnet:SdnVnet";

export interface SdnVnetDoc {
	vnetId: string;
	/** The zone this VNet belongs to -- the join key `../derive.ts` uses to nest VNets under zones. */
	zone: string;
	/** Free-form label; the closest thing a VNet has to a `comment`. */
	alias?: string;
	tag?: number;
	vlanAware?: boolean;
	isolatePorts?: boolean;
}

export function extractSdnVnets(resources: ExportedResource[]): SdnVnetDoc[] {
	return resourcesOfType(resources, SDN_VNET_TYPE)
		.map(
			(r): SdnVnetDoc => ({
				vnetId: out(r, "sdnVnetId") ?? logicalName(r.urn),
				zone: out(r, "zone"),
				alias: text(out(r, "alias")),
				tag: out(r, "tag"),
				vlanAware: out(r, "vlanAware"),
				isolatePorts: out(r, "isolatePorts"),
			}),
		)
		.sort(byKey((v) => v.vnetId));
}
