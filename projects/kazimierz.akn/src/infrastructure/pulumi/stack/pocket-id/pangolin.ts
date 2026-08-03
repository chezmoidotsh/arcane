import {
	AllowedUserGroups,
	OidcClientSecret,
	pocketIdProvider,
} from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@pulumi/pocket-id";

import { familleGroupId, maisonGroupId } from "./index";

// The Pocket-Id side of Pangolin's SSO login only (Pangolin dashboard IDP
// id 1, "https://pangolin.chezmoi.sh/auth/idp/1/oidc/callback"). Imported
// from Pocket-Id (auth.chezmoi.sh) rather than created here -- this client
// already exists and is already in use by the live Pangolin deployment.
//
// Pangolin's own side of this integration (the OrgIdp resource, binding this
// client to the chezmoi.sh org) lives in ../pangolin/idp.ts.
export const pangolinOidcClient = new pocketid.oidc.OidcClients(
	"pangolin",
	{
		name: "Pangolin",
		description: "Tunnel / reverse-proxy d'accès public",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/pangolin-dark.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/pangolin-light.svg",
		launchURL: "https://pangolin.chezmoi.sh/",
		callbackURLs: ["https://pangolin.chezmoi.sh/auth/idp/2/oidc/callback"], // TODO: use idp callback value to configure it
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

export const pangolinOidcClientSecret = new OidcClientSecret(
	"pangolin-secret",
	{ clientId: pangolinOidcClient.id },
);
