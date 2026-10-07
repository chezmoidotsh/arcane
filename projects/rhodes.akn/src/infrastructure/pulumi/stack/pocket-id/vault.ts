import * as pocketid from "@axnic/pulumi-pocket-id";
import * as pulumi from "@pulumi/pulumi";

import { adminGroupId } from "./index";

// Imported from Pocket-Id (auth.chezmoi.sh) rather than created here -- this
// client already exists and is already in use by the live Vault deployment.
export const vaultOidcClient = new pocketid.OidcClient(
	"vault",
	{
		clientId: "762ac35a-f6ea-4831-ab61-a7e923e4b5cf",
		allowedUserGroupIds: [adminGroupId],
		name: "Vault",
		description: "Coffre-fort de secrets",
		// The app running is OpenBao (a Vault fork); the client is named
		// "Vault" for protocol/UI-compat reasons, so use OpenBao's icon, not a
		// nonexistent "vault" one.
		logo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/openbao-dark.svg"),
		darkLogo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/openbao-light.svg"),
		launchUrl: "https://vault.chezmoi.sh/ui/vault/auth?with=pocket-id%2F",
		callbackUrls: [
			"https://vault.chezmoi.sh/ui/vault/auth/pocket-id/oidc/callback",
			"http://localhost:8250/oidc/callback",
		],
		isPublic: false,
		pkceEnabled: true,
		logoutCallbackUrls: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
);
