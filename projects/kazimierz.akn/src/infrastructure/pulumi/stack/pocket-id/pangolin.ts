import { AllowedUserGroups, pocketIdProvider } from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@pulumi/pocket-id";

import { familleGroupId, maisonGroupId } from "./index";

// The Pocket-Id side of Pangolin's SSO login only (Pangolin dashboard IDP
// id 1, "https://pangolin.chezmoi.sh/auth/idp/1/oidc/callback"). Imported
// from Pocket-Id (auth.chezmoi.sh) rather than created here -- this client
// already exists and is already in use by the live Pangolin deployment.
//
// Pangolin's own side of this integration (the Idp resource in Pangolin
// itself, via the `pangolin` provider) isn't managed here: it needs
// `pangolin_enable_integration_api` turned on (currently false in the
// Ansible role defaults) and a Pangolin API key that doesn't exist yet --
// deferred until that's set up.
export const pangolinOidcClient = new pocketid.oidc.OidcClients(
	"pangolin",
	{
		name: "Pangolin",
		description: "Tunnel / reverse-proxy d'accès public",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/pangolin-light.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/pangolin-dark.svg",
		launchURL: "https://pangolin.chezmoi.sh/",
		callbackURLs: ["https://pangolin.chezmoi.sh/auth/idp/1/oidc/callback"],
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

new AllowedUserGroups("pangolin-groups", {
	clientId: pangolinOidcClient.id,
	groupIds: [maisonGroupId, familleGroupId],
});
