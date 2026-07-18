import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for pbs.pve.chezmoi.sh
// -----------------------------------------------------------------------------
// Proxmox Backup Server's web UI (port 8007) isn't publicly reachable, so
// HTTP-01 validation has no way to reach it -- DNS-01 is the only viable ACME
// challenge here, same reasoning as TrueNAS's cert (../truenas/certificates.ts).
// Proxmox Backup Server's built-in ACME client supports Cloudflare as a DNS
// plugin directly, no Caddy involved. This stack runs upstream of any
// Kubernetes cluster, so the token isn't pushed to Vault here -- Vault itself
// lives inside amiya.akn and can't be a dependency of something that has to
// exist before it. Exported as a Pulumi stack output for manual injection into
// Proxmox Backup Server's ACME DNS plugin configuration (see ./README.md,
// "Bootstrapping").
const acmeDns01Token = new Dns01TokenComponent("acme-dns-pbs", {
	owner: "chezmoi.sh",
	application: "Proxmox Backup Server ACME (pbs.pve.chezmoi.sh)",
	accountId: config.requireSecret("cloudflare_account_id"),
	zoneId: config.requireSecret("cloudflare_zone_id"),
});
export const pbsDns01Token = acmeDns01Token.tokenValue;
