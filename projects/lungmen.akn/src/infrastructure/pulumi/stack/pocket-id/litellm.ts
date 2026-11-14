import * as pocketid from "@axnic/pulumi-pocket-id";
import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import { adminGroupId } from "./index";

// LiteLLM's SSO is free up to 5 users: only admins can sign in.
export const litellmOidcClient = new pocketid.OidcClient("litellm", {
  allowedUserGroupIds: [adminGroupId],
  name: "Passerelle LLM",
  description: "Passerelle et clés d'accès aux modèles de langage",
  logo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/litellm.svg"),
  launchUrl: "https://llm.lab.chezmoi.sh",
  callbackUrls: ["https://llm.lab.chezmoi.sh/sso/callback"],
  isPublic: false,
  pkceEnabled: false,
  logoutCallbackUrls: [],
  requiresPushedAuthorizationRequests: false,
  requiresReauthentication: false,
  skipConsent: false,
});

const litellmSecret = new pocketid.OidcClientSecret("litellm-secret", {
  clientId: litellmOidcClient.id,
});

new vault.kv.SecretV2(
  "litellm-oidc-vault-secret",
  {
    mount: "lungmen.akn",
    name: "litellm/auth/oidc-client",
    dataJson: pulumi.jsonStringify({
      client_id: litellmOidcClient.id,
      client_secret: litellmSecret.secret,
    }),
    customMetadata: {
      data: {
        description: "LiteLLM OIDC client",
        application: "litellm",
        ...vaultSecretMetadata(litellmSecret),
      },
    },
  },
  { parent: litellmSecret },
);
