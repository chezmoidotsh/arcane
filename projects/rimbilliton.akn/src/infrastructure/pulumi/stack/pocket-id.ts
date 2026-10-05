// DISABLED: the Pocket-Id Pulumi provider (`@pulumi/pocket-id`, generated from
// https://pocket-id.org/swagger.yaml by pulumi-openapi-provider) is no longer
// functional. The provider rediscovers its resources from the live, unversioned
// spec on every run, which now yields flat `pocket-id-api:index:*` types, so the
// committed SDK's tokens (`pocket-id-api:usergroups:UserGroups`, ...) fail with
// `unknown resource type`. Its plugin is also not served by get.pulumi.com
// (403), only by GitHub releases.
//
// Until the provider is fixed or replaced by a native one (issue #1170), the
// `minecraft` group and OIDC client must be created by hand in the Pocket-Id UI.
// Nothing else in this stack reads the outputs below. Restore the code as-is
// once the provider works again (and uncomment the export in ../index.ts).
//
// import {
// 	AllowedUserGroups,
// 	OidcClientSecret,
// 	pocketIdProvider,
// } from "@chezmoi.sh/pulumi-lib";
// import * as pocketid from "@pulumi/pocket-id";
// import * as pulumi from "@pulumi/pulumi";
//
// // The `admin` group lives in chezmoi.sh (single source of truth).
// const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
// 	name: "organization/chezmoi-sh-infra/chezmoi_sh.live",
// });
// const adminGroupId = chezmoiSh.getOutput(
// 	"adminGroupId",
// ) as pulumi.Output<string>;
//
// // Members of this group can sign in to the Pelican panel and run their own
// // Minecraft server (create, configure, back up). Add users from the Pocket-Id UI.
// export const minecraftGroup = new pocketid.usergroups.UserGroups(
// 	"minecraft",
// 	{ name: "minecraft", friendlyName: "Minecraft" },
// 	{ provider: pocketIdProvider() },
// );
//
// // OIDC client used by Pelican's "Pocket ID Provider" plugin to sign users in.
// // Restricted to `admin` and `minecraft`: Pocket-Id itself enforces who may log
// // in, Pelican has no group filter of its own. The callback URL below is a
// // placeholder: use the redirect URL shown in Pelican's Settings > OAuth tab
// // (see docs/BOOTSTRAP.md, step 6).
// export const minecraftOidcClient = new pocketid.oidc.OidcClients(
// 	"minecraft",
// 	{
// 		name: "Minecraft",
// 		description: "Panel Pelican du serveur Minecraft",
// 		launchURL: "https://minecraft.chezmoi.sh/",
// 		callbackURLs: ["https://minecraft.chezmoi.sh/"], // placeholder, see above
// 		logoutCallbackURLs: [],
// 		isGroupRestricted: true,
// 		isPublic: false,
// 		pkceEnabled: false, // Pelican's Pocket ID plugin sends no PKCE code challenge
// 		requiresPushedAuthorizationRequests: false,
// 		requiresReauthentication: false,
// 		skipConsent: true,
// 	},
// 	{ provider: pocketIdProvider() },
// );
//
// new AllowedUserGroups("minecraft-groups", {
// 	clientId: minecraftOidcClient.id,
// 	groupIds: [adminGroupId, minecraftGroup.id],
// });
//
// export const minecraftGroupId = minecraftGroup.id;
// export const minecraftOidcClientId = minecraftOidcClient.id;
// export const minecraftOidcClientSecret = new OidcClientSecret(
// 	"minecraft-secret",
// 	{ clientId: minecraftOidcClient.id },
// ).secret;
