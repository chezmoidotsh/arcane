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
// client already exists and is already in use by the live Paperless-ngx
// deployment, whose ExternalSecret reads client_id/client_secret straight
// from Vault (lungmen.akn/paperless-ngx/auth/oidc-client).
export const paperlessNgxOidcClient = new pocketid.oidc.OidcClients(
	"paperless-ngx",
	{
		name: "Archives",
		description: "Archivage et gestion de documents",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/paperless-ngx-light.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/paperless-ngx-dark.svg",
		launchURL: "https://paperless.chezmoi.sh",
		callbackURLs: [
			"https://paperless.chezmoi.sh/accounts/oidc/pocket-id/login/callback/",
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

new AllowedUserGroups("paperless-ngx-groups", {
	clientId: paperlessNgxOidcClient.id,
	groupIds: [maisonGroupId],
});

const paperlessNgxSecret = new OidcClientSecret("paperless-ngx-secret", {
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
