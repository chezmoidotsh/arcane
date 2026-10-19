import * as pangolin from "@pulumi/pangolin";
import type * as pulumi from "@pulumi/pulumi";

// -----------------------------------------------------------------------------
// Access rules
// -----------------------------------------------------------------------------
// Every fully public (no-SSO) resource gets the same edge rules, evaluated by
// ascending priority (first match wins):
//   1. DROP the countries at risk;
//   2. DROP the ASNs of the big clouds, hosters and VPNs;
//   3. ACCEPT Japan and Europe;
//   4. DROP everything else.
// Built from the Pangolin request audit logs: nearly all the traffic came from
// scanners on cloud/hosting ASNs or from countries outside the allow-list. It
// narrows the exposure, it is not authentication: apps still handle their own
// login. Residential and mobile ISPs are deliberately not listed, so a user
// behind a VPN, iCloud Private Relay or a cloud-hosted device is dropped too.

/** Countries dropped before anything else, hostile to the West or sources of
 * state-linked abuse. */
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

/** Countries accepted once the two deny passes above have not matched: Japan
 * and every European country that is not at risk (EU, plus the UK and
 * Switzerland). */
export const ALLOWED_COUNTRIES = [
	"AT", // Austria
	"BE", // Belgium
	"BG", // Bulgaria
	"CH", // Switzerland
	"CY", // Cyprus
	"CZ", // Czechia
	"DE", // Germany
	"DK", // Denmark
	"EE", // Estonia
	"ES", // Spain
	"FI", // Finland
	"FR", // France -- home
	"GB", // United Kingdom
	"GR", // Greece
	"HR", // Croatia
	"HU", // Hungary
	"IE", // Ireland
	"IT", // Italy
	"JP", // Japan
	"LT", // Lithuania
	"LU", // Luxembourg
	"LV", // Latvia
	"MT", // Malta
	"NL", // Netherlands
	"PL", // Poland
	"PT", // Portugal
	"RO", // Romania
	"SE", // Sweden
	"SI", // Slovenia
	"SK", // Slovakia
] as const;

/** ASNs of the big cloud providers, hosters and VPNs, dropped even from an
 * allowed country. Each number was checked against its registry name (Team
 * Cymru) and the VPN ones against public lists of VPN networks; VPN providers
 * mostly rent servers from the hosters below, so these cover most of them.
 * Extend this list rather than duplicating rules per app. */
export const DENIED_ASNS = [
	// Big clouds
	[16509, "Amazon AWS"],
	[14618, "Amazon AWS"],
	[15169, "Google"],
	[396982, "Google Cloud"],
	[8075, "Microsoft"],
	[31898, "Oracle Cloud"],
	[36351, "IBM Cloud"],
	[45102, "Alibaba Cloud"],
	[132203, "Tencent Cloud"],
	[136907, "Huawei Cloud"],
	[13335, "Cloudflare (incl. WARP)"],
	[801, "Amazon Leo"],
	// Hosters
	[14061, "DigitalOcean"],
	[63949, "Akamai Connected Cloud (Linode)"],
	[48337, "Linode"],
	[16276, "OVH"],
	[24940, "Hetzner"],
	[20473, "Vultr"],
	[12876, "Scaleway"],
	[8560, "IONOS"],
	[51167, "Contabo"],
	[60781, "Leaseweb NL"],
	[30633, "Leaseweb US"],
	[28753, "Leaseweb DE"],
	[36007, "Kamatera"],
	[62240, "Clouvider"],
	[8100, "QuadraNet"],
	[26496, "GoDaddy"],
	[47583, "Hostinger"],
	[22612, "Namecheap"],
	[46606, "Unified Layer (Bluehost)"],
	// VPNs (and the networks they run on)
	[9009, "M247 (Nord, Surfshark, PIA, CyberGhost, ...)"],
	[16247, "M247 UK"],
	[60068, "Datacamp / CDN77 (Express, Vypr, ...)"],
	[212238, "Datacamp / CDNEXT (Nord, ...)"],
	[209103, "Proton VPN"],
	[199218, "Proton VPN"],
	[136787, "PacketHub (Nord)"],
	[209854, "Cyberzone (Nord)"],
	[39351, "31173 Services (Mullvad)"],
	[42831, "UK Dedicated Servers (Mullvad)"],
	[216025, "Mullvad"],
	[397540, "Windscribe"],
	[206264, "Amarutu (hide.me)"],
	[396073, "Majestic Hosting (TorGuard)"],
	[46253, "IPVanish"],
	// Hosters and scanners seen in the request audit logs
	[48090, "DMZHOST (TECHOFF SRV)"],
	[218785, "TC Datacenter"],
	[202412, "Omegatech"],
	[53667, "FranTech (PonyNet)"],
	[219502, "Stormcloud"],
	[14956, "RouterHosting"],
	[211298, "Driftnet (scanner)"],
	[398324, "Censys (scanner)"],
] as const;

// Priorities leave room for each list to grow without renumbering.
const DENY_COUNTRY_PRIORITY_BASE = 1;
const DENY_ASN_PRIORITY_BASE = 100;
const ALLOW_COUNTRY_PRIORITY_BASE = 200;
const DROP_ALL_PRIORITY = 500;

type NamedRuleArgs = { name: string; args: pangolin.ResourceRuleArgs };

/** Pure resource-rule shapes of the three lists, kept separate from resource
 * creation below so the mapping itself is unit-testable without a Pulumi
 * runtime. */
function edgeRuleArgs(resourceId: pulumi.Input<number>): {
	denyCountries: NamedRuleArgs[];
	denyAsns: NamedRuleArgs[];
	allowCountries: NamedRuleArgs[];
} {
	return {
		denyCountries: HIGH_RISK_COUNTRIES.map((code, i) => ({
			name: `block-${code.toLowerCase()}`,
			args: {
				resourceId,
				action: "DROP",
				match: "COUNTRY",
				value: code,
				priority: DENY_COUNTRY_PRIORITY_BASE + i,
			},
		})),
		denyAsns: DENIED_ASNS.map(([asn], i) => ({
			name: `block-as${asn}`,
			args: {
				resourceId,
				action: "DROP",
				match: "ASN",
				value: `AS${asn}`,
				priority: DENY_ASN_PRIORITY_BASE + i,
			},
		})),
		allowCountries: ALLOWED_COUNTRIES.map((code, i) => ({
			name: `allow-${code.toLowerCase()}`,
			args: {
				resourceId,
				action: "ACCEPT",
				match: "COUNTRY",
				value: code,
				priority: ALLOW_COUNTRY_PRIORITY_BASE + i,
			},
		})),
	};
}

/** Catch-all DROP, evaluated after every other rule. Alone, it denies the
 * whole resource. The resource itself still needs `applyRules: true` for
 * rules to take effect. */
function dropEverything(
	namePrefix: string,
	resourceId: pulumi.Input<number>,
	opts?: pulumi.CustomResourceOptions,
): pangolin.ResourceRule {
	return new pangolin.ResourceRule(
		`${namePrefix}-drop-everything-else`,
		{
			resourceId,
			action: "DROP",
			match: "PATH",
			value: "/*",
			priority: DROP_ALL_PRIORITY,
		},
		opts,
	);
}

/** Applies the edge rules above to a public resource. The catch-all DROP waits
 * for the allow rules, so the resource is never closed before they exist. */
function applyEdgeAccessRules(
	namePrefix: string,
	resourceId: pulumi.Input<number>,
	opts?: pulumi.CustomResourceOptions,
): pangolin.ResourceRule[] {
	const { denyCountries, denyAsns, allowCountries } = edgeRuleArgs(resourceId);
	const create = ({ name, args }: NamedRuleArgs) =>
		new pangolin.ResourceRule(`${namePrefix}-${name}`, args, opts);
	const denies = [...denyCountries, ...denyAsns].map(create);
	const allows = allowCountries.map(create);
	return [
		...denies,
		...allows,
		dropEverything(namePrefix, resourceId, { ...opts, dependsOn: allows }),
	];
}

/** Everything that filters who can reach a public resource, in one place. */
export const edgeAccess = {
	/** Pure rule shapes of the three lists, for tests. */
	ruleArgs: edgeRuleArgs,
	/** Catch-all DROP; alone, it denies the whole resource. */
	dropEverything,
	/** Country deny-list, ASN deny-list, country allow-list, then catch-all DROP. */
	apply: applyEdgeAccessRules,
};

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
