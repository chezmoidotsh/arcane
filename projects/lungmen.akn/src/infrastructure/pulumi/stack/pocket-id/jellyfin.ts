import * as pocketid from "@axnic/pulumi-pocket-id";
import * as pulumi from "@pulumi/pulumi";

import { familleGroupId, maisonGroupId } from "./index";

// Jellyfin's client only -- the SSO-Auth plugin that would actually consume
// it isn't deployed yet (jellyfin.statefulset.yaml has no plugin mechanism at
// all), so this client sits unused until that's built out separately.
// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here.
export const jellyfinOidcClient = new pocketid.OidcClient(
	"jellyfin",
	{
		allowedUserGroupIds: [maisonGroupId, familleGroupId],
		name: "Streaming",
		description: "Films, séries et musique",
		logo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/jellyfin-dark.svg"),
		darkLogo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/jellyfin-light.svg"),
		launchUrl: "https://streaming.chezmoi.sh/sso/OID/start/pocket-id",
		callbackUrls: ["https://streaming.chezmoi.sh/sso/OID/redirect/pocket-id"],
		isPublic: false,
		pkceEnabled: true,
		logoutCallbackUrls: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
);
