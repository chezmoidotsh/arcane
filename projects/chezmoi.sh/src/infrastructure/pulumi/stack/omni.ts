import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for the omni LXC
// -----------------------------------------------------------------------------
// Caddy on the omni LXC (omni.chezmoi.sh) needs this token to complete DNS-01
// challenges for its own TLS certificate. This stack runs upstream of any
// Kubernetes cluster, so the token isn't pushed to Vault here — Vault itself
// runs inside amiya.akn and can't be a dependency of something that has to
// exist before it. It's exported as a Pulumi stack output instead and injected
// into the LXC's SOPS-encrypted secrets file with `mise run
// pulumi:cloudflare-token:omni` (see the top-level .mise.toml).
const caddyDns01Token = new Dns01TokenComponent("caddy-dns01-omni", {
	owner: "chezmoi.sh",
	application: "caddy-dns01/omni",
	accountId: config.requireSecret("cloudflare_account_id"),
	zoneId: config.requireSecret("cloudflare_zone_id"),
});
export const omniDns01Token = caddyDns01Token.tokenValue;
