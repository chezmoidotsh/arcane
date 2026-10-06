import * as pocketid from "@axnic/pulumi-pocket-id";

import { adminGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// public client already exists and is already in use by `argocd login`'s
// PKCE flow. The web UI login uses a separate confidential client, see
// ./argocd.ts.
export const argocdCliOidcClient = new pocketid.OidcClient(
	"argocd-cli",
	{
		allowedUserGroupIds: [adminGroupId],
		name: "ArgoCD (CLI)",
		description: "Déploiement continu (GitOps) — CLI",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/argo-cd-dark.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/argo-cd-light.svg",
		callbackUrls: ["http://localhost:8085/auth/callback"],
		isPublic: true,
		pkceEnabled: true,
		logoutCallbackUrls: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
);
