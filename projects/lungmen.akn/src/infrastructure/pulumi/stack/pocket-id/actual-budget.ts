import { oidcApp } from "@chezmoi.sh/pulumi-lib";

import { maisonGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Actual-budget
// deployment, whose ExternalSecret reads client_id/client_secret straight
// from Vault (lungmen.akn/actual-budget/auth/oidc-client).
export const actualBudgetOidcClient = oidcApp("actual-budget", {
  name: "Gestion du budget",
  description: "Suivi du budget",
  application: "actual-budget",
  launchURL: "https://budget.chezmoi.sh",
  callbackURLs: ["https://budget.chezmoi.sh/openid/callback"],
  groupIds: [maisonGroupId],
}).client;
