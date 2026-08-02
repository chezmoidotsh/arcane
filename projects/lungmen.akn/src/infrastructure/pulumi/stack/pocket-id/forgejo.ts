import * as pocketid from "@pulumi/pocket-id";

import { appIconUrl, pocketIdProvider } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Forgejo deployment,
// whose ExternalSecret reads client_id/client_secret straight from Vault
// (lungmen.akn/forgejo/auth/oidc-client). Group restriction
// (allowedUserGroups) is managed by hand in the Pocket-Id UI: the generated
// SDK exposes it as read-only, so Pulumi can't own that part of the
// relationship.
export const forgejoOidcClient = new pocketid.oidc.OidcClients(
	"forgejo",
	{
		name: "Forgejo",
		description: "Hébergement Git auto-hébergé",
		logoUrl: appIconUrl("forgejo", "light"),
		darkLogoUrl: appIconUrl("forgejo", "dark"),
		launchURL: "https://git.chezmoi.sh",
		callbackURLs: [
			"https://git.chezmoi.sh/user/oauth2/auth.chezmoi.sh/callback",
		],
		logoutCallbackURLs: [],
		isPublic: false,
		isGroupRestricted: false,
		pkceEnabled: false,
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
	{ provider: pocketIdProvider, ignoreChanges: ["logoUrl", "darkLogoUrl"] },
);
