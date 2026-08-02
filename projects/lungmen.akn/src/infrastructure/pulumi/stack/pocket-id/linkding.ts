import * as pocketid from "@pulumi/pocket-id";

import { appIconUrl, pocketIdProvider } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Linkding
// deployment, whose ExternalSecret reads client_id/client_secret straight
// from Vault (lungmen.akn/linkding/auth/oidc-client). Group restriction
// (allowedUserGroups) is managed by hand in the Pocket-Id UI: the generated
// SDK exposes it as read-only, so Pulumi can't own that part of the
// relationship.
export const linkdingOidcClient = new pocketid.oidc.OidcClients(
	"linkding",
	{
		name: "Bookmarks",
		description: "Gestionnaire de favoris",
		logoUrl: appIconUrl("linkding", "light"),
		darkLogoUrl: appIconUrl("linkding", "dark"),
		launchURL: "https://bookmarks.chezmoi.sh",
		callbackURLs: ["https://bookmarks.chezmoi.sh/oidc/callback/"],
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
