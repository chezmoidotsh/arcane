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
 * credentials -- for this stack, the Cloudflare DNS-01 token.
 *
 * The provider's schema does *not* list `data` as a secret output (only
 * `dataWo`), so its encryption in state is not guaranteed by the resource
 * type: it depends on the declaration feeding it secret Outputs, which
 * `../../stack/proxmox/acme.ts` now pins with `additionalSecretOutputs`.
 * Not reading the field at all is the second, independent layer -- a future
 * declaration that loses the secret marking still cannot leak through this
 * document. `../render.test.ts` asserts a fixture token never reaches the
 * output.
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
