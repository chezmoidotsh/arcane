import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pangolin from "@pulumi/pangolin";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

// No Docker host behind this site -- Newt runs as a Kubernetes pod.
const site = new pangolin.Site("rhodes.akn", {
	name: "rhodes.akn",
	dockerSocketEnabled: false,
});

// Newt reads endpoint/token_id/token_secret from this exact Vault path --
// see infrastructure/kubernetes/newt/newt.externalsecret.yaml.
new vault.kv.SecretV2(
	"rhodes-akn-newt-vault-secret",
	{
		mount: "shared",
		name: "third-parties/pangolin/newt/rhodes.akn",
		dataJson: pulumi.jsonStringify({
			endpoint: "https://pangolin.chezmoi.sh",
			token_id: site.newtId,
			token_secret: site.newtSecret,
		}),
		customMetadata: {
			data: {
				description: "Pangolin Newt site credentials for rhodes.akn",
				application: "pangolin",
				...vaultSecretMetadata(site),
			},
		},
	},
	{ parent: site },
);

export const rhodesSiteId = site.siteId;

export * from "./pocket-id";
