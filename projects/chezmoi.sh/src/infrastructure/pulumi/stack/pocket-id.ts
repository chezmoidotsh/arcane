import * as pocketid from "@pulumi/pocket-id";
import * as pulumi from "@pulumi/pulumi";

// Pocket-Id is the SSO provider for every cluster/app in this homelab.
// baseUrl/apiKeyHeader are non-secret connection details, set via Pulumi
// config (`pulumi config set pocket-id-api:baseUrl/apiKeyHeader`) rather than
// hardcoded here. The API key itself needs an admin key that Pocket-Id has no
// way to issue without one already existing -- so it comes from
// POCKET_ID_API_KEY, set inline for the single `pulumi` invocation that needs
// it (e.g. from the manually-created key stored in Vault at
// shared/third-parties/pocket-id) rather than Pulumi config, which would
// commit it -- encrypted or not -- to the git-tracked stack file.
const pocketIdConfig = new pulumi.Config("pocket-id-api");

const apiKey = process.env.POCKET_ID_API_KEY;
if (!apiKey) {
	throw new Error(
		"POCKET_ID_API_KEY must be set to manage Pocket-Id resources",
	);
}

const provider = new pocketid.Provider("pocket-id", {
	baseUrl: pocketIdConfig.require("baseUrl"),
	apiKeyHeader: pocketIdConfig.require("apiKeyHeader"),
	apiKey: pulumi.secret(apiKey),
});

// Groups shared across every cluster: Vault, ArgoCD and every app below bind
// their access policies to these group names via OIDC group claims. Which OIDC
// clients each group is allowed to sign into is managed by hand in the Pocket-Id
// UI -- the generated SDK exposes that relationship (allowedUserGroups /
// allowedOidcClients) as read-only on both resources, so Pulumi can't own it.
export const adminGroup = new pocketid.usergroups.UserGroups(
	"admin",
	{ name: "admin", friendlyName: "Administrateur" },
	{ provider },
);

export const maisonGroup = new pocketid.usergroups.UserGroups(
	"maison",
	{ name: "maison", friendlyName: "Maison" },
	{ provider },
);

export const familleGroup = new pocketid.usergroups.UserGroups(
	"famille",
	{ name: "famille", friendlyName: "Famille" },
	{ provider },
);
