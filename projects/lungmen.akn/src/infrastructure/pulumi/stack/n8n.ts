import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as vault from "@pulumi/vault";

// N8N_ENCRYPTION_KEY encrypts every credential stored in n8n's database --
// losing or rotating it makes them unreadable, so it must stay stable.
const n8nEncryptionKey = new random.RandomPassword(
	"password-n8n-encryption-key",
	{
		length: 48,
		special: false,
	},
);

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
