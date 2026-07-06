import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import * as config from "../config";

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for cert-manager
// -----------------------------------------------------------------------------
// cert-manager needs a scoped Cloudflare API token to complete DNS-01 challenges
// when issuing/renewing certificates for amiya.akn.chezmoi.sh. cert-manager's
// Cloudflare ClusterIssuer (DNS-01 solver) reads the token from the Vault secret
// below through an ExternalSecret.
const certManagerToken = new Dns01TokenComponent("cert-manager", {
	owner: "amiya.akn",
	application: "cert-manager",
	accountId: config.cloudflare.accountId,
	zoneId: config.cloudflare.zoneId,
});
export const certManagerDns01Token = certManagerToken.tokenValue;

// Vault/OpenBao itself runs on this cluster, so it isn't reachable yet during
// bootstrap — cert-manager is one of the things that must come up before Vault
// can be exposed. Only the token above (a Cloudflare-side resource, independent
// of Vault) can be created at that point; pushing it into Vault waits until
// bootstrap mode is over.
if (!config.isBootstraping) {
	new vault.kv.SecretV2(
		"cert-manager-token",
		{
			mount: "shared",
			name: "third-parties/cloudflare/iam/amiya.akn/cert-manager-rw",
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
}
