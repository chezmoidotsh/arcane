import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";
import { approle } from "@pulumi/vault";

// ---------------------------------------------------------------------------
// External secrets: dedicated read-only KV mount + AppRole for n8n
// ---------------------------------------------------------------------------
// n8n lists the whole mount it is pointed at, so it gets its own mount instead
// of a sub-path of `lungmen.akn/`. The provider itself is configured in the
// n8n UI (Settings > External Secrets > HashiCorp Vault, AppRole auth, KV v2,
// mount `n8n.chezmoi.sh`): role_id/secret_id are in
// `lungmen.akn/n8n/external-secrets/approle`. Secrets are written to the mount
// by hand (`bao kv put n8n.chezmoi.sh/<name> value=...`).
const secretsMountPath = "n8n.chezmoi.sh";

export const secretsMount = new vault.Mount("n8n-secrets-mount", {
  path: secretsMountPath,
  type: "kv",
  description: "Secrets read by n8n through its External Secrets feature",
  options: { version: "2" },
});

const approleBackend = new vault.AuthBackend("n8n-approle-backend", {
  type: "approle",
  // n8n hardcodes `auth/approle/login`: a custom mount path makes the login fail.
  path: "approle",
  description: "AppRole auth for the n8n External Secrets feature",
});

const secretsPolicy = new vault.Policy("n8n-secrets-policy", {
  name: `${secretsMountPath}-external-secrets`,
  policy: `
path "${secretsMountPath}/data/*" { capabilities = ["read"] }
path "${secretsMountPath}/metadata" { capabilities = ["list"] }
path "${secretsMountPath}/metadata/*" { capabilities = ["read", "list"] }
`,
});

const approleRole = new approle.AuthBackendRole("n8n-approle-role", {
  backend: approleBackend.path,
  roleName: "n8n",
  tokenPolicies: [secretsPolicy.name],
  tokenTtl: 3600,
  tokenMaxTtl: 14400,
});

const approleSecretId = new approle.AuthBackendRoleSecretId("n8n-approle-secret-id", {
  backend: approleBackend.path,
  roleName: approleRole.roleName,
});

new vault.kv.SecretV2(
  "n8n-external-secrets-approle-vault-secret",
  {
    mount: "lungmen.akn",
    name: "n8n/external-secrets/approle",
    dataJson: pulumi.jsonStringify({
      role_id: approleRole.roleId,
      secret_id: approleSecretId.secretId,
    }),
    customMetadata: {
      data: {
        description: "AppRole credentials for n8n External Secrets (OpenBao)",
        application: "n8n",
        ...vaultSecretMetadata(approleSecretId),
      },
    },
  },
  { parent: approleSecretId },
);
