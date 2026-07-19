import type { ExportedResource } from "../stack-export";
import { byKey, out, resourcesOfType } from "./index";

export const ACME_CERTIFICATE_TYPE =
	"proxmox:index/acmeCertificate:AcmeCertificate";

interface CertificateDomain {
	domain: string;
	plugin?: string;
	alias?: string;
}

export interface AcmeCertificateDoc {
	nodeName: string;
	account: string;
	domains: CertificateDomain[];
	/**
	 * Primary subject -- the first domain, which is what the node serves.
	 * Optional because a certificate resource can carry an empty `domains`
	 * list (a half-applied import, a malformed export); the template renders
	 * a dash for it rather than an empty cell.
	 */
	primaryDomain?: string;
	/**
	 * The DNS plugins used across this certificate's domains. Empty when every
	 * domain validates over HTTP-01, which is what makes the "DNS-01 is the only
	 * workable challenge here" claim checkable rather than asserted.
	 */
	plugins: string[];
}

export function extractAcmeCertificates(
	resources: ExportedResource[],
): AcmeCertificateDoc[] {
	return resourcesOfType(resources, ACME_CERTIFICATE_TYPE)
		.map((r): AcmeCertificateDoc => {
			const domains = out<CertificateDomain[]>(r, "domains") ?? [];
			return {
				nodeName: out(r, "nodeName"),
				account: out(r, "account"),
				domains,
				primaryDomain: domains[0]?.domain,
				plugins: [
					...new Set(
						domains
							.map((d) => d.plugin)
							.filter((p): p is string => p !== undefined),
					),
				].sort((a, b) => a.localeCompare(b)),
			};
		})
		.sort(byKey((c) => `${c.nodeName} ${c.primaryDomain ?? ""}`));
}
