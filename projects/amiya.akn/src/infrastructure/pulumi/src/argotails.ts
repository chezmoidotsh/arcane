import * as pulumi from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";
import * as vault from "@pulumi/vault";

import * as config from "../config";

// -----------------------------------------------------------------------------
// Tailscale OAuth client for Argotails
// -----------------------------------------------------------------------------
// Argotails needs read-only access to the tailnet's device list to find
// remote-cluster nodes — it never creates/modifies Tailscale devices itself,
// hence the devices:core:read-only scope. The argotails Deployment (src/argocd/)
// watches Tailscale devices matching the `kubernetes-remote-cluster` filter and
// creates a corresponding Kubernetes Service for each, exposing remote-cluster
// nodes reachable over the tailnet as native Services in this cluster.
const oauthClient = new tailscale.OauthClient(
	"argotails-tailscale-oauth-client",
	{
		description: "OAuth client for Argotails on amiya-akn",
		scopes: ["devices:core:read"],
		tags: [],
	},
);

// Vault/OpenBao itself runs on this cluster, so it isn't reachable yet during
// bootstrap. Only the client above (a Tailscale-side resource, independent of
// Vault) can be created at that point; pushing it into Vault waits until
// bootstrap mode is over.
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
