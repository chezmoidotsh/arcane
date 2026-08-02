import * as pocketid from "@pulumi/pocket-id";

import { appIconUrl, pocketIdProvider } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Immich deployment,
// whose ExternalSecret reads client_id/client_secret straight from Vault
// (lungmen.akn/immich/auth/oidc-client). Group restriction
// (allowedUserGroups) is managed by hand in the Pocket-Id UI: the generated
// SDK exposes it as read-only, so Pulumi can't own that part of the
// relationship.
export const immichOidcClient = new pocketid.oidc.OidcClients(
	"immich",
	{
		name: "Photos",
		description: "Sauvegarde et partage de photos/vidéos",
		logoUrl: appIconUrl("immich", "light"),
		darkLogoUrl: appIconUrl("immich", "dark"),
		launchURL: "https://photos.chezmoi.sh",
		callbackURLs: [
			"app.immich:///oauth-callback",
			"https://photos.chezmoi.sh/auth/login",
			"https://photos.chezmoi.sh/user-settings",
		],
		logoutCallbackURLs: [],
		isPublic: false,
		isGroupRestricted: false,
		pkceEnabled: true,
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
	{ provider: pocketIdProvider, ignoreChanges: ["logoUrl", "darkLogoUrl"] },
);
