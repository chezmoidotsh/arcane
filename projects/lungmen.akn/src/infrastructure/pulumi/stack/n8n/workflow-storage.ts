import * as garage from "@axnic/pulumi-garage";
import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";
import { bucket, bucketName } from "./binary-storage";
import { secretsMount } from "./external-secrets";

// ---------------------------------------------------------------------------
// Garage S3 key for workflows (S3 nodes), separate from the binary storage key
// ---------------------------------------------------------------------------
// Workflows keep their files under `assets/<project>/` in the binary storage
// bucket. Garage grants access per bucket, not per prefix: this key can read
// and write the execution binaries too, it is only separate so it can be
// rotated or revoked without touching n8n's own storage.
const key = new garage.Key("n8n-lungmen-akn-workflow-key", {
  name: "n8n-workflows-lungmen.akn",
});

new garage.BucketKeyPermission("n8n-lungmen-akn-workflow-permission", {
  accessKeyId: key.accessKeyId,
  bucketId: bucket.id,
  permissions: {
    read: true,
    write: true,
  },
});

// Read by the n8n S3 credential through External Secrets, e.g.
// {{ $secrets.vault['garage-workflows'].access_key_id }}.
new vault.kv.SecretV2(
  "n8n-workflow-storage-vault-secret",
  {
    mount: secretsMount.path,
    name: "garage-workflows",
    dataJson: pulumi.jsonStringify({
      access_key_id: key.accessKeyId,
      secret_access_key: key.secretAccessKey,
      region: "fr-par-1",
      endpoint_url: "https://s3.chezmoi.sh",
      bucket: bucketName,
    }),
    customMetadata: {
      data: {
        description: "Garage S3 credentials for n8n workflows (assets/<project>/)",
        application: "n8n",
        ...vaultSecretMetadata(key),
      },
    },
  },
  { parent: key },
);
