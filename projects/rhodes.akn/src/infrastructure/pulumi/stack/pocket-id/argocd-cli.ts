import * as pocketid from "@pulumi/pocket-id";

import { appIconUrl, pocketIdProvider } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// public client already exists and is already in use by `argocd login`'s
// PKCE flow. The web UI login uses a separate confidential client, see
// ./argocd.ts.
export const argocdCliOidcClient = new pocketid.oidc.OidcClients(
	"argocd-cli",
	{
		name: "ArgoCD (CLI)",
		description: "Déploiement continu (GitOps) — CLI",
		logoUrl: appIconUrl("argo-cd", "light"),
		darkLogoUrl: appIconUrl("argo-cd", "dark"),
		callbackURLs: ["http://localhost:8085/auth/callback"],
		logoutCallbackURLs: [],
		isPublic: true,
		isGroupRestricted: true,
		pkceEnabled: true,
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
	{ provider: pocketIdProvider, ignoreChanges: ["logoUrl", "darkLogoUrl"] },
);
