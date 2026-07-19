import type { ExportedResource } from "../stack-export";
import { byKey, logicalName, out, resourcesOfType, text } from "./index";

export const POOL_TYPE =
	"proxmox:index/virtualEnvironmentPool:VirtualEnvironmentPool";

export interface PoolDoc {
	poolId: string;
	/** Carries the pool's intent from `stack/proxmox/pools.ts` into the document. */
	comment?: string;
}

export function extractPools(resources: ExportedResource[]): PoolDoc[] {
	return resourcesOfType(resources, POOL_TYPE)
		.map(
			(r): PoolDoc => ({
				poolId: out(r, "poolId") ?? logicalName(r.urn),
				comment: text(out(r, "comment")),
			}),
		)
		.sort(byKey((p) => p.poolId));
}
