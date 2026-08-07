import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as vault from "@pulumi/vault";

// Grafana's bootstrap admin account (issue 1159) -- sets the instance's own
// GF_SECURITY_ADMIN_USER/_PASSWORD on rhodes.akn, and is the one-time
// credential lungmen.akn's Pulumi stack authenticates with (basic auth) to
// mint its own scoped service-account token via the official Grafana
// provider. Not distributed to lungmen as a standing credential -- only used
// once to call the API after the instance is live.
const grafanaAdminPassword = new random.RandomPassword(
	"password-grafana-admin",
	{
		length: 32,
		special: true,
	},
);

export const grafanaAdminCredentials = new vault.kv.SecretV2(
	"grafana-admin-vault-secret",
	{
		mount: "rhodes.akn",
		name: "grafana/admin/bootstrap-credentials",
		dataJson: pulumi.jsonStringify({
			username: "admin",
			password: grafanaAdminPassword.result,
		}),
		customMetadata: {
			data: {
				description:
					"Grafana bootstrap admin account -- also used once by lungmen.akn's Pulumi stack to mint its own API token",
				application: "grafana",
				...vaultSecretMetadata(grafanaAdminPassword),
			},
		},
	},
	{ parent: grafanaAdminPassword },
);
