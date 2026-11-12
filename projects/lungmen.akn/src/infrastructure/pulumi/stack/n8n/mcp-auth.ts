import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as vault from "@pulumi/vault";

// HMAC key signing the authorization codes of the n8n MCP proxy (ToolHive embedded authorization
// server, apps/n8n/n8n.mcp.remoteproxy.yaml).
const n8nMcpHmac = new random.RandomPassword("password-n8n-mcp-hmac", {
  length: 64,
  special: false,
});

new vault.kv.SecretV2(
  "n8n-mcp-auth-server-vault-secret",
  {
    mount: "lungmen.akn",
    name: "n8n/mcp/auth-server",
    dataJson: pulumi.jsonStringify({ hmac: n8nMcpHmac.result }),
    customMetadata: {
      data: {
        description: "n8n MCP proxy authorization server HMAC secret",
        application: "n8n",
        ...vaultSecretMetadata(n8nMcpHmac),
      },
    },
  },
  { parent: n8nMcpHmac },
);
