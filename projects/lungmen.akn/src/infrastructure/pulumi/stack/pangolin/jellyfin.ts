import { blockHighRiskCountries, must } from "@chezmoi.sh/pulumi-lib";
import * as pangolin from "@pulumi/pangolin";

import { lungmenSiteId } from "./index";

// Full public bypass, per the org's security policy: no SSO in front of any
// app behind this org (each app handles its own auth, Pangolin just
// proxies). The only edge protection is geo-blocking a handful of
// high-risk source countries below.
export const streamingResource = new pangolin.Resource("streaming-chezmoi-sh", {
	name: "Streaming",
	mode: "http",
	domainId: pangolin.getDomainsOutput().apply(
		(r) =>
			must(
				r.domains.find((d) => d.baseDomain === "chezmoi.sh"),
				"chezmoi.sh base domain not found in Pangolin",
			).domainId,
	),
	subdomain: "streaming",
	sso: false,
	applyRules: true,
	maintenanceModeEnabled: true,
	maintenanceModeType: "automatic",
	maintenanceTitle: "Maintenance en cours",
	maintenanceMessage:
		"Ce service est temporairement indisponible. Merci de réessayer plus tard.",
});

new pangolin.Target(
	"streaming-chezmoi-sh-target",
	{
		resourceId: streamingResource.resourceId,
		siteId: lungmenSiteId,
		ip: "jellyfin.jellyfin.svc.cluster.local",
		port: 80,
	},
	{ parent: streamingResource },
);

blockHighRiskCountries("streaming-chezmoi-sh", streamingResource.resourceId, {
	parent: streamingResource,
});
