import { oidcApp } from "@chezmoi.sh/pulumi-lib";

import { adminGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Vault deployment.
export const vaultOidcClient = oidcApp("vault", {
  name: "Vault",
  description: "Coffre-fort de secrets",
  // The app running is OpenBao (a Vault fork); the client is named "Vault"
  // for protocol/UI-compat reasons, so use OpenBao's icon, not a nonexistent
  // "vault" one.
  application: "openbao",
  launchURL: "https://vault.chezmoi.sh/ui/vault/auth?with=pocket-id%2F",
  callbackURLs: [
    "https://vault.chezmoi.sh/ui/vault/auth/pocket-id/oidc/callback",
    "http://localhost:8250/oidc/callback",
  ],
  groupIds: [adminGroupId],
}).client;
