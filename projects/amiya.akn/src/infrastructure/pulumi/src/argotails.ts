import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
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
				data: {
					description: "Tailscale OAuth Client for Argotails on amiya.akn",
					owner: "amiya.akn",
					application: "argotails",
					...vaultSecretMetadata(oauthClient),
				},
			},
		},
		{ parent: oauthClient },
	);
}
