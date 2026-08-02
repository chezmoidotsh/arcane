import { oidcApp } from "@chezmoi.sh/pulumi-lib";

import { maisonGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Paperless-ngx
// deployment, whose ExternalSecret reads client_id/client_secret straight
// from Vault (lungmen.akn/paperless-ngx/auth/oidc-client).
export const paperlessNgxOidcClient = oidcApp("paperless-ngx", {
	name: "Archives",
	description: "Archivage et gestion de documents",
	application: "paperless-ngx",
	launchURL: "https://paperless.chezmoi.sh",
	callbackURLs: [
		"https://paperless.chezmoi.sh/accounts/oidc/pocket-id/login/callback/",
	],
	groupIds: [maisonGroupId],
}).client;
