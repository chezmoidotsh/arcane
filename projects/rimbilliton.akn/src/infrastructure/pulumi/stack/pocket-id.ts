import {
	AllowedUserGroups,
	OidcClientSecret,
	pocketIdProvider,
} from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@pulumi/pocket-id";
import * as pulumi from "@pulumi/pulumi";

// Groups live in chezmoi.sh (single source of truth).
const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
	name: "organization/chezmoi-sh-infra/chezmoi_sh.live",
});
const adminGroupId = chezmoiSh.getOutput("adminGroupId") as pulumi.Output<string>;

// OIDC client used by oauth2-proxy (NixOS) in front of the Crafty panel.
// Restricted to the `admin` group: being admin in Pocket-Id is what gives
// access to the Minecraft admin panel.
export const minecraftOidcClient = new pocketid.oidc.OidcClients(
	"minecraft",
	{
		name: "Minecraft",
		description: "Panel d'administration du serveur Minecraft",
		launchURL: "https://mc-admin.chezmoi.sh/",
		callbackURLs: ["https://mc-admin.chezmoi.sh/oauth2/callback"],
		logoutCallbackURLs: [],
		isGroupRestricted: true,
		isPublic: false,
		pkceEnabled: true,
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: true,
	},
	{ provider: pocketIdProvider() },
);

new AllowedUserGroups("minecraft-groups", {
	clientId: minecraftOidcClient.id,
	groupIds: [adminGroupId],
});

export const minecraftOidcClientId = minecraftOidcClient.id;
export const minecraftOidcClientSecret = new OidcClientSecret(
	"minecraft-secret",
	{ clientId: minecraftOidcClient.id },
).secret;
