import * as pulumi from "@pulumi/pulumi";

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
