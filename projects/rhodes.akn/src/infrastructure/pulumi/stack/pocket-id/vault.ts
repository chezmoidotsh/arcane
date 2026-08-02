import * as pocketid from "@pulumi/pocket-id";

import { appIconUrl, pocketIdProvider } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Vault deployment.
// Group restriction (allowedUserGroups) is managed by hand in the Pocket-Id
// UI: the generated SDK exposes it as read-only, so Pulumi can't own that
// part of the relationship.
export const vaultOidcClient = new pocketid.oidc.OidcClients(
	"vault",
	{
		name: "Vault",
		description: "Coffre-fort de secrets (OpenBao)",
		// The app running is OpenBao (a Vault fork); the client is named "Vault"
		// for protocol/UI-compat reasons, so use OpenBao's icon, not a nonexistent
		// vault.svg.
		logoUrl: appIconUrl("openbao", "light"),
		darkLogoUrl: appIconUrl("openbao", "dark"),
		launchURL: "https://vault.chezmoi.sh/ui/vault/auth?with=pocket-id%2F",
		callbackURLs: [
			"https://vault.chezmoi.sh/ui/vault/auth/pocket-id/oidc/callback",
			"http://localhost:8250/oidc/callback",
		],
		logoutCallbackURLs: [],
		isPublic: false,
		isGroupRestricted: true,
		pkceEnabled: true,
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
	{ provider: pocketIdProvider, ignoreChanges: ["logoUrl", "darkLogoUrl"] },
);
