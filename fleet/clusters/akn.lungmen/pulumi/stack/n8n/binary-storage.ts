import * as garage from "@axnic/pulumi-garage";
import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

// ---------------------------------------------------------------------------
// Garage S3 bucket for n8n binary data (external storage, Enterprise)
// ---------------------------------------------------------------------------
// n8n does not prune S3 itself: add a Garage lifecycle rule if the bucket grows.
export const bucketName = "n8n-lungmen-akn";

export const bucket = new garage.Bucket("n8n-lungmen-akn-bucket", {
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
