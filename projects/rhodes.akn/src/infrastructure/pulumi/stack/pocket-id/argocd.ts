import * as pocketid from "@pulumi/pocket-id";

import { appIconUrl, pocketIdProvider } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live ArgoCD deployment's
// web UI login. The CLI login uses a separate public client, see
// ./argocd-cli.ts.
export const argocdOidcClient = new pocketid.oidc.OidcClients(
	"argocd",
	{
		name: "ArgoCD",
		description: "Déploiement continu (GitOps)",
		logoUrl: appIconUrl("argo-cd", "light"),
		darkLogoUrl: appIconUrl("argo-cd", "dark"),
		launchURL: "https://argocd.akn.chezmoi.sh/",
		callbackURLs: ["https://argocd.akn.chezmoi.sh/auth/callback"],
		logoutCallbackURLs: [],
		isPublic: false,
		isGroupRestricted: true,
		pkceEnabled: true,
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
	{ provider: pocketIdProvider, ignoreChanges: ["logoUrl", "darkLogoUrl"] },
);
