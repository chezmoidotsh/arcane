import {
	edgeAccess,
	must,
	withHealthcheck,
} from "@chezmoi.sh/pulumi-lib";
import * as pangolin from "@pulumi/pangolin";

import { rhodesSiteId } from "./index";

// Full public bypass, per the org's security policy: no SSO in front of any
// app behind this org (each app handles its own auth, Pangolin just
// proxies). Grafana already gates its own login via generic_oauth against
// Pocket-Id (see infrastructure/kubernetes/o11y/grafana.instance.yaml) --
// same shape as every other app here, not an exception. The only edge
// protection is the country/ASN rules below (see edgeAccess.apply).
export const grafanaResource = new pangolin.Resource("grafana-chezmoi-sh", {
	name: "Grafana",
	mode: "http",
	domainId: pangolin.getDomainsOutput().apply(
		(r) =>
			must(
				r.domains.find((d) => d.baseDomain === "chezmoi.sh"),
				"chezmoi.sh base domain not found in Pangolin",
			).domainId,
	),
	subdomain: "o11y",
	sso: false,
	applyRules: true,
	maintenanceModeEnabled: true,
	maintenanceModeType: "automatic",
	maintenanceTitle: "Maintenance en cours",
	maintenanceMessage:
		"Ce service est temporairement indisponible. Merci de réessayer plus tard.",
});

new pangolin.Target(
	"grafana-chezmoi-sh-target",
	withHealthcheck.http(
		{
			resourceId: grafanaResource.resourceId,
			siteId: rhodesSiteId,
			ip: "grafana-service.o11y-system.svc.cluster.local",
			port: 3000,
		},
		{ path: "/api/health" },
	),
	{ parent: grafanaResource },
);

edgeAccess.apply("grafana-chezmoi-sh", grafanaResource.resourceId, {
	parent: grafanaResource,
});
