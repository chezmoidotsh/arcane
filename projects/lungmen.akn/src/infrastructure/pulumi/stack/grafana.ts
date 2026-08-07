import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";
import * as grafana from "@pulumiverse/grafana";

// lungmen.akn's Grafana Operator only ever runs an `external`-mode Grafana CR
// (issue 1159) -- the real instance lives on rhodes.akn. This mints a
// lungmen-scoped API token for that external reference to authenticate with,
// via the official Grafana provider (grafana.oss.ServiceAccount +
// ServiceAccountToken), rather than distributing rhodes' bootstrap admin
// credentials as a standing cross-cluster secret.
//
// MANUAL ORDERING STEP: this only works once rhodes.akn's Grafana instance is
// actually live -- run this stack's `pulumi up` after that, not folded into
// the same apply as rhodes.akn's own stack.
const bootstrapCredentials = vault.kv.getSecretV2Output({
	mount: "rhodes.akn",
	name: "grafana/admin/bootstrap-credentials",
});

const grafanaProvider = new grafana.Provider("grafana", {
	url: "https://o11y.chezmoi.sh",
	auth: pulumi.secret(
		pulumi.interpolate`${bootstrapCredentials.data.username}:${bootstrapCredentials.data.password}`,
	),
});

const serviceAccount = new grafana.oss.ServiceAccount(
	"lungmen-akn",
	{
		name: "lungmen.akn",
		role: "Viewer",
	},
	{ provider: grafanaProvider },
);

const serviceAccountToken = new grafana.oss.ServiceAccountToken(
	"lungmen-akn",
	{
		name: "lungmen.akn",
		serviceAccountId: serviceAccount.id,
	},
	{ provider: grafanaProvider },
);

new vault.kv.SecretV2(
	"grafana-api-token-vault-secret",
	{
		mount: "lungmen.akn",
		name: "o11y/grafana/api-token",
		dataJson: pulumi.jsonStringify({
			token: serviceAccountToken.key,
		}),
		customMetadata: {
			data: {
				description:
					"Grafana API token scoped to lungmen.akn, for the external Grafana CR reference",
				application: "grafana",
				...vaultSecretMetadata(serviceAccountToken),
			},
		},
	},
	{ parent: serviceAccountToken },
);
