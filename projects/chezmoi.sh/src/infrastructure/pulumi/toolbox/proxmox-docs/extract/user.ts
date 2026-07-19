import type { ExportedResource } from "../stack-export";
import { byKey, logicalName, out, resourcesOfType, text } from "./index";

export const USER_TYPE =
	"proxmox:index/virtualEnvironmentUser:VirtualEnvironmentUser";

export interface UserDoc {
	userId: string;
	/**
	 * The resource's own `comment` -- the channel through which per-identity
	 * intent travels from `stack/proxmox/access.ts` into this document. An
	 * identity declared without one renders with an empty purpose, which is the
	 * signal to go write it in the code rather than here.
	 */
	comment?: string;
	email?: string;
	enabled?: boolean;
}

export function extractUsers(resources: ExportedResource[]): UserDoc[] {
	return resourcesOfType(resources, USER_TYPE)
		.map(
			(r): UserDoc => ({
				userId: out(r, "userId") ?? logicalName(r.urn),
				comment: text(out(r, "comment")),
				email: text(out(r, "email")),
				enabled: out(r, "enabled"),
			}),
		)
		.sort(byKey((u) => u.userId));
}
