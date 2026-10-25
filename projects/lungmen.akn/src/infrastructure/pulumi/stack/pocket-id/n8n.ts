import * as pocketid from "@axnic/pulumi-pocket-id";
import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import { adminGroupId, maisonGroupId } from "./index";

export const n8nOidcClient = new pocketid.OidcClient("n8n", {
  allowedUserGroupIds: [adminGroupId, maisonGroupId],
  name: "Automatisation",
  description: "Workflows et automatisations",
  logo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/n8n-dark.svg"),
  darkLogo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/n8n-light.svg"),
  launchUrl: "https://n8n.chezmoi.sh",
  callbackUrls: ["https://n8n.chezmoi.sh/rest/sso/oidc/callback"],
  isPublic: false,

  // n8n's OIDC login does not send a PKCE challenge: requiring it makes Pocket-Id
  // answer `invalid_request` on /authorize.
  pkceEnabled: false,
  logoutCallbackUrls: [],
  requiresPushedAuthorizationRequests: false,
  requiresReauthentication: false,
  skipConsent: false,
});

const n8nSecret = new pocketid.OidcClientSecret("n8n-secret", {
  clientId: n8nOidcClient.id,
});

new vault.kv.SecretV2(
  "n8n-oidc-vault-secret",
  {
    mount: "lungmen.akn",
    name: "n8n/auth/oidc-client",
    dataJson: pulumi.jsonStringify({
      client_id: n8nOidcClient.id,
      client_secret: n8nSecret.secret,
    }),
    customMetadata: {
      data: {
        description: "n8n OIDC client",
        application: "n8n",
        ...vaultSecretMetadata(n8nSecret),
      },
    },
  },
  { parent: n8nSecret },
);
