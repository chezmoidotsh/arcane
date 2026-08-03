import {
	OidcClientSecret,
	pocketIdProvider,
	vaultSecretMetadata,
} from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@pulumi/pocket-id";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Forgejo deployment,
// whose ExternalSecret reads client_id/client_secret straight from Vault
// (lungmen.akn/forgejo/auth/oidc-client). Not group-restricted.
export const forgejoOidcClient = new pocketid.oidc.OidcClients(
	"forgejo",
	{
		name: "Forgejo",
		description: "Hébergement Git",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/forgejo-dark.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/forgejo-light.svg",
		launchURL: "https://git.chezmoi.sh",
		callbackURLs: [
			"https://git.chezmoi.sh/user/oauth2/auth.chezmoi.sh/callback",
		],
		isGroupRestricted: false,
		isPublic: false,
		pkceEnabled: false,
		logoutCallbackURLs: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
	{ provider: pocketIdProvider(), ignoreChanges: ["logoUrl", "darkLogoUrl"] },
);

const forgejoSecret = new OidcClientSecret("forgejo-secret", {
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
