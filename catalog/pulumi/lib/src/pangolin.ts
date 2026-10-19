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

// -----------------------------------------------------------------------------
// Health checks
// -----------------------------------------------------------------------------
/** Every `hc*` input of a `pangolin.Target`, without the `hc` prefix
 * (`hcUnhealthyInterval` becomes `unhealthyInterval`). `enabled` and `mode`
 * are set by the helper, `health` is an output. */
export type HealthcheckOptions = {
	[K in keyof pangolin.TargetArgs as K extends `hc${infer R}`
		? Uncapitalize<R>
		: never]?: pangolin.TargetArgs[K];
};

const HTTP_DEFAULTS = {
	scheme: "http",
	method: "GET",
	status: 200,
	followRedirects: true,
	interval: 5,
	unhealthyInterval: 30,
	timeout: 5,
	healthyThreshold: 1,
	unhealthyThreshold: 1,
};

/** Adds an active health check to `pangolin.Target` arguments. Every field is
 * set explicitly: left unset, Pangolin does not always apply server-side
 * defaults (port/scheme/interval came back empty on some targets), and Newt
 * then silently skips the probe, leaving the target `unhealthy`. */
export const withHealthcheck = {
	/** HTTP probe of the target's own `ip`:`port` on `path`. `hostname` and
	 * `port` can be overridden, as can any other probe setting. */
	http<T extends { ip: string; port: number }>(
		args: T,
		options: Omit<HealthcheckOptions, "enabled" | "mode" | "health"> & {
			path: string;
		},
	): T & pangolin.TargetArgs {
		const merged = {
			...HTTP_DEFAULTS,
			hostname: args.ip,
			port: args.port,
			...options,
		};
		const hc = Object.fromEntries(
			Object.entries(merged).map(([k, v]) => [
				`hc${k[0].toUpperCase()}${k.slice(1)}`,
				v,
			]),
		);
		return { ...args, ...hc, hcEnabled: true, hcMode: "http" } as T &
			pangolin.TargetArgs;
	},
};
