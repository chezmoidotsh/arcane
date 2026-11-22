import * as cloudflare from "@pulumi/cloudflare";

import { cloudflareZoneId as zoneId } from "../config";
import { instance } from "../platform/instance";

// Wildcard chezmoi.sh (not just the gateway's own name) also points here: horn is the shared public gateway for
// every internet-facing service in the homelab, not just Pangolin's own domain. IPv6 (AAAA) is left out --
// unvalidated on this infrastructure, same as the Hetzner setup it replaces.
// `kazimierz.akn` and `*.kazimierz.akn` keep the former host name: they are public endpoints (the record names
// are not renamed, only the Pulumi logical names are).
const records = [
	{ id: "horn.akn", name: "kazimierz.akn", comment: "horn.akn (legacy name) -> OCI pangolin instance" },
	{
		id: "wildcard.horn.akn",
		name: "*.kazimierz.akn",
		comment: "wildcard horn.akn (legacy name) -> OCI pangolin instance",
	},
	{
		id: "wildcard.chezmoi.sh",
		name: "*.chezmoi.sh",
		comment: "wildcard chezmoi.sh -> OCI pangolin instance",
	},
];

records.map(
	({ id, name, comment }) =>
		new cloudflare.DnsRecord(id, {
			zoneId,
			name,
			type: "A",
			content: instance.publicIp,
			ttl: 300,
			proxied: false,
			comment,
		}),
);
