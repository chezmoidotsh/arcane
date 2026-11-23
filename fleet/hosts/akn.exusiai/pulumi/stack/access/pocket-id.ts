import * as pocketid from "@axnic/pulumi-pocket-id";

// The `admin` group is managed by the base stack (single source of truth): it is looked up by name.
const adminGroupId = pocketid.getUserGroupOutput({ name: "admin" }).userGroupId;

// Members of this group can sign in to the Pelican panel and run their own
// Minecraft server (create, configure, back up). Add users from the Pocket-Id UI.
const minecraftGroup = new pocketid.UserGroup(
	"minecraft",
	{ name: "minecraft", friendlyName: "Minecraft" },
);

// Id of the OIDC client Pelican is configured with. It is an input of the resource: without it
// Pulumi would REPLACE the client (and its secret) with one that has a new id.
const minecraftClientUuid = "daf37fa0-3508-47d0-8dee-7180e8bd9437";

// OIDC client used by Pelican's "Pocket ID Provider" plugin to sign users in.
// Restricted to `admin` and `minecraft`: Pocket-Id itself enforces who may log
// in, Pelican has no group filter of its own.
const minecraftOidcClient = new pocketid.OidcClient(
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
);

// The pre-existing secret was not imported: Pulumi never touches it. This one
// is generated on the first `pulumi up` and REPLACES it in Pocket-Id; stack/nix-secrets.ts
// writes the new value into the NixOS secrets (redeploy the host to pick it up).
const minecraftOidcClientSecretResource = new pocketid.OidcClientSecret(
	"minecraft-secret",
	{ clientId: minecraftOidcClient.id },
);

export const minecraftOidcClientId = minecraftOidcClient.id;
export const minecraftOidcClientSecret = minecraftOidcClientSecretResource.secret;
