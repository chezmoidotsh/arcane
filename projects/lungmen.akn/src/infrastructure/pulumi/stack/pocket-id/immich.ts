import * as pocketid from "@axnic/pulumi-pocket-id";
import {
	vaultSecretMetadata,
} from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Immich deployment,
// whose ExternalSecret reads client_id/client_secret straight from Vault
// (lungmen.akn/immich/auth/oidc-client). Not group-restricted.
export const immichOidcClient = new pocketid.OidcClient(
	"immich",
	{
		name: "Photos",
		description: "Sauvegarde et partage de photos/vidéos",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/immich-dark.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/immich-light.svg",
		launchUrl: "https://photos.chezmoi.sh",
		callbackUrls: [
			"app.immich:///oauth-callback",
			"https://photos.chezmoi.sh/auth/login",
			"https://photos.chezmoi.sh/user-settings",
		],
		isPublic: false,
		pkceEnabled: true,
		logoutCallbackUrls: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
);

const immichSecret = new pocketid.OidcClientSecret("immich-secret", {
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
