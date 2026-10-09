import * as pocketid from "@axnic/pulumi-pocket-id";
import * as pulumi from "@pulumi/pulumi";

// Both objects below were created by hand in the Pocket-Id UI before this
// stack managed them, and the client is the one Pelican already signs in with.
// They are therefore IMPORTED (Pulumi `import` option), never created. The
// option is a no-op once the resources are in the state.
const minecraftGroupUuid = "63433895-1598-4755-88fd-be11da3c225c";
const minecraftClientUuid = "daf37fa0-3508-47d0-8dee-7180e8bd9437";

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

// The pre-existing secret was not imported: Pulumi never touches it. This one
// is generated on the first `pulumi up` and REPLACES it in Pocket-Id, so
// `oauth_pocketid_client_secret` in the NixOS SOPS file must be updated right
// after (docs/BOOTSTRAP.md, step 2).
const minecraftOidcClientSecretResource = new pocketid.OidcClientSecret(
	"minecraft-secret",
	{ clientId: minecraftOidcClient.id },
);

export const minecraftGroupId = minecraftGroup.id;
export const minecraftOidcClientId = minecraftOidcClient.id;
export const minecraftOidcClientSecret = minecraftOidcClientSecretResource.secret;
