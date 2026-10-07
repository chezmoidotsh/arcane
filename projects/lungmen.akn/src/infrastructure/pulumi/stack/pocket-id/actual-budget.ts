import * as pocketid from "@axnic/pulumi-pocket-id";
import {
	vaultSecretMetadata,
} from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import { maisonGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Actual-budget
// deployment, whose ExternalSecret reads client_id/client_secret straight
// from Vault (lungmen.akn/actual-budget/auth/oidc-client).
export const actualBudgetOidcClient = new pocketid.OidcClient(
	"actual-budget",
	{
		allowedUserGroupIds: [maisonGroupId],
		name: "Gestion du budget",
		description: "Suivi du budget",
		logo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/actual-budget-dark.svg"),
		darkLogo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/actual-budget-light.svg"),
		launchUrl: "https://budget.chezmoi.sh",
		callbackUrls: ["https://budget.chezmoi.sh/openid/callback"],
		isPublic: false,
		pkceEnabled: true,
		logoutCallbackUrls: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
);

const actualBudgetSecret = new pocketid.OidcClientSecret("actual-budget-secret", {
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
