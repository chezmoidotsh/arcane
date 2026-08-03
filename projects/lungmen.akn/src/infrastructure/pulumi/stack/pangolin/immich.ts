import { blockHighRiskCountries, must } from "@chezmoi.sh/pulumi-lib";
import * as pangolin from "@pulumi/pangolin";

import { lungmenSiteId } from "./index";

// Full public bypass, per the org's security policy: no SSO in front of any
// app behind this org (each app handles its own auth, Pangolin just
// proxies). The only edge protection is geo-blocking a handful of
// high-risk source countries below.
export const photosResource = new pangolin.Resource("photos-chezmoi-sh", {
	name: "Photos",
	mode: "http",
	domainId: pangolin.getDomainsOutput().apply(
		(r) =>
			must(
				r.domains.find((d) => d.baseDomain === "chezmoi.sh"),
				"chezmoi.sh base domain not found in Pangolin",
			).domainId,
	),
	subdomain: "photos",
	sso: false,
	applyRules: true,
	maintenanceModeEnabled: true,
	maintenanceModeType: "automatic",
	maintenanceTitle: "Maintenance en cours",
	maintenanceMessage:
		"Ce service est temporairement indisponible. Merci de réessayer plus tard.",
});

new pangolin.Target(
	"photos-chezmoi-sh-target",
	{
		resourceId: photosResource.resourceId,
		siteId: lungmenSiteId,
		ip: "immich-server.immich.svc.cluster.local",
		port: 2283,
	},
	{ parent: photosResource },
);

blockHighRiskCountries("photos-chezmoi-sh", photosResource.resourceId, {
	parent: photosResource,
});
