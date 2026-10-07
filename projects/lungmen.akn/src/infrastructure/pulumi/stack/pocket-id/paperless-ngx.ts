import * as pocketid from "@axnic/pulumi-pocket-id";
import {
	vaultSecretMetadata,
} from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import { maisonGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Paperless-ngx
// deployment, whose ExternalSecret reads client_id/client_secret straight
// from Vault (lungmen.akn/paperless-ngx/auth/oidc-client).
export const paperlessNgxOidcClient = new pocketid.OidcClient(
	"paperless-ngx",
	{
		allowedUserGroupIds: [maisonGroupId],
		name: "Archives",
		description: "Archivage et gestion de documents",
		logo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/paperless-ngx-dark.svg"),
		darkLogo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/paperless-ngx-light.svg"),
		launchUrl: "https://archives.chezmoi.sh",
		callbackUrls: [
			"https://archives.chezmoi.sh/accounts/oidc/pocket-id/login/callback/",
		],
		isPublic: false,
		pkceEnabled: true,
		logoutCallbackUrls: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
);

const paperlessNgxSecret = new pocketid.OidcClientSecret("paperless-ngx-secret", {
	clientId: paperlessNgxOidcClient.id,
});

new vault.kv.SecretV2(
	"paperless-ngx-vault-secret",
	{
		mount: "lungmen.akn",
		name: "paperless-ngx/auth/oidc-client",
		dataJson: pulumi.jsonStringify({
			client_id: paperlessNgxOidcClient.id,
			client_secret: paperlessNgxSecret.secret,
			issuer_url: "https://auth.chezmoi.sh",
		}),
		customMetadata: {
			data: {
				description: "Paperless-ngx OIDC client",
				application: "paperless-ngx",
				...vaultSecretMetadata(paperlessNgxSecret),
			},
		},
	},
	{ parent: paperlessNgxSecret },
);
