import { oidcApp } from "@chezmoi.sh/pulumi-lib";

import { adminGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live ArgoCD deployment's
// web UI login. The CLI login uses a separate public client, see
// ./argocd-cli.ts.
export const argocdOidcClient = oidcApp("argocd", {
	name: "ArgoCD",
	description: "Déploiement continu (GitOps)",
	application: "argo-cd",
	launchURL: "https://argocd.akn.chezmoi.sh/",
	callbackURLs: ["https://argocd.akn.chezmoi.sh/auth/callback"],
	groupIds: [adminGroupId],
}).client;
