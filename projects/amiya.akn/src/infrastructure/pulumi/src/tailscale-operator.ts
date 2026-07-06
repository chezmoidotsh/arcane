import * as pulumi from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";
import * as vault from "@pulumi/vault";

import * as config from "../config";

// -----------------------------------------------------------------------------
// Tailscale OAuth client for the Tailscale Kubernetes operator
// -----------------------------------------------------------------------------
// The operator needs to mint ephemeral auth keys (auth_keys) and create/manage
// tailnet devices (devices:core) on its own, without a human generating a key by
// hand each time it needs to join or expose a device. The tailscale-operator
// Helm release (infrastructure/kubernetes/tailscale/) uses this client to let
// Tailscale Ingress/Connector/ProxyGroup resources join the tailnet.
const oauthClient = new tailscale.OauthClient(
	"amiya.akn-tailscale-oauth-client",
	{
		description: "OAuth client for TS Operator on amiya-akn",
		scopes: ["auth_keys", "devices:core"],
		tags: ["tag:kubernetes-cluster"],
	},
);

// Vault/OpenBao itself runs on this cluster, so it isn't reachable yet during
// bootstrap — the Tailscale operator is one of the things that must come up
// before Vault can be reachable over the tailnet. Only the client above (a
// Tailscale-side resource, independent of Vault) can be created at that point;
// pushing it into Vault waits until bootstrap mode is over.
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
		{ parent: oauthClient },
	);
}
