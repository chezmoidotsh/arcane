import * as cloudflare from "@pulumi/cloudflare";

import * as config from "../config";

// Pocket-ID's public-endpoint hardening. Its Vault SSO auth backend, roles, and
// policies live in vault.ts — this file only owns Pocket-ID's own cloud resources.

// -----------------------------------------------------------------------------
// Cloudflare rate limiting for auth.chezmoi.sh
// -----------------------------------------------------------------------------
// auth.chezmoi.sh is Pocket-ID's public login endpoint — an internet-reachable
// OIDC provider is a natural brute-force/credential-stuffing target, so it needs
// its own rate limit independent of any app-level throttling. Enforced by
// Cloudflare at the edge, with no in-cluster consumer. This is a Cloudflare-only
// resource with no Vault secret, so unlike the token/client resources in the
// sibling files it's always created, bootstrap mode or not. Rate-limits
// auth.chezmoi.sh to 100 requests/10s per (colo, IP), 10s ban.
new cloudflare.Ruleset("cloudflare-security-auth-chezmoi-sh", {
	zoneId: config.cloudflare.zoneId,
	kind: "zone",
	name: "Rate limiting for auth.chezmoi.sh",
	phase: "http_ratelimit",
	description: "Limit to 100 requests per 10 seconds per endpoint, ban for 10s",
	rules: [
		{
			action: "block",
			expression: '(http.host eq "auth.chezmoi.sh")',
			description: "Rate limit all auth.chezmoi.sh endpoints",
			ratelimit: {
				characteristics: ["cf.colo.id", "ip.src"],
				period: 10,
				requestsPerPeriod: 100,
				mitigationTimeout: 10,
			},
		},
	],
});
