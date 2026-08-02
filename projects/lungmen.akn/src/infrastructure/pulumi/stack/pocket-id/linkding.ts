import {
	AllowedUserGroups,
	OidcClientSecret,
	pocketIdProvider,
	vaultSecretMetadata,
} from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@pulumi/pocket-id";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import { maisonGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Linkding
// deployment, whose ExternalSecret reads client_id/client_secret straight
// from Vault (lungmen.akn/linkding/auth/oidc-client).
export const linkdingOidcClient = new pocketid.oidc.OidcClients(
	"linkding",
	{
		name: "Bookmarks",
		description: "Gestionnaire de favoris",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/linkding-light.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/linkding-dark.svg",
		launchURL: "https://bookmarks.chezmoi.sh",
		callbackURLs: ["https://bookmarks.chezmoi.sh/oidc/callback/"],
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

new AllowedUserGroups("linkding-groups", {
	clientId: linkdingOidcClient.id,
	groupIds: [maisonGroupId],
});

const linkdingSecret = new OidcClientSecret("linkding-secret", {
	clientId: linkdingOidcClient.id,
});

new vault.kv.SecretV2(
	"linkding-vault-secret",
	{
		mount: "lungmen.akn",
		name: "linkding/auth/oidc-client",
		dataJson: pulumi.jsonStringify({
			client_id: linkdingOidcClient.id,
			client_secret: linkdingSecret.secret,
		}),
		customMetadata: {
			data: {
				description: "Linkding OIDC client",
				application: "linkding",
				...vaultSecretMetadata(linkdingSecret),
			},
		},
	},
	{ parent: linkdingSecret },
);
