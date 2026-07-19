import type { ExportedResource } from "../stack-export";
import { byKey, logicalName, out, resourcesOfType } from "./index";

export const ACME_ACCOUNT_TYPE = "proxmox:index/acmeAccount:AcmeAccount";

/** Well-known ACME directories, rendered as a name instead of a bare URL. */
const DIRECTORIES: Record<string, string> = {
	"https://acme-v02.api.letsencrypt.org/directory": "Let's Encrypt production",
	"https://acme-staging-v02.api.letsencrypt.org/directory":
		"Let's Encrypt staging",
};

export interface AcmeAccountDoc {
	name: string;
	contact: string;
	directory: string;
	/** Human-readable directory name when recognised, else the URL itself. */
	directoryLabel: string;
	/** True for a staging directory -- certificates from it are not publicly trusted. */
	staging: boolean;
}

/** Never reads `eabHmacKey`/`eabKid`: external-account-binding credentials, secret regardless of how the provider marks them. */
export function extractAcmeAccounts(
	resources: ExportedResource[],
): AcmeAccountDoc[] {
	return resourcesOfType(resources, ACME_ACCOUNT_TYPE)
		.map((r): AcmeAccountDoc => {
			const directory = out<string>(r, "directory");
			return {
				name: out(r, "name") ?? logicalName(r.urn),
				contact: out(r, "contact"),
				directory,
				directoryLabel: DIRECTORIES[directory] ?? directory,
				staging: /staging/i.test(directory ?? ""),
			};
		})
		.sort(byKey((a) => a.name));
}
