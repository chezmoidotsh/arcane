import { GarageCloudNativePGObjectStore } from "@chezmoi.sh/pulumi-garage-cnpg-backup";

// ---------------------------------------------------------------------------
// Garage S3 bucket + credentials for CNPG backup object stores (amiya)
// ---------------------------------------------------------------------------
// amiya can't depend on Vault for its own backup credentials (chicken-and-egg),
// so the key outputs are exported here for a `mise run` task to sync into SOPS.
const component = new GarageCloudNativePGObjectStore("garage-cnpg-backup", {
	projectName: "amiya.akn",
});

export const garageBackupBucket = component.bucketName;
export const garageBackupAccessKeyId = component.accessKeyId;
export const garageBackupSecretAccessKey = component.secretAccessKey;
