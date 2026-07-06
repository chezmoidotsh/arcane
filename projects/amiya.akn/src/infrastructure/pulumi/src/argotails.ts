import * as pulumi from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";
import * as vault from "@pulumi/vault";

import * as config from "../config";

// Read-only device listing for Argotails.
// The Vault secret below is parented directly to the OAuth client, so they share a
// single lifecycle without an artificial wrapper resource.
const oauthClient = new tailscale.OauthClient(
	"argotails-tailscale-oauth-client",
	{
		description: "OAuth client for Argotails on amiya-akn",
		scopes: ["devices:core:read"],
		tags: [],
	},
);

if (!config.isBootstraping) {
	new vault.kv.SecretV2(
		"argotails-tailscale-oauth-client",
		{
			mount: "amiya.akn",
			name: "argocd/network/argotails-auth",
			dataJson: pulumi.jsonStringify({
				client_id: oauthClient.id,
				client_secret: oauthClient.key,
			}),
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
					description: "Tailscale OAuth Client for Argotails on amiya.akn",
					owner: "amiya.akn",
					application: "argotails",

					"created-by":
						"projects/amiya.akn/src/infrastructure/pulumi/src/argotails.ts",
					"renewal-process":
						"Rotate the client below; this secret's value is recomputed from " +
						"it and picks up the new one automatically on the next `pulumi up`.",
					"x-renewal-cmd": pulumi.interpolate`pulumi up --replace '${oauthClient.urn}'`,
				},
			},
		},
		{ parent: oauthClient },
	);
}
