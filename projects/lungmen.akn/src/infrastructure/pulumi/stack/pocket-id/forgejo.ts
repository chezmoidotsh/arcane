import * as pocketid from "@axnic/pulumi-pocket-id";
import {
	vaultSecretMetadata,
} from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Forgejo deployment,
// whose ExternalSecret reads client_id/client_secret straight from Vault
// (lungmen.akn/forgejo/auth/oidc-client). Not group-restricted.
export const forgejoOidcClient = new pocketid.OidcClient(
	"forgejo",
	{
		name: "Forgejo",
		description: "Hébergement Git",
		logo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/forgejo-dark.svg"),
		darkLogo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/forgejo-light.svg"),
		launchUrl: "https://git.chezmoi.sh",
		callbackUrls: [
			"https://git.chezmoi.sh/user/oauth2/auth.chezmoi.sh/callback",
		],
		isPublic: false,
		pkceEnabled: false,
		logoutCallbackUrls: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
);

const forgejoSecret = new pocketid.OidcClientSecret("forgejo-secret", {
	clientId: forgejoOidcClient.id,
});

new vault.kv.SecretV2(
	"forgejo-vault-secret",
	{
		mount: "lungmen.akn",
		name: "forgejo/auth/oidc-client",
		dataJson: pulumi.jsonStringify({
			client_id: forgejoOidcClient.id,
			client_secret: forgejoSecret.secret,
		}),
		customMetadata: {
			data: {
				description: "Forgejo OIDC client",
				application: "forgejo",
				...vaultSecretMetadata(forgejoSecret),
			},
		},
	},
	{ parent: forgejoSecret },
);
