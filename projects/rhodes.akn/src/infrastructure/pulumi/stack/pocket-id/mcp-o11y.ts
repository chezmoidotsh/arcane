import * as pocketid from "@axnic/pulumi-pocket-id";
import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as vault from "@pulumi/vault";

import { adminGroupId } from "./index";

// Upstream IdP client of the mcp-o11y vMCP embedded authorization server (ADR-019). The client ID
// is hardcoded in apps/mcp/o11y.virtualmcpserver.yaml, the secret and the HMAC key (signs the
// authorization codes) are read from Vault by apps/mcp/o11y.auth.externalsecret.yaml.
// Group-restricted to admins: the vMCP exposes the whole observability stack.
export const mcpO11yOidcClient = new pocketid.OidcClient("mcp-o11y", {
	clientId: "7a1c0e7e-5f0b-4f43-9c2b-3b6f3a8d1c10",
	allowedUserGroupIds: [adminGroupId],
	name: "MCP o11y",
	description: "Outils MCP d'observabilité",
	callbackUrls: ["https://mcp-o11y.chezmoi.sh/oauth/callback"],
	isPublic: false,
	pkceEnabled: true,
	logoutCallbackUrls: [],
	requiresPushedAuthorizationRequests: false,
	requiresReauthentication: false,
	skipConsent: false,
});

const mcpO11yOidcSecret = new pocketid.OidcClientSecret("mcp-o11y-secret", {
	clientId: mcpO11yOidcClient.id,
});

new vault.kv.SecretV2(
	"mcp-o11y-oidc-client-vault-secret",
	{
		mount: "rhodes.akn",
		name: "mcp/o11y/oidc-client",
		dataJson: pulumi.jsonStringify({
			client_id: mcpO11yOidcClient.id,
			client_secret: mcpO11yOidcSecret.secret,
		}),
		customMetadata: {
			data: {
				description: "mcp-o11y vMCP OIDC client (Pocket-Id)",
				application: "mcp",
				...vaultSecretMetadata(mcpO11yOidcSecret),
			},
		},
	},
	{ parent: mcpO11yOidcSecret },
);

const mcpO11yHmac = new random.RandomPassword("password-mcp-o11y-hmac", {
	length: 64,
	special: false,
});

new vault.kv.SecretV2(
	"mcp-o11y-auth-server-vault-secret",
	{
		mount: "rhodes.akn",
		name: "mcp/o11y/auth-server",
		dataJson: pulumi.jsonStringify({ hmac: mcpO11yHmac.result }),
		customMetadata: {
			data: {
				description: "mcp-o11y vMCP authorization server HMAC secret",
				application: "mcp",
				...vaultSecretMetadata(mcpO11yHmac),
			},
		},
	},
	{ parent: mcpO11yHmac },
);
