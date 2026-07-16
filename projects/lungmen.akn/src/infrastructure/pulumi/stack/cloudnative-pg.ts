import { GarageCloudNativePGObjectStore } from "@chezmoi.sh/pulumi-garage-cnpg-backup";
import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

// ---------------------------------------------------------------------------
// Garage S3 bucket + credentials for CNPG backup object stores (lungmen)
// ---------------------------------------------------------------------------
// Creates a dedicated Garage bucket and access key for CloudNative-PG backups.
// Credentials are pushed to Vault so CNPG picks them up via ExternalSecret.
const component = new GarageCloudNativePGObjectStore("garage-cnpg-backup", {
	projectName: "lungmen.akn",
});

new vault.kv.SecretV2(
	"garage-cnpg-backup-credentials",
	{
		mount: "lungmen.akn",
		name: "cloudnative-pg/objectstore/s3.chezmoi.sh",
		dataJson: pulumi.jsonStringify({
			access_key_id: component.accessKeyId,
			access_secret_key: component.secretAccessKey,
			region: "fr-par-1",
			endpoint_url: "https://s3.chezmoi.sh",
		}),
		customMetadata: {
			data: {
				description: "Garage S3 credentials for CNPG backup object store",
				application: "cloudnative-pg",
				...vaultSecretMetadata(component),
			},
		},
	},
	{ parent: component },
);

export const garageBackupBucket = component.bucketName;
export const garageBackupAccessKeyId = component.accessKeyId;
