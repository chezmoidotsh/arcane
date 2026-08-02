import * as pulumi from "@pulumi/pulumi";

// Pocket-ID's OIDC clients: one file per application below. Its Vault SSO
// auth backend, roles, and policies live in ../vault.ts -- this folder owns
// the client registrations ../vault.ts and ArgoCD's oidc-credentials
// ExternalSecret both consume by ID.
//
// Group membership (admin/maison/famille) is managed in chezmoi.sh, not
// here -- read across via StackReference rather than duplicating it.
const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
	name: "organization/chezmoi-sh-infra/chezmoi_sh.live",
});

export const adminGroupId = chezmoiSh.getOutput(
	"adminGroupId",
) as pulumi.Output<string>;

export * from "./argocd";
export * from "./argocd-cli";
export * from "./vault";
