import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";

import { instance } from "./oci/instance";

const config = new pulumi.Config();
const zoneId = config.requireSecret("cloudflare_zone_id");

// Caddy gets its certificate through HTTP-01 (port 80 is open in the NSG), so
// no DNS-01 token is needed on this host.
//
// DNS-only (not proxied): Cloudflare's proxy doesn't carry Minecraft's TCP.
// mc.chezmoi.sh = game address, mc-admin.chezmoi.sh = SSO-gated panel.
export const dnsRecords = [
	{ name: "mc", comment: "rimbilliton.akn -> Minecraft server" },
	{ name: "mc-admin", comment: "rimbilliton.akn -> Crafty panel (SSO)" },
].map(
	({ name, comment }) =>
		new cloudflare.DnsRecord(`rimbilliton-${name}`, {
			zoneId,
			name,
			type: "A",
			content: instance.publicIp,
			ttl: 300,
			proxied: false,
			comment,
		}),
);
