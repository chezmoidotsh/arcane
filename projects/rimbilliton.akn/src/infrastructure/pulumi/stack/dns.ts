import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";

import { instance } from "./oci/instance";

const config = new pulumi.Config();
const zoneId = config.requireSecret("cloudflare_zone_id");

// Caddy gets its certificate through HTTP-01 (port 80 is open in the NSG), so
// no DNS-01 token is needed on this host.
//
// DNS-only (not proxied): Cloudflare's proxy doesn't carry Minecraft's TCP.
// A single name serves both the game (25565/tcp) and the SSO-gated panel (443).
export const dnsRecord = new cloudflare.DnsRecord("rimbilliton-minecraft", {
	zoneId,
	name: "minecraft",
	type: "A",
	content: instance.publicIp,
	ttl: 300,
	proxied: false,
	comment: "rimbilliton.akn -> Minecraft server and Crafty panel",
});
