import * as pocketid from "@axnic/pulumi-pocket-id";
import {
	vaultSecretMetadata,
} from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import { adminGroupId } from "./index";

// Grafana's single instance (issue 1159, deployed via the Grafana Operator on
// rhodes.akn) reads client_id/client_secret straight from Vault
// (rhodes.akn/grafana/auth/oidc-client), same shape as every non-ArgoCD OIDC
// client in this repo. The OIDC endpoints themselves are hardcoded in
// grafana.instance.yaml's auth.generic_oauth config, not templated from
// Vault. Group-restricted to admins -- Grafana surfaces homelab-wide
// metrics/logs, not a single-app dashboard.
export const grafanaOidcClient = new pocketid.OidcClient(
	"grafana",
	{
		allowedUserGroupIds: [adminGroupId],
		name: "Grafana",
		description: "Tableaux de bord et métriques",
		logoUrl: "https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/grafana.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/grafana.svg",
		launchUrl: "https://o11y.chezmoi.sh/",
		callbackUrls: ["https://o11y.chezmoi.sh/login/generic_oauth"],
		isPublic: false,
		pkceEnabled: true,
		logoutCallbackUrls: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
);

const grafanaSecret = new pocketid.OidcClientSecret("grafana-secret", {
	clientId: grafanaOidcClient.id,
});

new vault.kv.SecretV2(
	"grafana-vault-secret",
	{
		mount: "rhodes.akn",
		name: "grafana/auth/oidc-client",
		dataJson: pulumi.jsonStringify({
			client_id: grafanaOidcClient.id,
			client_secret: grafanaSecret.secret,
		}),
		customMetadata: {
			data: {
				description: "Grafana OIDC client",
				application: "grafana",
				...vaultSecretMetadata(grafanaSecret),
			},
		},
	},
	{ parent: grafanaSecret },
);
