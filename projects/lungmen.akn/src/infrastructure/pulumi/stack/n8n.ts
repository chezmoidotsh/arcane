import * as garage from "@axnic/pulumi-garage";
import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as vault from "@pulumi/vault";
import { approle } from "@pulumi/vault";

// N8N_ENCRYPTION_KEY encrypts every credential stored in n8n's database --
// losing or rotating it makes them unreadable, so it must stay stable.
const n8nEncryptionKey = new random.RandomPassword("password-n8n-encryption-key", {
  length: 48,
  special: false,
});

new vault.kv.SecretV2(
  "n8n-encryption-key-vault-secret",
  {
    mount: "lungmen.akn",
    name: "n8n/auth/encryption-key",
    dataJson: pulumi.jsonStringify({
      encryption_key: n8nEncryptionKey.result,
    }),
    customMetadata: {
      data: {
        description: "n8n N8N_ENCRYPTION_KEY -- must stay stable",
        application: "n8n",
        ...vaultSecretMetadata(n8nEncryptionKey),
      },
    },
  },
  { parent: n8nEncryptionKey },
);

// ---------------------------------------------------------------------------
// Garage S3 bucket for n8n binary data (external storage, Enterprise)
// ---------------------------------------------------------------------------
// n8n does not prune S3 itself: add a Garage lifecycle rule if the bucket grows.
const bucketName = "n8n-lungmen-akn";

const bucket = new garage.Bucket("n8n-lungmen-akn-bucket", {
  globalAlias: bucketName,
});

const key = new garage.Key("n8n-lungmen-akn-key", {
  name: "n8n-lungmen.akn",
});

new garage.BucketKeyPermission("n8n-lungmen-akn-permission", {
  accessKeyId: key.accessKeyId,
  bucketId: bucket.id,
  permissions: {
    read: true,
    write: true,
  },
});

new vault.kv.SecretV2(
  "n8n-storage-vault-secret",
  {
    mount: "lungmen.akn",
    name: "n8n/storage/s3.chezmoi.sh",
    dataJson: pulumi.jsonStringify({
      access_key_id: key.accessKeyId,
      secret_access_key: key.secretAccessKey,
      region: "fr-par-1",
      endpoint_url: "https://s3.chezmoi.sh",
      bucket: bucketName,
    }),
    customMetadata: {
      data: {
        description: "Garage S3 credentials for n8n external binary storage",
        application: "n8n",
        ...vaultSecretMetadata(key),
      },
    },
  },
  { parent: key },
);

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

new vault.Mount("n8n-secrets-mount", {
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
