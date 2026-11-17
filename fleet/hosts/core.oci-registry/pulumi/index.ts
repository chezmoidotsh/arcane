import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for the zot-registry LXC
// -----------------------------------------------------------------------------
// Caddy on the zot-registry LXC (oci.chezmoi.sh, dir name oci-registry) needs
// this token to complete DNS-01 challenges for its own TLS certificate. This
// stack runs upstream of any Kubernetes cluster, so the token isn't pushed to
// Vault here — Vault itself runs inside rhodes.akn and can't be a dependency of
// something that has to exist before it. It's exported as a Pulumi stack output
// instead and injected into the LXC's SOPS-encrypted secrets file with
// `mise run lxc:secrets:sync` (see ../.mise.toml).
//
// Moved from the chezmoi-sh-infra project with `pulumi state move`: the logical
// name, the type and the parent chain (stack root) must stay as they are, or
// the moved resources get replaced (and the token rotated).
const caddyDns01Token = new Dns01TokenComponent("caddy-dns01-zot", {
	owner: "chezmoi.sh",
	application: "caddy-dns01/zot-registry",
	accountId: config.requireSecret("cloudflare_account_id"),
	zoneId: config.requireSecret("cloudflare_zone_id"),
});
export const zotRegistryDns01Token = caddyDns01Token.tokenValue;
