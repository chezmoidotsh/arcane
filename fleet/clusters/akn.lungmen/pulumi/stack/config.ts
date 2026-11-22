import * as pulumi from "@pulumi/pulumi";

// Every input of the program is read here, once. The other modules import what they need.
const config = new pulumi.Config();

export const cloudflare = {
	accountId: config.requireSecret("cloudflare_account_id"),
	zoneId: config.requireSecret("cloudflare_zone_id"),
};

// Fetched from the lungmen.akn cluster (kubectl --context lungmen.akn -n
// external-secrets-system get secret <reviewer-secret> -o jsonpath=...), not stored in Git.
export const remoteCluster = {
	kubernetesCaCert: config.requireSecret("lungmen_kubernetes_ca_cert"),
	tokenReviewerJwt: config.requireSecret("lungmen_token_reviewer_jwt"),
};

// Group membership (admin/maison/famille) is managed in chezmoi.sh, not here: read across through a StackReference
// rather than duplicated. Used by the Pocket-Id clients.
const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
	name: "organization/chezmoi-sh-infra/chezmoi_sh.live",
});

export const adminGroupId = chezmoiSh.getOutput("adminGroupId") as pulumi.Output<string>;
export const maisonGroupId = chezmoiSh.getOutput("maisonGroupId") as pulumi.Output<string>;
export const familleGroupId = chezmoiSh.getOutput("familleGroupId") as pulumi.Output<string>;
