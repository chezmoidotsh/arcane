import { AllowedUserGroups, pocketIdProvider } from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@pulumi/pocket-id";

import { adminGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// public client already exists and is already in use by `argocd login`'s
// PKCE flow. The web UI login uses a separate confidential client, see
// ./argocd.ts.
export const argocdCliOidcClient = new pocketid.oidc.OidcClients(
	"argocd-cli",
	{
		name: "ArgoCD (CLI)",
		description: "Déploiement continu (GitOps) — CLI",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/argo-cd-light.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/argo-cd-dark.svg",
		callbackURLs: ["http://localhost:8085/auth/callback"],
		isGroupRestricted: true,
		isPublic: true,
		pkceEnabled: true,
		logoutCallbackURLs: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
	{ provider: pocketIdProvider(), ignoreChanges: ["logoUrl", "darkLogoUrl"] },
);

new AllowedUserGroups("argocd-cli-groups", {
	clientId: argocdCliOidcClient.id,
	groupIds: [adminGroupId],
});
