import * as garage from "@axnic/pulumi-garage";
import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

// ---------------------------------------------------------------------------
// Garage S3 bucket + credentials for Velero backups (lungmen.akn)
// ---------------------------------------------------------------------------
// Dedicated bucket/key, separate from the CNPG backup bucket (stack/cloudnative-pg.ts):
// Velero's PVC-backup scope is cluster-wide and shouldn't share credentials with
// CNPG's WAL-archiving bucket.
const bucketName = "velero-lungmen-akn";

const bucket = new garage.Bucket("velero-lungmen-akn-bucket", {
	globalAlias: bucketName,
});

const key = new garage.Key("velero-lungmen-akn-key", {
	name: "velero-backup-lungmen.akn",
});

new garage.BucketKeyPermission("velero-lungmen-akn-permission", {
	accessKeyId: key.accessKeyId,
	bucketId: bucket.id,
	permissions: {
		read: true,
		write: true,
	},
});

new vault.kv.SecretV2(
	"velero-backup-credentials",
	{
		mount: "lungmen.akn",
		name: "velero/backup/s3.chezmoi.sh",
		dataJson: pulumi.jsonStringify({
			access_key_id: key.accessKeyId,
			secret_access_key: key.secretAccessKey,
			region: "fr-par-1",
			endpoint_url: "https://s3.chezmoi.sh",
			bucket: bucketName,
		}),
		customMetadata: {
			data: {
				description: "Garage S3 credentials for Velero backup object store",
				application: "velero",
				...vaultSecretMetadata(key),
			},
		},
	},
	{ parent: key },
);

export const veleroBackupBucket = pulumi.output(bucketName);
export const veleroBackupAccessKeyId = key.accessKeyId;
