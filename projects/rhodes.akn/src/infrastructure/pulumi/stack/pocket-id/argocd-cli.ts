import { oidcApp } from "@chezmoi.sh/pulumi-lib";

import { adminGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// public client already exists and is already in use by `argocd login`'s
// PKCE flow. The web UI login uses a separate confidential client, see
// ./argocd.ts.
export const argocdCliOidcClient = oidcApp("argocd-cli", {
	name: "ArgoCD (CLI)",
	description: "Déploiement continu (GitOps) — CLI",
	application: "argo-cd",
	callbackURLs: ["http://localhost:8085/auth/callback"],
	groupIds: [adminGroupId],
	overrides: { isPublic: true },
}).client;
