import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
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
				owner: "lungmen.akn",
				application: "cert-manager",

				"created-by":
					"projects/lungmen.akn/src/infrastructure/pulumi/src/cert-manager.ts",
				"renewal-process":
					"Rotate the token below; this secret's value is recomputed from " +
					"it and picks up the new one automatically on the next `pulumi up`.",
				"x-renewal-cmd": pulumi.interpolate`pulumi up --replace '${certManagerToken.tokenUrn}'`,
			},
		},
	},
	{ parent: certManagerToken },
);
