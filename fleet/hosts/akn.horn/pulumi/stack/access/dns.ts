import * as cloudflare from "@pulumi/cloudflare";

import { cloudflareZoneId as zoneId } from "../config";
import { instance } from "../platform/instance";

// Wildcard chezmoi.sh (not just kazimierz.akn) also points here: kazimierz
// is the shared public gateway for every internet-facing service in the
// homelab, not just Pangolin's own domain. IPv6 (AAAA) is left out --
// unvalidated on this infrastructure, same as the Hetzner setup it replaces.
const records = [
	{ name: "kazimierz.akn", comment: "kazimierz.akn -> OCI pangolin instance" },
	{
		name: "*.kazimierz.akn",
		comment: "wildcard kazimierz.akn -> OCI pangolin instance",
	},
	{
		name: "*.chezmoi.sh",
		comment: "wildcard chezmoi.sh -> OCI pangolin instance",
	},
];

records.map(
	({ name, comment }) =>
		new cloudflare.DnsRecord(name.replace(/\*/g, "wildcard"), {
			zoneId,
			name,
			type: "A",
			content: instance.publicIp,
			ttl: 300,
			proxied: false,
			comment,
		}),
);
