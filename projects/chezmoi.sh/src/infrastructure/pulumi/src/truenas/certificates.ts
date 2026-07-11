import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as truenas from "@pulumi/truenas";

import * as config from "../../config";

// --- Certificate Signing Requests ---------------------------------------
// `truenas.Certificate` has no field to reference a CSR (`csr_id`) or to
// configure an ACME DNS-01 challenge -- `CERTIFICATE_CREATE_ACME` can't be
// driven through this provider. Only CSR generation is managed here; the
// resulting ACME-signed certificates (TrueNAS_ACME, S3_ACME) stay
// TrueNAS-managed outside Pulumi.

// Shared identity fields for all CSRs. `keyLength` is required for RSA (the
// implicit default `keyType`) -- EC isn't usable here either way, the
// schema only accepts RSA key lengths (1024/2048/4096) regardless of
// `keyType`.
const csrIdentity = {
	country: "FR",
	state: "Ile-de-France",
	city: "Paris",
	organization: "chezmoi.sh",
	email: "truenas@chezmoi.sh",
	keyLength: 2048,
};

new truenas.Certificate("csr-localhost", {
	name: "localhost",
	createType: "CERTIFICATE_CREATE_CSR",
	common: "localhost",
	sans: ["DNS:localhost"],
	...csrIdentity,
});

new truenas.Certificate("csr-truenas", {
	name: "TrueNAS",
	createType: "CERTIFICATE_CREATE_CSR",
	common: "nas.chezmoi.sh",
	sans: ["DNS:*.nas.chezmoi.sh", "DNS:nas.chezmoi.sh"],
	...csrIdentity,
});

// --- ACME DNS-01 (Cloudflare) ------------------------------------------
// Same pattern as ../observability.ts/../omni.ts: a dedicated, narrowly-scoped
// Cloudflare API token (Zone Read + DNS Edit only) instead of the untracked
// token that was there before, which had no rotation/audit trail at all.

const acmeDns01Token = new Dns01TokenComponent("acme-dns-truenas", {
	owner: "chezmoi.sh",
	application: "TrueNAS ACME Authenticator",
	accountId: config.cloudflare.accountId,
	zoneId: config.cloudflare.zoneId,
});

new truenas.AcmeDnsAuthenticator("acme-dns-cloudflare", {
	name: "cloudflare",
	authenticator: "cloudflare",
	attributes: {
		api_token: acmeDns01Token.tokenValue,
	},
});
