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

export const homeboxOidcClient = new pocketid.oidc.OidcClients(
	"homebox",
	{
		name: "Homebox",
		description: "Inventaire du foyer",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/homebox-dark.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/homebox-light.svg",
		launchURL: "https://homebox.chezmoi.sh",
		callbackURLs: [
			"https://homebox.chezmoi.sh/api/v1/users/login/oidc/callback",
		],
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

new AllowedUserGroups("homebox-groups", {
	clientId: homeboxOidcClient.id,
	groupIds: [maisonGroupId],
});

const homeboxSecret = new OidcClientSecret("homebox-secret", {
	clientId: homeboxOidcClient.id,
});

new vault.kv.SecretV2(
	"homebox-vault-secret",
	{
		mount: "lungmen.akn",
		name: "homebox/auth/oidc-client",
		dataJson: pulumi.jsonStringify({
			client_id: homeboxOidcClient.id,
			client_secret: homeboxSecret.secret,
			issuer_url: "https://auth.chezmoi.sh",
		}),
		customMetadata: {
			data: {
				description: "Homebox OIDC client",
				application: "homebox",
				...vaultSecretMetadata(homeboxSecret),
			},
		},
	},
	{ parent: homeboxSecret },
);
