import * as pulumi from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";
import * as vault from "@pulumi/vault";

// -----------------------------------------------------------------------------
// Tailscale OAuth client for the Tailscale Kubernetes operator
// -----------------------------------------------------------------------------
// The operator needs to mint ephemeral auth keys (auth_keys) and create/manage
// tailnet devices (devices:core) on its own, without a human generating a key by
// hand each time it needs to join or expose a device. The tailscale-operator
// Helm release (infrastructure/kubernetes/tailscale/) uses this client to let
// Tailscale Ingress/Connector/ProxyGroup resources join the tailnet.
const oauthClient = new tailscale.OauthClient(
	"lungmen.akn-tailscale-oauth-client",
	{
		description: "OAuth client for TS Operator on lungmen-akn",
		scopes: ["auth_keys", "devices:core"],
		tags: ["tag:kubernetes-cluster"],
	},
);

new vault.kv.SecretV2(
	"lungmen.akn-tailscale-oauth-client",
	{
		mount: "shared",
		name: "third-parties/tailscale/oauth/lungmen.akn",
		dataJson: pulumi.jsonStringify({
			client_id: oauthClient.id,
			client_secret: oauthClient.key,
		}),
		customMetadata: {
			data: {
				description:
					"Tailscale OAuth Client for Tailscale Operator lungmen.akn",
				owner: "lungmen.akn",
				application: "tailscale-operator",

				"created-by":
					"projects/lungmen.akn/src/infrastructure/pulumi/src/tailscale-operator.ts",
				"renewal-process":
					"Rotate the client below; this secret's value is recomputed from " +
					"it and picks up the new one automatically on the next `pulumi up`.",
				"x-renewal-cmd": pulumi.interpolate`pulumi up --replace '${oauthClient.urn}'`,
			},
		},
	},
	{ parent: oauthClient },
);
