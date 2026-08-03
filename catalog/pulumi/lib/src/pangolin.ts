import * as pangolin from "@pulumi/pangolin";
import type * as pulumi from "@pulumi/pulumi";

// -----------------------------------------------------------------------------
// Geo-blocking
// -----------------------------------------------------------------------------
// Countries blocked on every fully public (no-SSO) resource, regardless of
// app -- current/historic high-volume abuse and geopolitical-risk sources
// for this homelab. Extend this list rather than duplicating rules per app.
export const HIGH_RISK_COUNTRIES = [
	"US", // United States -- largest volume of automated scraping/credential-stuffing traffic
	"CN", // China -- high volume of state-linked and criminal scanning/attack traffic
	"RU", // Russia -- major ransomware/botnet source, sanctioned
	"KP", // North Korea -- state-sponsored APT activity, no legitimate traffic expected
	"IL", // Israel -- active conflict zone, elevated targeted-intrusion risk
	"IR", // Iran -- state-sponsored APT activity, sanctioned
	"BY", // Belarus -- sanctioned, aligned with RU threat activity
	"SY", // Syria -- active conflict zone, sanctioned
] as const;

/** Pure resource-rule shape per blocked country, kept separate from resource
 * creation below so the mapping itself is unit-testable without a Pulumi
 * runtime. */
export function countryBlockRuleArgs(
	resourceId: pulumi.Input<number>,
): { name: string; args: pangolin.ResourceRuleArgs }[] {
	return HIGH_RISK_COUNTRIES.map((code, i) => ({
		name: `block-${code.toLowerCase()}`,
		args: {
			resourceId,
			action: "DROP",
			match: "COUNTRY",
			value: code,
			priority: i + 1,
		},
	}));
}

/** Creates one `ResourceRule` per {@link HIGH_RISK_COUNTRIES} entry, dropping
 * traffic from each. The resource itself still needs `applyRules: true` for
 * these to take effect. */
export function blockHighRiskCountries(
	namePrefix: string,
	resourceId: pulumi.Input<number>,
	opts?: pulumi.CustomResourceOptions,
): pangolin.ResourceRule[] {
	return countryBlockRuleArgs(resourceId).map(
		({ name, args }) =>
			new pangolin.ResourceRule(`${namePrefix}-${name}`, args, opts),
	);
}
