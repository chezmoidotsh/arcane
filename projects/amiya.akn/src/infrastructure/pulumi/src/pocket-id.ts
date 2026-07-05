import * as cloudflare from "@pulumi/cloudflare";

import * as config from "../config";

// Pocket-ID's public-endpoint hardening. Its Vault SSO auth backend, roles, and
// policies live in vault.ts — this file only owns Pocket-ID's own cloud resources.

// Rate-limits auth.chezmoi.sh (Pocket-ID's public URL) to 100 requests/10s per (colo, IP), 10s ban.
// Cloud resource — always created, bootstrap mode or not.
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
