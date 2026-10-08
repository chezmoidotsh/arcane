import * as pocketid from "@axnic/pulumi-pocket-id";
import * as pulumi from "@pulumi/pulumi";

// Both objects below were created by hand in the Pocket-Id UI before this
// stack managed them, and the client is the one Pelican already signs in with.
// They are therefore IMPORTED, never created: their ids come from the stack
// config so that `pulumi preview` fails loudly (missing config) instead of
// silently creating a second group/client. See docs/BOOTSTRAP.md, step 2, for
// the one-off import procedure.
const config = new pulumi.Config();
const minecraftGroupUuid = config.require("pocketIdMinecraftGroupId");
const minecraftClientUuid = config.require("pocketIdMinecraftClientId");

// The `admin` group lives in chezmoi.sh (single source of truth).
const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
	name: "organization/chezmoi-sh-infra/chezmoi_sh.live",
});
const adminGroupId = chezmoiSh.getOutput(
	"adminGroupId",
) as pulumi.Output<string>;

// Members of this group can sign in to the Pelican panel and run their own
// Minecraft server (create, configure, back up). Add users from the Pocket-Id UI.
export const minecraftGroup = new pocketid.UserGroup(
	"minecraft",
	{ name: "minecraft", friendlyName: "Minecraft" },
	{ import: minecraftGroupUuid },
);

// OIDC client used by Pelican's "Pocket ID Provider" plugin to sign users in.
// Restricted to `admin` and `minecraft`: Pocket-Id itself enforces who may log
// in, Pelican has no group filter of its own.
//
// Deliberately NO `OidcClientSecret` here: creating one generates a new secret
// and invalidates the one Pelican reads from SOPS
// (`oauth_pocketid_client_secret`), which would break the login until the host
// secret is rotated.
export const minecraftOidcClient = new pocketid.OidcClient(
	"minecraft",
	{
		clientId: minecraftClientUuid,
		allowedUserGroupIds: [adminGroupId, minecraftGroup.id],
		name: "Minecraft",
		description: "Panel Pelican du serveur Minecraft",
		launchUrl: "https://minecraft.chezmoi.sh/",
		callbackUrls: ["https://minecraft.chezmoi.sh/auth/oauth/callback/pocketid"],
		logoutCallbackUrls: [],
		isPublic: false,
		pkceEnabled: false, // Pelican's Pocket ID plugin sends no PKCE code challenge
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: true,
	},
	{ import: minecraftClientUuid },
);

export const minecraftGroupId = minecraftGroup.id;
export const minecraftOidcClientId = minecraftOidcClient.id;
