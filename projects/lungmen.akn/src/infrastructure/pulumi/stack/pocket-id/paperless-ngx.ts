import * as pocketid from "@pulumi/pocket-id";

import { appIconUrl, pocketIdProvider } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Paperless-ngx
// deployment, whose ExternalSecret reads client_id/client_secret straight
// from Vault (lungmen.akn/paperless-ngx/auth/oidc-client). Group restriction
// (allowedUserGroups) is managed by hand in the Pocket-Id UI: the generated
// SDK exposes it as read-only, so Pulumi can't own that part of the
// relationship.
export const paperlessNgxOidcClient = new pocketid.oidc.OidcClients(
	"paperless-ngx",
	{
		name: "Archives",
		description: "Archivage et gestion de documents",
		logoUrl: appIconUrl("paperless-ngx", "light"),
		darkLogoUrl: appIconUrl("paperless-ngx", "dark"),
		launchURL: "https://paperless.chezmoi.sh",
		callbackURLs: [
			"https://paperless.chezmoi.sh/accounts/oidc/pocket-id/login/callback/",
		],
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
