import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";
import * as grafana from "@pulumiverse/grafana";

// Viewer service account of the Grafana MCP server (ADR-019, apps/mcp/o11y.grafana.mcpserver.yaml),
// minted through the Grafana API with the bootstrap admin credentials, then stored in OpenBao
// (rhodes.akn/mcp/o11y/grafana-token) where the mcp-grafana-token ExternalSecret reads it.
// Viewer is enough: the MCP server runs with --disable-write and --disable-query.
//
// MANUAL ORDERING STEP: this only works once Grafana is live (it calls its API), so on a fresh
// rebuild run this stack's `pulumi up` again after the o11y app is synced.
const bootstrapCredentials = vault.kv.getSecretV2Output({
	mount: "rhodes.akn",
	name: "grafana/admin/bootstrap-credentials",
});

const grafanaProvider = new grafana.Provider("grafana-mcp", {
	url: "https://o11y.chezmoi.sh",
	auth: pulumi.secret(
		pulumi.interpolate`${bootstrapCredentials.data.username}:${bootstrapCredentials.data.password}`,
	),
});

const mcpServiceAccount = new grafana.oss.ServiceAccount(
	"mcp-o11y",
	{ name: "mcp-o11y", role: "Viewer" },
	{ provider: grafanaProvider },
);

const mcpServiceAccountToken = new grafana.oss.ServiceAccountToken(
	"mcp-o11y",
	{ name: "mcp-o11y", serviceAccountId: mcpServiceAccount.id },
	{ provider: grafanaProvider },
);

new vault.kv.SecretV2(
	"mcp-o11y-grafana-token-vault-secret",
	{
		mount: "rhodes.akn",
		name: "mcp/o11y/grafana-token",
		dataJson: pulumi.jsonStringify({ token: mcpServiceAccountToken.key }),
		customMetadata: {
			data: {
				description: "Grafana Viewer token of the mcp-o11y Grafana MCP server",
				application: "mcp",
				...vaultSecretMetadata(mcpServiceAccountToken),
			},
		},
	},
	{ parent: mcpServiceAccountToken },
);
