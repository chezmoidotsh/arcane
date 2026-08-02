import { oidcApp } from "@chezmoi.sh/pulumi-lib";

import { familleGroupId, maisonGroupId } from "./index";

// Jellyfin's client only -- the SSO-Auth plugin that would actually consume
// it isn't deployed yet (jellyfin.statefulset.yaml has no plugin mechanism at
// all), so this client sits unused until that's built out separately.
// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here.
export const jellyfinOidcClient = oidcApp("jellyfin", {
	name: "Streaming",
	description: "Films, séries et musique",
	application: "jellyfin",
	launchURL: "https://streaming.chezmoi.sh/sso/OID/start/pocket-id",
	callbackURLs: ["https://streaming.chezmoi.sh/sso/OID/redirect/pocket-id"],
	groupIds: [maisonGroupId, familleGroupId],
}).client;
