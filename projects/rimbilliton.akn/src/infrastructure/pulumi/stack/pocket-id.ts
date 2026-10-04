import {
	AllowedUserGroups,
	OidcClientSecret,
	pocketIdProvider,
} from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@pulumi/pocket-id";
import * as pulumi from "@pulumi/pulumi";

// The `admin` group lives in chezmoi.sh (single source of truth).
const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
	name: "organization/chezmoi-sh-infra/chezmoi_sh.live",
});
const adminGroupId = chezmoiSh.getOutput("adminGroupId") as pulumi.Output<string>;

// Members of this group can reach the Crafty panel and run their own Minecraft
// server (create, configure, back up). Add users from the Pocket-Id UI.
export const minecraftGroup = new pocketid.usergroups.UserGroups(
	"minecraft",
	{ name: "minecraft", friendlyName: "Minecraft" },
	{ provider: pocketIdProvider() },
);

// OIDC client used by oauth2-proxy (NixOS) in front of the Crafty panel.
// Restricted to `admin` and `minecraft`: Pocket-Id itself enforces who may log
// in, oauth2-proxy has no group filter of its own.
export const minecraftOidcClient = new pocketid.oidc.OidcClients(
	"minecraft",
	{
		name: "Minecraft",
		description: "Panel d'administration du serveur Minecraft",
		launchURL: "https://minecraft.chezmoi.sh/",
		callbackURLs: ["https://minecraft.chezmoi.sh/oauth2/callback"],
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
	groupIds: [adminGroupId, minecraftGroup.id],
});

export const minecraftGroupId = minecraftGroup.id;
export const minecraftOidcClientId = minecraftOidcClient.id;
export const minecraftOidcClientSecret = new OidcClientSecret(
	"minecraft-secret",
	{ clientId: minecraftOidcClient.id },
).secret;
