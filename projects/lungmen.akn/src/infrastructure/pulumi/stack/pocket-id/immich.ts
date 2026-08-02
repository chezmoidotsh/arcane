import { oidcApp } from "@chezmoi.sh/pulumi-lib";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Immich deployment,
// whose ExternalSecret reads client_id/client_secret straight from Vault
// (lungmen.akn/immich/auth/oidc-client). Not group-restricted.
export const immichOidcClient = oidcApp("immich", {
	name: "Photos",
	description: "Sauvegarde et partage de photos/vidéos",
	application: "immich",
	launchURL: "https://photos.chezmoi.sh",
	callbackURLs: [
		"app.immich:///oauth-callback",
		"https://photos.chezmoi.sh/auth/login",
		"https://photos.chezmoi.sh/user-settings",
	],
}).client;
