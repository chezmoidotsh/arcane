import * as pocketid from "@pulumi/pocket-id";

import { appIconUrl, pocketIdProvider } from "./index";

// Jellyfin's client only -- the SSO-Auth plugin that would actually consume
// it isn't deployed yet (jellyfin.statefulset.yaml has no plugin mechanism at
// all), so this client sits unused until that's built out separately.
// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here. Group
// restriction (allowedUserGroups) is managed by hand in the Pocket-Id UI: the
// generated SDK exposes it as read-only, so Pulumi can't own that part of the
// relationship.
export const jellyfinOidcClient = new pocketid.oidc.OidcClients(
	"jellyfin",
	{
		name: "Streaming",
		description: "Films, séries et musique",
		logoUrl: appIconUrl("jellyfin", "light"),
		darkLogoUrl: appIconUrl("jellyfin", "dark"),
		launchURL: "https://streaming.chezmoi.sh/sso/OID/start/pocket-id",
		callbackURLs: ["https://streaming.chezmoi.sh/sso/OID/redirect/pocket-id"],
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
