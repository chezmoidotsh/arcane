import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for the signoz LXC
// -----------------------------------------------------------------------------
// Caddy on the signoz LXC (signoz.chezmoi.sh) needs this token to complete
// DNS-01 challenges for its own TLS certificate. Same constraints as the other
// LXC appliances: this stack runs upstream of any Kubernetes cluster, so the
// token is exported as a Pulumi stack output instead of being pushed to Vault,
// then injected into the LXC's SOPS-encrypted secrets file with
// `mise run pulumi:cloudflare-token:signoz` (see the top-level .mise.toml).
const caddyDns01Token = new Dns01TokenComponent("caddy-dns01-signoz", {
	owner: "chezmoi.sh",
	application: "caddy-dns01/signoz",
	accountId: config.requireSecret("cloudflare_account_id"),
	zoneId: config.requireSecret("cloudflare_zone_id"),
});
export const signozDns01Token = caddyDns01Token.tokenValue;
