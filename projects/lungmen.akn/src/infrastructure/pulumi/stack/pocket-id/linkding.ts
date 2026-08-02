import { oidcApp } from "@chezmoi.sh/pulumi-lib";

import { maisonGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Linkding
// deployment, whose ExternalSecret reads client_id/client_secret straight
// from Vault (lungmen.akn/linkding/auth/oidc-client).
export const linkdingOidcClient = oidcApp("linkding", {
	name: "Bookmarks",
	description: "Gestionnaire de favoris",
	application: "linkding",
	launchURL: "https://bookmarks.chezmoi.sh",
	callbackURLs: ["https://bookmarks.chezmoi.sh/oidc/callback/"],
	groupIds: [maisonGroupId],
}).client;
