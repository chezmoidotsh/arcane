import type { ExportedResource } from "../stack-export";
import { byKey, logicalName, out, resourcesOfType, text } from "./index";

export const STORAGE_PBS_TYPE = "proxmox:index/storagePbs:StoragePbs";

const KEEP_FIELDS: Array<[key: string, label: string]> = [
	["keepLast", "keep-last"],
	["keepHourly", "keep-hourly"],
	["keepDaily", "keep-daily"],
	["keepWeekly", "keep-weekly"],
	["keepMonthly", "keep-monthly"],
	["keepYearly", "keep-yearly"],
];

export interface StoragePbsDoc {
	storageId: string;
	server: string;
	datastore: string;
	/** The PBS token this storage authenticates with -- an identifier, not the secret half. */
	username?: string;
	contents: string[];
	/** Rendered retention, or the explicit "keeps everything" case. Never `undefined`, so the template needs no fallback. */
	retention: string;
	namespace?: string;
	disabled?: boolean;
}

/**
 * Never reads `password` or `encryptionKey`. Both are secret outputs, so
 * `pulumi stack export` already returns them as ciphertext (see
 * `../stack-export.ts`); skipping them here means a future provider release
 * that stopped marking them secret still could not leak them through this
 * document.
 */
export function extractStoragePbs(
	resources: ExportedResource[],
): StoragePbsDoc[] {
	return resourcesOfType(resources, STORAGE_PBS_TYPE)
		.map((r): StoragePbsDoc => {
			const backups = out<Record<string, unknown> | undefined>(r, "backups");
			return {
				storageId: out(r, "storagePbsId") ?? logicalName(r.urn),
				server: out(r, "server"),
				datastore: out(r, "datastore"),
				username: text(out(r, "username")),
				contents: out(r, "contents") ?? [],
				retention: retentionSummary(backups),
				namespace: text(out(r, "namespace")),
				disabled: out(r, "disable"),
			};
		})
		.sort(byKey((s) => s.storageId));
}

/**
 * `keepAll` and the individual `keep*` tiers are mutually exclusive in Proxmox
 * VE. Rendering the "keeps everything" case in words rather than leaving it
 * blank matters here: no retention on this side is a deliberate security
 * property (pruning runs server-side under PBS's own schedule), not an
 * oversight, and the document says so next to this value.
 */
function retentionSummary(backups?: Record<string, unknown>): string {
	if (!backups) return "not configured";
	if (backups.keepAll === true) return "none — keep-all";

	const parts = KEEP_FIELDS.map(([key, label]) =>
		backups[key] !== undefined ? `${label}=${String(backups[key])}` : undefined,
	).filter((part): part is string => part !== undefined);

	return parts.length > 0 ? parts.join(", ") : "none — keep-all";
}
