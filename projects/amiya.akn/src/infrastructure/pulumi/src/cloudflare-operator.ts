import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import * as config from "../config";

// Lets cloudflare-operator create/manage Cloudflare Tunnels and their DNS records.
// Split zone+account policy prevents either scope's permission groups from reaching
// the other's resources.
//
// Uses cloudflare.AccountToken, not cloudflare.ApiToken: this account issues
// Account (Owned) API Tokens (/accounts/{account_id}/tokens), a distinct
// resource from classic User API Tokens (/user/tokens) that ApiToken targets.
// Groups the token and its Vault secret under one parent so they share a
// single lifecycle. A dedicated type token (rather than a generic shared
// name) keeps this specific pairing identifiable in `pulumi preview`/state
// output.
const cloudflareOperatorScope = new pulumi.ComponentResource(
	"chezmoi:CloudflareOperatorCFToken",
	"cloudflare-operator-token",
);

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
	{ parent: cloudflareOperatorScope },
);

if (!config.isBootstraping) {
	new vault.kv.SecretV2(
		"cloudflare-operator-token",
		{
			mount: "shared",
			name: "third-parties/cloudflare/iam/amiya.akn/cloudflare-operator",
			dataJson: pulumi.jsonStringify({ api_token: token.value }),
			customMetadata: {
				// Convention for every secret pushed to Vault in this stack:
				//   description/owner/application — human identification, shown in
				//                                    the Vault UI.
				//   created-by                    — repo-relative path to this file,
				//                                    for traceability.
				//   renewal-process/x-renewal-cmd  — what rotating this secret does,
				//                                    and the exact copy/paste command
				//                                    to trigger it (built from the
				//                                    credential's own URN).
				data: {
					description: "Cloudflare API Token for tunnel operator",
					owner: "amiya.akn",
					application: "cloudflare-operator",

					"created-by":
						"projects/amiya.akn/src/infrastructure/pulumi/src/cloudflare-operator.ts",
					"renewal-process":
						"Rotate the token below; this secret's value is recomputed from " +
						"it and picks up the new one automatically on the next `pulumi up`.",
					"x-renewal-cmd": pulumi.interpolate`pulumi up --replace '${token.urn}'`,
				},
			},
		},
		{ parent: cloudflareOperatorScope },
	);
}
