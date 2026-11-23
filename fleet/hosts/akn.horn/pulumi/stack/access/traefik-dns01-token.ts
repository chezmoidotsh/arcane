import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";

import { cloudflareAccountId, cloudflareZoneId } from "../config";

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for Pangolin's wildcard *.chezmoi.sh certificate
// -----------------------------------------------------------------------------
// Traefik (behind Pangolin, see nixos/modules/pangolin.nix) requests one Let's
// Encrypt certificate per Pangolin domain via HTTP-01 -- any other hostname
// on this same VPS (a typo, a made-up subdomain, a resource not yet added to
// Pangolin) gets Traefik's own untrusted default certificate instead of a
// real one, confirmed live against the production host. Switching to a DNS-01
// wildcard cert for chezmoi.sh fixes that, but Traefik runs as a container on
// the NixOS host, not a Pulumi resource -- so the token only exists as a
// Pulumi stack output here, same pattern as
// fleet/base/pulumi/stack/observability/credentials.ts.
// Not pushed to Vault: OpenBao lives inside rhodes.akn (the core-platform
// cluster; amiya.akn filled this role until it was decommissioned in favor
// of rhodes.akn in July 2026), and kazimierz.akn is the public gateway every
// cluster (including rhodes.akn) depends on to be reachable -- it can't
// depend on Vault being up first.
const traefikDns01Token = new Dns01TokenComponent("horn-traefik-dns01", {
	owner: "kazimierz.akn",
	application: "Traefik DNS-01 wildcard cert (*.chezmoi.sh)",
	accountId: cloudflareAccountId,
	zoneId: cloudflareZoneId,
});
export const traefikDns01TokenValue = traefikDns01Token.tokenValue;
