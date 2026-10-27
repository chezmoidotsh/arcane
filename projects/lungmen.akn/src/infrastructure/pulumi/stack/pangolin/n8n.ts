import { must } from "@chezmoi.sh/pulumi-lib";
import * as pangolin from "@pulumi/pangolin";

import { lungmenSiteId } from "./index";

const chezmoiShDomainId = pangolin.getDomainsOutput().apply(
	(r) =>
		must(
			r.domains.find((d) => d.baseDomain === "chezmoi.sh"),
			"chezmoi.sh base domain not found in Pangolin",
		).domainId,
);

// n8n is never published: the full app (editor, REST API) is reachable on
// n8n.chezmoi.sh only from a device running the Pangolin client. Pangolin grants
// it to the built-in Admin role on its own. It targets n8n main directly: going
// through the Cilium Gateway fails, Envoy answers 403 to any client outside the
// n8n namespace.
export const n8nPrivateResource = new pangolin.SiteResource(
	"n8n-private-chezmoi-sh",
	{
		name: "n8n (private)",
		mode: "http",
		siteId: lungmenSiteId,
		domainId: chezmoiShDomainId,
		subdomain: "n8n",
		scheme: "http",
		destination: "n8n-main.n8n.svc.cluster.local",
		destinationPort: 5678,
	},
);
