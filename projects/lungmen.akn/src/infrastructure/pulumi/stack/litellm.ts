import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as vault from "@pulumi/vault";

// The master key is the admin API key (and the fallback login when SSO is down).
// The salt key encrypts the provider credentials stored in the database: losing
// or rotating it makes them unreadable, so it must stay stable.
const masterKey = new random.RandomPassword("password-litellm-master-key", {
  length: 48,
  special: false,
});

const saltKey = new random.RandomPassword("password-litellm-salt-key", {
  length: 48,
  special: false,
});

new vault.kv.SecretV2(
  "litellm-keys-vault-secret",
  {
    mount: "lungmen.akn",
    name: "litellm/auth/keys",
    dataJson: pulumi.jsonStringify({
      // LiteLLM requires the master key to start with `sk-`.
      master_key: pulumi.interpolate`sk-${masterKey.result}`,
      salt_key: saltKey.result,
    }),
    customMetadata: {
      data: {
        description: "LiteLLM master key and salt key -- the salt key must stay stable",
        application: "litellm",
        ...vaultSecretMetadata(masterKey),
      },
    },
  },
  { parent: masterKey },
);
