import {
	edgeAccess,
	must,
	withHealthcheck,
} from "@chezmoi.sh/pulumi-lib";
import * as pangolin from "@pulumi/pangolin";

import { rhodesSiteId } from "./index";

// Full public bypass, per the org's security policy: no SSO in front of any
// app behind this org (each app handles its own auth, Pangolin just
// proxies). The only edge protection is the country/ASN rules below
// (see edgeAccess.apply).
export const authResource = new pangolin.Resource("auth-chezmoi-sh", {
	name: "Pocket-Id",
	mode: "http",
	domainId: pangolin.getDomainsOutput().apply(
		(r) =>
			must(
				r.domains.find((d) => d.baseDomain === "chezmoi.sh"),
				"chezmoi.sh base domain not found in Pangolin",
			).domainId,
	),
	subdomain: "auth",
	sso: false,
	applyRules: true,
	maintenanceModeEnabled: true,
	maintenanceModeType: "automatic",
	maintenanceTitle: "Maintenance en cours",
	maintenanceMessage:
		"Ce service est temporairement indisponible. Merci de réessayer plus tard.",
});

new pangolin.Target(
	"auth-chezmoi-sh-target",
	withHealthcheck.http(
		{
			resourceId: authResource.resourceId,
			siteId: rhodesSiteId,
			ip: "pocket-id.pocket-id.svc.cluster.local",
			port: 80,
		},
		{ path: "/healthz", status: 204 },
	),
	{ parent: authResource },
);

edgeAccess.apply("auth-chezmoi-sh", authResource.resourceId, {
	parent: authResource,
});
