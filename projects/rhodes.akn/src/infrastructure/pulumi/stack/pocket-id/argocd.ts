import {
	vaultSecretMetadata,
} from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@axnic/pulumi-pocket-id";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import { argocdCliOidcClient } from "./argocd-cli";
import { adminGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live ArgoCD deployment's
// web UI login. The CLI login uses a separate public client, see
// ./argocd-cli.ts.
export const argocdOidcClient = new pocketid.OidcClient(
	"argocd",
	{
		allowedUserGroupIds: [adminGroupId],
		name: "ArgoCD",
		description: "Déploiement continu (GitOps)",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/argo-cd-dark.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/argo-cd-light.svg",
		launchUrl: "https://argocd.akn.chezmoi.sh/",
		callbackUrls: ["https://argocd.akn.chezmoi.sh/auth/callback"],
		isPublic: false,
		pkceEnabled: true,
		logoutCallbackUrls: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
);

const argocdSecret = new pocketid.OidcClientSecret("argocd-secret", {
	clientId: argocdOidcClient.id,
});

// ArgoCD reads client_id/client_secret/cli_client_id from this single Vault
// entry (see argocd's oidc.pocket-id.* helmvalues) -- the CLI client is
// public, so only its ID (not a secret) belongs here.
new vault.kv.SecretV2(
	"argocd-vault-secret",
	{
		mount: "rhodes.akn",
		name: "argocd/auth/oidc-client",
		dataJson: pulumi.jsonStringify({
			client_id: argocdOidcClient.id,
			client_secret: argocdSecret.secret,
			cli_client_id: argocdCliOidcClient.id,
		}),
		customMetadata: {
			data: {
				description: "ArgoCD OIDC client (web + CLI)",
				application: "argo-cd",
				...vaultSecretMetadata(argocdSecret),
			},
		},
	},
	{ parent: argocdSecret },
);
