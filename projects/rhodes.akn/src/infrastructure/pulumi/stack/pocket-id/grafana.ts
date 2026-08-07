import {
	AllowedUserGroups,
	OidcClientSecret,
	pocketIdProvider,
	vaultSecretMetadata,
} from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@pulumi/pocket-id";
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
export const grafanaOidcClient = new pocketid.oidc.OidcClients(
	"grafana",
	{
		name: "Grafana",
		description: "Tableaux de bord et métriques",
		logoUrl: "https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/grafana.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/grafana.svg",
		launchURL: "https://o11y.chezmoi.sh/",
		callbackURLs: ["https://o11y.chezmoi.sh/login/generic_oauth"],
		isGroupRestricted: true,
		isPublic: false,
		pkceEnabled: true,
		logoutCallbackURLs: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
	{ provider: pocketIdProvider(), ignoreChanges: ["logoUrl", "darkLogoUrl"] },
);

new AllowedUserGroups("grafana-groups", {
	clientId: grafanaOidcClient.id,
	groupIds: [adminGroupId],
});

const grafanaSecret = new OidcClientSecret("grafana-secret", {
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
