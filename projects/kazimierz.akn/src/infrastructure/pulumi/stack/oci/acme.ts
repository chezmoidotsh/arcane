import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for Pangolin's wildcard *.chezmoi.sh certificate
// -----------------------------------------------------------------------------
// Traefik (behind Pangolin, see the pangolin Ansible role) requests one Let's
// Encrypt certificate per domain in pangolin_domains via HTTP-01 -- any other
// hostname on this same VPS (a typo, a made-up subdomain, a resource not yet
// added to Pangolin) gets Traefik's own untrusted default certificate instead
// of a real one, confirmed live against the production host. Switching to a
// DNS-01 wildcard cert for chezmoi.sh (see pangolin role's
// pangolin_acme_wildcard_domain / pangolin_cloudflare_dns_api_token) fixes
// that, but Traefik runs as a Docker Compose service via Ansible, not a
// Pulumi resource -- so the token only exists as a Pulumi stack output here,
// same pattern as ../../../chezmoi.sh/src/infrastructure/pulumi/stack/observability.ts.
// Not pushed to Vault: OpenBao lives inside amiya.akn, and kazimierz.akn is
// the public gateway every cluster (including amiya.akn) depends on to be
// reachable -- it can't depend on Vault being up first.
const traefikDns01Token = new Dns01TokenComponent("kazimierz-traefik-dns01", {
	owner: "kazimierz.akn",
	application: "Traefik DNS-01 wildcard cert (*.chezmoi.sh)",
	accountId: config.requireSecret("cloudflare_account_id"),
	zoneId: config.requireSecret("cloudflare_zone_id"),
});
export const traefikDns01TokenValue = traefikDns01Token.tokenValue;
