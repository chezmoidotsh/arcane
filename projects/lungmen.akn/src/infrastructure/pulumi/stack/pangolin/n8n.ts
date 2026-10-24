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

// n8n is never published: the full app (editor, REST API, webhooks) is reachable
// on n8n.chezmoi.sh only from a device running the Pangolin client. Pangolin
// grants it to the built-in Admin role on its own. A private resource has a
// single destination, so it goes through the Cilium Gateway (HTTP listener,
// n8n.internal.httproute.yaml: Newt sends the Service name as Host), whose routes
// send webhooks/forms/MCP to the webhook processor and the rest to main. Plain
// HTTP on port 80 on purpose: Newt uses the
// destination name as SNI (the HTTPS listener only accepts *.chezmoi.sh) and
// Pangolin keeps the original Host, hence the hostnames of the HTTPRoute.
export const n8nPrivateResource = new pangolin.SiteResource(
	"n8n-private-chezmoi-sh",
	{
		name: "n8n (private)",
		mode: "http",
		siteId: lungmenSiteId,
		domainId: chezmoiShDomainId,
		subdomain: "n8n",
		scheme: "http",
		destination: "cilium-gateway-external.kube-system.svc.cluster.local",
		destinationPort: 80,
	},
);
