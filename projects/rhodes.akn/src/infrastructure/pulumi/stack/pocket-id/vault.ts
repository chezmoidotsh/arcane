import { AllowedUserGroups, pocketIdProvider } from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@pulumi/pocket-id";

import { adminGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Vault deployment.
export const vaultOidcClient = new pocketid.oidc.OidcClients(
	"vault",
	{
		name: "Vault",
		description: "Coffre-fort de secrets",
		// The app running is OpenBao (a Vault fork); the client is named
		// "Vault" for protocol/UI-compat reasons, so use OpenBao's icon, not a
		// nonexistent "vault" one.
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/openbao-dark.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/openbao-light.svg",
		launchURL: "https://vault.chezmoi.sh/ui/vault/auth?with=pocket-id%2F",
		callbackURLs: [
			"https://vault.chezmoi.sh/ui/vault/auth/pocket-id/oidc/callback",
			"http://localhost:8250/oidc/callback",
		],
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

new AllowedUserGroups("vault-groups", {
	clientId: vaultOidcClient.id,
	groupIds: [adminGroupId],
});
