import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import * as config from "../config";

// -----------------------------------------------------------------------------
// Cloudflare API token for cloudflare-operator
// -----------------------------------------------------------------------------
// cloudflare-operator needs Cloudflare API access to create/manage the Tunnels
// and DNS records it's responsible for. Split zone+account policy prevents
// either scope's permission groups from reaching the other's resources. The
// cloudflare-operator Deployment (infrastructure/kubernetes/cloudflare-operator/)
// reads the token from the Vault secret below through an ExternalSecret.
//
// Uses cloudflare.AccountToken, not cloudflare.ApiToken: this account issues
// Account (Owned) API Tokens (/accounts/{account_id}/tokens), a distinct
// resource from classic User API Tokens (/user/tokens) that ApiToken targets.
const token = new cloudflare.AccountToken(
	"amiyaakn-chezmoi-sh-cloudflare-operator",
	{
		accountId: config.cloudflare.accountId,
		name: "(amiya.akn) - cloudflare-operator",
		policies: [
			{
				effect: "allow",
				permissionGroups: [
					{ id: "c1fde68c7bcc44588cbb6ddbc16d6480" }, // Account Settings Read (Account)
					{ id: "c07321b023e944ff818fec44d8203567" }, // Argo Tunnel Write (Account)
				],
				// accountId/zoneId are secret Outputs — a plain template literal would
				// interpolate Pulumi's opaque "calling toString on an Output" warning
				// instead of the value, so the JSON must be built inside .apply().
				// AccountTokenPolicy.resources is a JSON string, not an object.
				resources: config.cloudflare.accountId.apply((accountId) =>
					JSON.stringify({ [`com.cloudflare.api.account.${accountId}`]: "*" }),
				),
			},
			{
				effect: "allow",
				permissionGroups: [
					{ id: "4755a26eedb94da69e1066d98aa820be" }, // DNS Write (Zone)
				],
				resources: config.cloudflare.zoneId.apply((zoneId) =>
					JSON.stringify({
						[`com.cloudflare.api.account.zone.${zoneId}`]: "*",
					}),
				),
			},
		],
	},
);

// Vault/OpenBao itself runs on this cluster, so it isn't reachable yet during
// bootstrap. Only the token above (a Cloudflare-side resource, independent of
// Vault) can be created at that point; pushing it into Vault waits until
// bootstrap mode is over.
if (!config.isBootstraping) {
	new vault.kv.SecretV2(
		"cloudflare-operator-token",
		{
			mount: "shared",
			name: "third-parties/cloudflare/iam/amiya.akn/cloudflare-operator",
			dataJson: pulumi.jsonStringify({ api_token: token.value }),
			customMetadata: {
				data: {
					description: "Cloudflare API Token for tunnel operator",
					application: "cloudflare-operator",

					...vaultSecretMetadata(token),
				},
			},
		},
		{ parent: token },
	);
}
