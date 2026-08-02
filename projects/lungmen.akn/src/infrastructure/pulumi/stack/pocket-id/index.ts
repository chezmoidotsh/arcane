import * as pocketid from "@pulumi/pocket-id";
import * as pulumi from "@pulumi/pulumi";

// The OIDC clients this cluster's apps authenticate against, one file per
// application below.
//
// baseUrl/apiKeyHeader are non-secret connection details, set via Pulumi
// config (`pulumi config set pocket-id-api:baseUrl/apiKeyHeader`) rather than
// hardcoded here. The API key itself comes from POCKET_ID_API_KEY, set inline
// for the single `pulumi` invocation that needs it, never from Pulumi config,
// which would commit it -- encrypted or not -- to the git-tracked stack file.
const pocketIdConfig = new pulumi.Config("pocket-id-api");

const pocketIdApiKey = process.env.POCKET_ID_API_KEY;
if (!pocketIdApiKey) {
	throw new Error(
		"POCKET_ID_API_KEY must be set to manage Pocket-Id resources",
	);
}

export const pocketIdProvider = new pocketid.Provider("pocket-id", {
	baseUrl: pocketIdConfig.require("baseUrl"),
	apiKeyHeader: pocketIdConfig.require("apiKeyHeader"),
	apiKey: pulumi.secret(pocketIdApiKey),
});

// Client logos: Pocket-Id fetches the image from this URL once and stores
// it -- it never returns the URL back on a later read, so this is a one-way
// "set", not something synced from live state (each client's `ignoreChanges`
// keeps it from being re-sent on every apply once set). Sourced from
// selfh.st/icons (served via jsdelivr, confirmed to have both `-light` and
// `-dark` variants for every app referenced below); fall back to
// dashboardicons.com for any future app selfh.st doesn't cover.
export const appIconUrl = (name: string, variant: "light" | "dark") =>
	`https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/${name}-${variant}.svg`;

export * from "./actual-budget";
export * from "./forgejo";
export * from "./immich";
export * from "./jellyfin";
export * from "./linkding";
export * from "./paperless-ngx";
