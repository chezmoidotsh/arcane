import * as pocketid from "@axnic/pulumi-pocket-id";
import {
	vaultSecretMetadata,
} from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import { maisonGroupId } from "./index";

export const homeboxOidcClient = new pocketid.OidcClient(
	"homebox",
	{
		clientId: "737ecc0b-e9c1-426c-aa68-873047dac113",
		allowedUserGroupIds: [maisonGroupId],
		name: "Catalogue",
		description: "Inventaire du foyer",
		logo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/homebox-dark.svg"),
		darkLogo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/homebox-light.svg"),
		launchUrl: "https://catalogue.chezmoi.sh",
		callbackUrls: [
			"https://catalogue.chezmoi.sh/api/v1/users/login/oidc/callback",
		],
		isPublic: false,
		pkceEnabled: true,
		logoutCallbackUrls: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
);

const homeboxSecret = new pocketid.OidcClientSecret("homebox-secret", {
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
