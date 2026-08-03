import {
	AllowedUserGroups,
	OidcClientSecret,
	pocketIdProvider,
	vaultSecretMetadata,
} from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@pulumi/pocket-id";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import { maisonGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Actual-budget
// deployment, whose ExternalSecret reads client_id/client_secret straight
// from Vault (lungmen.akn/actual-budget/auth/oidc-client).
export const actualBudgetOidcClient = new pocketid.oidc.OidcClients(
	"actual-budget",
	{
		name: "Gestion du budget",
		description: "Suivi du budget",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/actual-budget-dark.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/actual-budget-light.svg",
		launchURL: "https://budget.chezmoi.sh",
		callbackURLs: ["https://budget.chezmoi.sh/openid/callback"],
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

new AllowedUserGroups("actual-budget-groups", {
	clientId: actualBudgetOidcClient.id,
	groupIds: [maisonGroupId],
});

const actualBudgetSecret = new OidcClientSecret("actual-budget-secret", {
	clientId: actualBudgetOidcClient.id,
});

new vault.kv.SecretV2(
	"actual-budget-vault-secret",
	{
		mount: "lungmen.akn",
		name: "actual-budget/auth/oidc-client",
		dataJson: pulumi.jsonStringify({
			client_id: actualBudgetOidcClient.id,
			client_secret: actualBudgetSecret.secret,
			issuer_url: "https://auth.chezmoi.sh",
		}),
		customMetadata: {
			data: {
				description: "Actual Budget OIDC client",
				application: "actual-budget",
				...vaultSecretMetadata(actualBudgetSecret),
			},
		},
	},
	{ parent: actualBudgetSecret },
);
