import {
	edgeAccess,
	must,
	withHealthcheck,
} from "@chezmoi.sh/pulumi-lib";
import * as pangolin from "@pulumi/pangolin";

import { lungmenSiteId } from "./index";

const chezmoiShDomainId = pangolin.getDomainsOutput().apply(
	(r) =>
		must(
			r.domains.find((d) => d.baseDomain === "chezmoi.sh"),
			"chezmoi.sh base domain not found in Pangolin",
		).domainId,
);

// Public side of n8n, served by the webhook processor (never by main, which holds the editor): no SSO (n8n
// handles its own auth), and everything is dropped for now. Webhooks will be added one by one as ACCEPT rules on
// `hooks.chezmoi.sh`, ahead of the catch-all DROP (priority 100), so only an
// explicitly allowed path is ever reachable from the outside. The editor and
// the REST API are never published here: they live on the private resource
// below, behind the Pangolin client.
export const n8nResource = new pangolin.Resource("n8n-chezmoi-sh", {
	name: "n8n",
	mode: "http",
	domainId: chezmoiShDomainId,
	subdomain: "hooks",
	sso: false,
	applyRules: true,
	maintenanceModeEnabled: true,
	maintenanceModeType: "automatic",
	maintenanceTitle: "Maintenance en cours",
	maintenanceMessage:
		"Ce service est temporairement indisponible. Merci de réessayer plus tard.",
});

new pangolin.Target(
	"n8n-chezmoi-sh-target",
	withHealthcheck.http(
		{
			resourceId: n8nResource.resourceId,
			siteId: lungmenSiteId,
			ip: "n8n-webhook-processor.n8n.svc.cluster.local",
			port: 5678,
		},
		{ path: "/healthz" },
	),
	{ parent: n8nResource },
);

edgeAccess.dropEverything("n8n-chezmoi-sh", n8nResource.resourceId, {
	parent: n8nResource,
});

// Private side of n8n: the full app (editor, REST API, webhooks), reachable
// on n8n.chezmoi.sh only from a device running the Pangolin client. Pangolin
// grants it to the built-in Admin role on its own. A private resource has a
// single destination, so it goes through the Cilium Gateway (HTTP listener,
// n8n.internal.httproute.yaml: Newt sends the Service name as Host), whose routes
// send webhooks/forms/MCP to the webhook processor and the rest to main. It
// takes over the FQDN the public resource used to have, so it must wait for
// that one to move to `hooks`. Plain HTTP on port 80 on purpose: Newt uses the
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
	{ dependsOn: n8nResource },
);
