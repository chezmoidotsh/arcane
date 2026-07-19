import type { ExportedResource } from "../stack-export";
import { byKey, logicalName, out, resourcesOfType } from "./index";

export const ACME_DNS_PLUGIN_TYPE = "proxmox:index/acmeDnsPlugin:AcmeDnsPlugin";

export interface AcmeDnsPluginDoc {
	plugin: string;
	/** The acme.sh DNS API this plugin drives (e.g. `cf` for Cloudflare). */
	api: string;
	validationDelay?: number;
	disabled?: boolean;
}

/**
 * **Never reads `data` (or `dataWo`).** That map holds the DNS provider's API
 * credentials -- for this stack, the Cloudflare DNS-01 token -- and the
 * provider does *not* mark it as a secret output, so `pulumi stack export`
 * returns it in **plaintext**. Unlike the token/password fields elsewhere in
 * this package, ciphertext is not a safety net here: not reading the field is
 * the only thing keeping the credential out of the generated document.
 * `../render.test.ts` asserts a fixture token value never reaches the output.
 */
export function extractAcmeDnsPlugins(
	resources: ExportedResource[],
): AcmeDnsPluginDoc[] {
	return resourcesOfType(resources, ACME_DNS_PLUGIN_TYPE)
		.map(
			(r): AcmeDnsPluginDoc => ({
				plugin: out(r, "plugin") ?? logicalName(r.urn),
				api: out(r, "api"),
				validationDelay: out(r, "validationDelay"),
				disabled: out(r, "disable"),
			}),
		)
		.sort(byKey((p) => p.plugin));
}
