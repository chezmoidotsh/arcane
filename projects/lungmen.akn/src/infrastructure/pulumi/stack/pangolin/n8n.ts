import {
	blockHighRiskCountries,
	must,
	withHealthcheck,
} from "@chezmoi.sh/pulumi-lib";
import * as pangolin from "@pulumi/pangolin";

import { lungmenSiteId } from "./index";

// No SSO in front of any app behind this org (each app handles its own auth,
// Pangolin just proxies), but unlike the other apps only the endpoints meant
// to be called from the outside are published: the editor, the REST API and
// the test webhooks stay reachable from the LAN only (through the HTTPRoute).
// Rules are evaluated by ascending priority: geo-blocking (1-8), then the
// allowed paths, then a catch-all DROP.
export const n8nResource = new pangolin.Resource("n8n-chezmoi-sh", {
	name: "n8n",
	mode: "http",
	domainId: pangolin.getDomainsOutput().apply(
		(r) =>
			must(
				r.domains.find((d) => d.baseDomain === "chezmoi.sh"),
				"chezmoi.sh base domain not found in Pangolin",
			).domainId,
	),
	subdomain: "n8n",
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
			ip: "n8n-main.n8n.svc.cluster.local",
			port: 5678,
		},
		{ path: "/healthz" },
	),
	{ parent: n8nResource },
);

blockHighRiskCountries("n8n-chezmoi-sh", n8nResource.resourceId, {
	parent: n8nResource,
});

// Production endpoints of n8n (default N8N_ENDPOINT_* values): webhooks, Wait
// node resume URLs and Form trigger pages. `webhook-test`, `form-test`, `rest`
// and the editor itself are deliberately left out.
const PUBLIC_PATHS = [
	"/webhook/*",
	"/webhook-waiting/*",
	"/form/*",
	"/form-waiting/*",
];

PUBLIC_PATHS.forEach((path, i) => {
	new pangolin.ResourceRule(
		`n8n-chezmoi-sh-allow-${path.split("/")[1]}`,
		{
			resourceId: n8nResource.resourceId,
			action: "ACCEPT",
			match: "PATH",
			value: path,
			priority: 10 + i,
		},
		{ parent: n8nResource },
	);
});

new pangolin.ResourceRule(
	"n8n-chezmoi-sh-drop-everything-else",
	{
		resourceId: n8nResource.resourceId,
		action: "DROP",
		match: "PATH",
		value: "/*",
		priority: 100,
	},
	{ parent: n8nResource },
);
