import * as cloudflare from "@pulumi/cloudflare";

import { cloudflareZoneId as zoneId } from "../config";
import { instance } from "../platform/instance";

// Caddy gets its certificate through HTTP-01 (port 80 is open in the NSG), so
// no DNS-01 token is needed on this host.
//
// DNS-only (not proxied): Cloudflare's proxy doesn't carry Minecraft's TCP.
// `minecraft` serves the game ports and the Pelican panel (443); the wildcard
// covers `main.minecraft` (Wings, called by browsers) and any per-server name.
// Caddy only serves the names it is configured for, each with its own
// certificate (HTTP-01 does not issue wildcards).
new cloudflare.DnsRecord("exusiai-minecraft", {
	zoneId,
	name: "minecraft",
	type: "A",
	content: instance.publicIp,
	ttl: 300,
	proxied: false,
	comment: "exusiai.akn -> Minecraft servers and Pelican panel",
});

new cloudflare.DnsRecord(
	"exusiai-minecraft-wildcard",
	{
		zoneId,
		name: "*.minecraft",
		type: "A",
		content: instance.publicIp,
		ttl: 300,
		proxied: false,
		comment: "exusiai.akn -> Pelican Wings and per-server names",
	},
);
