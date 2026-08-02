import { AllowedUserGroups, pocketIdProvider } from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@pulumi/pocket-id";

import { familleGroupId, maisonGroupId } from "./index";

// Jellyfin's client only -- the SSO-Auth plugin that would actually consume
// it isn't deployed yet (jellyfin.statefulset.yaml has no plugin mechanism at
// all), so this client sits unused until that's built out separately.
// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here.
export const jellyfinOidcClient = new pocketid.oidc.OidcClients(
	"jellyfin",
	{
		name: "Streaming",
		description: "Films, séries et musique",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/jellyfin-light.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/jellyfin-dark.svg",
		launchURL: "https://streaming.chezmoi.sh/sso/OID/start/pocket-id",
		callbackURLs: ["https://streaming.chezmoi.sh/sso/OID/redirect/pocket-id"],
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

new AllowedUserGroups("jellyfin-groups", {
	clientId: jellyfinOidcClient.id,
	groupIds: [maisonGroupId, familleGroupId],
});
