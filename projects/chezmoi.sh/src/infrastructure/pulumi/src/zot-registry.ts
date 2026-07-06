import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as config from "../config";

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for the zot-registry LXC
// -----------------------------------------------------------------------------
// Caddy on the zot-registry LXC (registry.chezmoi.sh, dir name oci-registry)
// needs this token to complete DNS-01 challenges for its own TLS certificate.
// This stack runs upstream of any Kubernetes cluster, so the token isn't
// pushed to Vault here — Vault itself runs inside amiya.akn and can't be a
// dependency of something that has to exist before it. It's exported as a
// Pulumi stack output instead and injected into the LXC's SOPS-encrypted
// secrets file with `mise run pulumi:cloudflare-token:oci-registry` (see the
// top-level .mise.toml).
const caddyDns01Token = new Dns01TokenComponent("caddy-dns01-zot", {
	owner: "chezmoi.sh",
	application: "caddy-dns01/zot-registry",
	accountId: config.cloudflare.accountId,
	zoneId: config.cloudflare.zoneId,
});
export const zotRegistryDns01Token = caddyDns01Token.tokenValue;
