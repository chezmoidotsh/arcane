import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as pulumi from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";

const config = new pulumi.Config();

// Everything the observability LXC (o11y.chezmoi.sh) needs: a Caddy DNS-01 token for its
// own TLS certificate, and a Tailscale identity to join the tailnet (kernel TUN mode) so
// off-LAN sources (notably the kazimierz.akn VPS) can reach the appliance over the tailnet.
//
// This stack runs upstream of any Kubernetes cluster — it provisions the LXC appliances
// clusters later depend on — so neither secret is pushed to Vault here; Vault itself runs
// inside amiya.akn and can't be a dependency of something that has to exist before it.
// Both secrets are exported as Pulumi stack outputs instead and injected into the LXC's
// SOPS-encrypted secrets file with `mise run pulumi:cloudflare-token:observability` (see
// the top-level .mise.toml).

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token
// -----------------------------------------------------------------------------
// Caddy on the observability LXC needs this token to complete DNS-01 challenges for its
// own TLS certificate. Baked into the image as CLOUDFLARE_API_TOKEN in caddy.sops.env.
const caddyDns01Token = new Dns01TokenComponent("caddy-dns01-observability", {
	owner: "chezmoi.sh",
	application: "caddy-dns01/observability",
	accountId: config.requireSecret("cloudflare_account_id"),
	zoneId: config.requireSecret("cloudflare_zone_id"),
});
export const observabilityDns01Token = caddyDns01Token.tokenValue;

// -----------------------------------------------------------------------------
// Tailscale OAuth client
// -----------------------------------------------------------------------------
// caddy-tailscale (tsnet embedded in Caddy) uses this client to join the tailnet under
// tag:o11y, so off-LAN sources can reach the appliance without a separate tailscaled
// daemon. Baked into the image as TAILSCALE_OAUTH_KEY in the same caddy.sops.env.
const oauthClient = new tailscale.OauthClient(
	"observability-tailscale-oauth-client",
	{
		description: "OAuth client for the o11y LXC",
		scopes: ["auth_keys"],
		tags: ["tag:o11y"],
	},
);
export const observabilityTailscaleOauthKey = oauthClient.key;
