import type { ExportedResource } from "../stack-export";
import { byKey, out, resourcesOfType } from "./index";

export const POOL_MEMBERSHIP_TYPE =
	"proxmox:index/poolMembership:PoolMembership";

export interface PoolMembershipDoc {
	poolId: string;
	/** Set for a storage membership; mutually exclusive with `vmId`. */
	storageId?: string;
	/** Set for a guest membership. This stack declares none -- guest membership is a side effect of VM creation, which stays manual. */
	vmId?: number;
}

export function extractPoolMemberships(
	resources: ExportedResource[],
): PoolMembershipDoc[] {
	return resourcesOfType(resources, POOL_MEMBERSHIP_TYPE)
		.map(
			(r): PoolMembershipDoc => ({
				poolId: out(r, "poolId"),
				storageId: out(r, "storageId"),
				vmId: out(r, "vmId"),
			}),
		)
		.sort(byKey((m) => `${m.poolId} ${m.storageId ?? m.vmId ?? ""}`));
}
