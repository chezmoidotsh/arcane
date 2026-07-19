import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as proxmox from "@pulumi/proxmox";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for pve-01.pve.chezmoi.sh
// -----------------------------------------------------------------------------
// Proxmox VE's built-in ACME client supports Cloudflare as a DNS plugin
// directly (no Caddy involved), same reasoning as
// ../proxmox-backup-server/acme.ts and TrueNAS's cert
// (../truenas/certificates.ts): the node's web UI isn't publicly reachable,
// so HTTP-01 has no way to validate it -- DNS-01 is the only viable
// challenge.
//
// Deliberate rotation: the plugin below was previously configured by hand
// with a long-lived Cloudflare API token (full zone edit). This mints a
// fresh, scoped DNS-01-only token and replaces it -- `pulumi up` on the
// plugin resource is expected to show a change the first time it runs.
const acmeDns01Token = new Dns01TokenComponent("acme-dns-pve", {
	owner: "chezmoi.sh",
	application: "Proxmox Virtual Environment ACME (pve-01.pve.chezmoi.sh)",
	accountId: config.requireSecret("cloudflare_account_id"),
	zoneId: config.requireSecret("cloudflare_zone_id"),
});

// -----------------------------------------------------------------------------
// default -- the ACME account the node's own TLS certificate uses (node
// config: `acme: account=default`, `acmedomain0: pve-01.pve.chezmoi.sh,
// plugin=cloudflare`)
// -----------------------------------------------------------------------------
// Proxmox VE's `/cluster/acme/account` endpoint hard-rejects API token
// authentication entirely (confirmed live: `pulumi import` fails with
// "Permission check failed (user != root@pam)" even with the import token's
// `privsep` disabled -- full root privileges via a token still isn't a real
// `root@pam` ticket/password session, which this endpoint specifically
// requires). Managing this resource is why this stack's provider
// authenticates via `root@pam` username/password instead of an API token --
// see ../README.md, "Bootstrapping". Without it, ACME can mint the plugin's
// Cloudflare token but never actually touch the account it authenticates
// against, defeating the point of managing ACME here at all.
//
// A second account, `testing`, exists on the live host (created against
// Let's Encrypt's staging directory during initial setup) but is unused by
// any node's certificate config -- deliberately not imported/managed here,
// same reasoning as ADR-015's dropped `DomainIdentity` scope: no live
// consumer, not worth codifying.
export const acmeAccount = new proxmox.AcmeAccount("pve-acme-account-default", {
	name: "default",
	contact: "uxo7y9mv3@mozmail.com",
	directory: "https://acme-v02.api.letsencrypt.org/directory",
	tos: "https://letsencrypt.org/documents/LE-SA-v1.3-September-21-2022.pdf",
});

// -----------------------------------------------------------------------------
// cloudflare -- the DNS-01 plugin the node's certificate uses to prove
// domain ownership
// -----------------------------------------------------------------------------
// `data` holds the Cloudflare credentials. It *is* encrypted in state today,
// but only because both values arrive as secret Outputs (`requireSecret` and
// the token component's own secret `tokenValue`) and Pulumi propagates
// secretness from input to output. The bridged provider's schema marks only
// `dataWo` as an additional secret output, not `data` -- so that encryption
// is a property of how these inputs happen to be built, not of the resource.
// Feed it a plain string once and the credential lands in the state file in
// cleartext. `additionalSecretOutputs` makes it secret by construction
// instead, independent of the caller.
export const acmeDnsPlugin = new proxmox.AcmeDnsPlugin(
	"pve-acme-dns-plugin-cloudflare",
	{
		plugin: "cloudflare",
		api: "cf",
		data: {
			CF_Account_ID: config.requireSecret("cloudflare_account_id"),
			CF_Token: acmeDns01Token.tokenValue,
		},
	},
	{ additionalSecretOutputs: ["data"] },
);

// -----------------------------------------------------------------------------
// pve-01.pve.chezmoi.sh -- the node's own web UI/API TLS certificate, ordered
// against `default` (above) via the `cloudflare` DNS-01 plugin (also above)
// -----------------------------------------------------------------------------
// References both by their Pulumi-managed output, not by the literal strings
// the node config already has (`acme: account=default`,
// `acmedomain0: pve-01.pve.chezmoi.sh,plugin=cloudflare`), so a rename of
// either the account or the plugin id is caught here instead of silently
// pointing this certificate at a resource that no longer exists.
export const acmeCertificate = new proxmox.AcmeCertificate(
	"pve-acme-certificate",
	{
		nodeName: "pve-01",
		account: acmeAccount.name,
		domains: [
			{
				domain: "pve-01.pve.chezmoi.sh",
				plugin: acmeDnsPlugin.plugin,
			},
		],
	},
);
