import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";

import { instance } from "./oci/instance";

const config = new pulumi.Config();
const zoneId = config.requireSecret("cloudflare_zone_id");

// Caddy gets its certificate through HTTP-01 (port 80 is open in the NSG), so
// no DNS-01 token is needed on this host.
//
// DNS-only (not proxied): Cloudflare's proxy doesn't carry Minecraft's TCP.
// `minecraft` serves the game ports and the Pelican panel (443); the wildcard
// covers `wings.minecraft` (Wings, called by browsers) and any per-server name.
// Caddy only serves the names it is configured for, each with its own
// certificate (HTTP-01 does not issue wildcards).
export const dnsRecord = new cloudflare.DnsRecord("rimbilliton-minecraft", {
	zoneId,
	name: "minecraft",
	type: "A",
	content: instance.publicIp,
	ttl: 300,
	proxied: false,
	comment: "rimbilliton.akn -> Minecraft servers and Pelican panel",
});

export const dnsWildcardRecord = new cloudflare.DnsRecord(
	"rimbilliton-minecraft-wildcard",
	{
		zoneId,
		name: "*.minecraft",
		type: "A",
		content: instance.publicIp,
		ttl: 300,
		proxied: false,
		comment: "rimbilliton.akn -> Pelican Wings and per-server names",
	},
);
