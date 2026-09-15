import * as garage from "@axnic/pulumi-garage";
import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as vault from "@pulumi/vault";

// ---------------------------------------------------------------------------
// Garage S3 bucket + credentials for Homebox item photos/attachments
// ---------------------------------------------------------------------------
const bucketName = "homebox-lungmen-akn";

const bucket = new garage.Bucket("homebox-lungmen-akn-bucket", {
	globalAlias: bucketName,
});

const key = new garage.Key("homebox-lungmen-akn-key", {
	name: "homebox-storage-lungmen.akn",
});

new garage.BucketKeyPermission("homebox-lungmen-akn-permission", {
	accessKeyId: key.accessKeyId,
	bucketId: bucket.id,
	permissions: {
		read: true,
		write: true,
	},
});

new vault.kv.SecretV2(
	"homebox-storage-credentials",
	{
		mount: "lungmen.akn",
		name: "homebox/storage/s3.chezmoi.sh",
		dataJson: pulumi.jsonStringify({
			access_key_id: key.accessKeyId,
			secret_access_key: key.secretAccessKey,
			region: "fr-par-1",
			endpoint_url: "https://s3.chezmoi.sh",
			bucket: bucketName,
		}),
		customMetadata: {
			data: {
				description: "Garage S3 credentials for Homebox item photo storage",
				application: "homebox",
				...vaultSecretMetadata(key),
			},
		},
	},
	{ parent: key },
);

// ---------------------------------------------------------------------------
// HBOX_AUTH_API_KEY_PEPPER -- stable secret, HMAC-keyed into API key hashes
// ---------------------------------------------------------------------------
const homeboxAuthPepper = new random.RandomPassword(
	"password-homebox-auth-pepper",
	{
		length: 48,
		special: false,
	},
);

new vault.kv.SecretV2(
	"homebox-auth-pepper-vault-secret",
	{
		mount: "lungmen.akn",
		name: "homebox/auth/api-key-pepper",
		dataJson: pulumi.jsonStringify({
			pepper: homeboxAuthPepper.result,
		}),
		customMetadata: {
			data: {
				description: "Homebox HBOX_AUTH_API_KEY_PEPPER -- must stay stable",
				application: "homebox",
				...vaultSecretMetadata(homeboxAuthPepper),
			},
		},
	},
	{ parent: homeboxAuthPepper },
);
