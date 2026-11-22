import type { ExportedResource } from "../stack-export";
import { byKey, logicalName, out, resourcesOfType } from "./index";

export const ROLE_TYPE =
	"proxmox:index/virtualEnvironmentRole:VirtualEnvironmentRole";

export interface RoleDoc {
	roleId: string;
	privileges: string[];
	/** True when every privilege is read-only (`*.Audit`) -- lets the template say so without hard-coding which roles those are. */
	auditOnly: boolean;
}

export function extractRoles(resources: ExportedResource[]): RoleDoc[] {
	return resourcesOfType(resources, ROLE_TYPE)
		.map((r): RoleDoc => {
			const privileges = (out<string[]>(r, "privileges") ?? [])
				.slice()
				.sort((a, b) => a.localeCompare(b));
			return {
				roleId: out(r, "roleId") ?? logicalName(r.urn),
				privileges,
				auditOnly:
					privileges.length > 0 &&
					privileges.every((p) => p.endsWith(".Audit")),
			};
		})
		.sort(byKey((role) => role.roleId));
}
