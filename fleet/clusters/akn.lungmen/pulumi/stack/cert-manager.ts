import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";
import * as config from "../config";

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for cert-manager
// -----------------------------------------------------------------------------
// cert-manager needs a scoped Cloudflare API token to complete DNS-01 challenges
// when issuing/renewing certificates for lungmen.akn.chezmoi.sh. cert-manager's
// Cloudflare ClusterIssuer (DNS-01 solver) reads the token from the Vault secret
// below through an ExternalSecret.
const certManagerToken = new Dns01TokenComponent("cert-manager", {
	owner: "lungmen.akn",
	application: "cert-manager",
	accountId: config.cloudflare.accountId,
	zoneId: config.cloudflare.zoneId,
});
export const certManagerDns01Token = certManagerToken.tokenValue;

new vault.kv.SecretV2(
	"cert-manager-token",
	{
		mount: "shared",
		name: "third-parties/cloudflare/iam/lungmen.akn/cert-manager-rw",
		dataJson: pulumi.jsonStringify({
			api_token: certManagerToken.tokenValue,
		}),
		customMetadata: {
			data: {
				description: "Cloudflare API Token for cert-manager",
				application: "cert-manager",

				...vaultSecretMetadata(certManagerToken, {
					renewalUrn: certManagerToken.tokenUrn,
				}),
			},
		},
	},
	{ parent: certManagerToken },
);
