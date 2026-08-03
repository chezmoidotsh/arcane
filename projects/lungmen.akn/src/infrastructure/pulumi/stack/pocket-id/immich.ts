import {
	OidcClientSecret,
	pocketIdProvider,
	vaultSecretMetadata,
} from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@pulumi/pocket-id";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Immich deployment,
// whose ExternalSecret reads client_id/client_secret straight from Vault
// (lungmen.akn/immich/auth/oidc-client). Not group-restricted.
export const immichOidcClient = new pocketid.oidc.OidcClients(
	"immich",
	{
		name: "Photos",
		description: "Sauvegarde et partage de photos/vidéos",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/immich-dark.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/immich-light.svg",
		launchURL: "https://photos.chezmoi.sh",
		callbackURLs: [
			"app.immich:///oauth-callback",
			"https://photos.chezmoi.sh/auth/login",
			"https://photos.chezmoi.sh/user-settings",
		],
		isGroupRestricted: false,
		isPublic: false,
		pkceEnabled: true,
		logoutCallbackURLs: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
	{ provider: pocketIdProvider(), ignoreChanges: ["logoUrl", "darkLogoUrl"] },
);

const immichSecret = new OidcClientSecret("immich-secret", {
	clientId: immichOidcClient.id,
});

new vault.kv.SecretV2(
	"immich-vault-secret",
	{
		mount: "lungmen.akn",
		name: "immich/auth/oidc-client",
		dataJson: pulumi.jsonStringify({
			client_id: immichOidcClient.id,
			client_secret: immichSecret.secret,
			issuer_url: "https://auth.chezmoi.sh",
		}),
		customMetadata: {
			data: {
				description: "Immich OIDC client",
				application: "immich",
				...vaultSecretMetadata(immichSecret),
			},
		},
	},
	{ parent: immichSecret },
);
