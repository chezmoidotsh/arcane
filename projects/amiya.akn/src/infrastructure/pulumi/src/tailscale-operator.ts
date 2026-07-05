import * as pulumi from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";
import * as vault from "@pulumi/vault";

import * as config from "../config";

// Lets the Tailscale Operator join the tailnet and advertise itself to Kubernetes.
// Groups the client and its Vault secret under one parent so they share a
// single lifecycle. A dedicated type token (rather than a generic shared
// name) keeps this specific pairing identifiable in `pulumi preview`/state
// output.
const tailscaleOperatorScope = new pulumi.ComponentResource(
	"chezmoi:TailscaleOperatorOAuthClient",
	"amiya.akn-tailscale-oauth-client",
);

const oauthClient = new tailscale.OauthClient(
	"amiya.akn-tailscale-oauth-client",
	{
		description: "OAuth client for TS Operator on amiya-akn",
		scopes: ["auth_keys", "devices:core"],
		tags: ["tag:kubernetes-cluster"],
	},
	{ parent: tailscaleOperatorScope },
);

if (!config.isBootstraping) {
	new vault.kv.SecretV2(
		"amiya.akn-tailscale-oauth-client",
		{
			mount: "shared",
			name: "third-parties/tailscale/oauth/amiya.akn",
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
					description:
						"Tailscale OAuth Client for Tailscale Operator amiya.akn",
					owner: "amiya.akn",
					application: "tailscale-operator",

					"created-by":
						"projects/amiya.akn/src/infrastructure/pulumi/src/tailscale-operator.ts",
					"renewal-process":
						"Rotate the client below; this secret's value is recomputed from " +
						"it and picks up the new one automatically on the next `pulumi up`.",
					"x-renewal-cmd": pulumi.interpolate`pulumi up --replace '${oauthClient.urn}'`,
				},
			},
		},
		{ parent: tailscaleOperatorScope },
	);
}
