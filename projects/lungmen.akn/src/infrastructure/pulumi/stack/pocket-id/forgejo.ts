import { oidcApp } from "@chezmoi.sh/pulumi-lib";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Forgejo deployment,
// whose ExternalSecret reads client_id/client_secret straight from Vault
// (lungmen.akn/forgejo/auth/oidc-client). Not group-restricted.
export const forgejoOidcClient = oidcApp("forgejo", {
  name: "Forgejo",
  description: "Hébergement Git",
  application: "forgejo",
  launchURL: "https://git.chezmoi.sh",
  callbackURLs: ["https://git.chezmoi.sh/user/oauth2/auth.chezmoi.sh/callback"],
}).client;
