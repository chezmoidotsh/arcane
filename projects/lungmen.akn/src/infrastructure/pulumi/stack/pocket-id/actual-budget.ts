import * as pocketid from "@pulumi/pocket-id";

import { appIconUrl, pocketIdProvider } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Actual-budget
// deployment, whose ExternalSecret reads client_id/client_secret straight
// from Vault (lungmen.akn/actual-budget/auth/oidc-client). Group restriction
// (allowedUserGroups) is managed by hand in the Pocket-Id UI: the generated
// SDK exposes it as read-only, so Pulumi can't own that part of the
// relationship.
export const actualBudgetOidcClient = new pocketid.oidc.OidcClients(
	"actual-budget",
	{
		name: "Gestion du budget",
		description: "Suivi du budget familial",
		logoUrl: appIconUrl("actual-budget", "light"),
		darkLogoUrl: appIconUrl("actual-budget", "dark"),
		launchURL: "https://budget.chezmoi.sh",
		callbackURLs: ["https://budget.chezmoi.sh/openid/callback"],
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
