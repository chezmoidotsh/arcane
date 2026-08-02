import * as pocketid from "@pulumi/pocket-id";
import * as pulumi from "@pulumi/pulumi";

// Pocket-Id is the SSO provider for every cluster/app in this homelab. One
// provider instance per Pulumi program, cached at module scope so every
// oidcApp() call in the same program shares it instead of each call site
// wiring its own bootstrap.
//
// baseUrl/apiKeyHeader are non-secret connection details, set via Pulumi
// config (`pulumi config set pocket-id-api:baseUrl/apiKeyHeader`) rather
// than hardcoded here. The API key itself needs an admin key that Pocket-Id
// has no way to issue without one already existing -- so it comes from
// POCKET_ID_API_KEY, set inline for the single `pulumi` invocation that
// needs it, never from Pulumi config, which would commit it -- encrypted or
// not -- to the git-tracked stack file.
let cachedProvider: pocketid.Provider | undefined;

/**
 * The shared `pocket-id-api` provider for this Pulumi program. Cached at
 * module scope so every oidcApp() (and any other Pocket-Id resource, e.g.
 * chezmoi.sh's shared UserGroups) in the same program shares one instance.
 */
export function pocketIdProvider(): pocketid.Provider {
	if (cachedProvider) {
		return cachedProvider;
	}

	const config = new pulumi.Config("pocket-id-api");
	const apiKey = process.env.POCKET_ID_API_KEY;
	if (!apiKey) {
		throw new Error(
			"POCKET_ID_API_KEY must be set to manage Pocket-Id resources",
		);
	}

	cachedProvider = new pocketid.Provider("pocket-id", {
		baseUrl: config.require("baseUrl"),
		apiKeyHeader: config.require("apiKeyHeader"),
		apiKey: pulumi.secret(apiKey),
	});
	return cachedProvider;
}

// Client logos: Pocket-Id fetches the image from this URL once and stores
// it -- it never returns the URL back on a later read, so this is a
// one-way "set" (see the `ignoreChanges` in oidcApp() below), not something
// synced from live state. Sourced from selfh.st/icons (served via
// jsdelivr); fall back to dashboardicons.com for an app selfh.st doesn't
// cover.
const iconUrl = (application: string, variant: "light" | "dark") =>
	`https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/${application}-${variant}.svg`;

const defaultClientArgs = {
	logoutCallbackURLs: [] as string[],
	isPublic: false,
	pkceEnabled: true,
	requiresPushedAuthorizationRequests: false,
	requiresReauthentication: false,
	skipConsent: false,
};

export interface OidcAppArgs {
	/** Display name shown on the Pocket-Id login screen. */
	name: pulumi.Input<string>;
	/** Short description shown alongside the name. */
	description: pulumi.Input<string>;
	/** OIDC redirect URIs the app accepts a login callback on. */
	callbackURLs: pulumi.Input<string>[];
	/** "Launch" link shown on Pocket-Id's app tile, if the app has one. */
	launchURL?: pulumi.Input<string>;
	/** selfh.st/icons slug -- drives the light/dark logo, independent of `name`. */
	application: string;
	/** Pocket-Id group IDs allowed to sign in. Omit to leave unrestricted. */
	groupIds?: pulumi.Input<string>[];
	/** Escape hatch for the rare client that needs a non-default OidcClients field. */
	overrides?: Partial<pocketid.oidc.OidcClientsArgs>;
}

/**
 * A Pocket-Id OIDC client ("app" in the Pocket-Id UI), with its light/dark
 * logo and (optionally) which groups may sign into it. Every field not
 * listed in OidcAppArgs keeps the same default across every app in this
 * homelab -- pass `overrides` for the rare client that genuinely needs one
 * of them different (e.g. Forgejo's `pkceEnabled: false`).
 *
 * A plain factory function, not a `pulumi.ComponentResource`: the
 * generated `pocket-id-api` provider doesn't support being used for a
 * resource parented under a component (its bridged type-token resolution
 * breaks on the combined "parent$child" token) -- confirmed by trying it.
 * The `client` resource this returns is flat/unparented, same as before
 * this helper existed, so no `aliases` dance is needed when adopting an
 * already-imported client into it.
 */
export function oidcApp(
	name: string,
	args: OidcAppArgs,
): { client: pocketid.oidc.OidcClients } {
	const provider = pocketIdProvider();

	const client = new pocketid.oidc.OidcClients(
		name,
		{
			...defaultClientArgs,
			isGroupRestricted: args.groupIds !== undefined,
			name: args.name,
			description: args.description,
			callbackURLs: args.callbackURLs,
			launchURL: args.launchURL,
			logoUrl: iconUrl(args.application, "light"),
			darkLogoUrl: iconUrl(args.application, "dark"),
			...args.overrides,
		},
		{ provider, ignoreChanges: ["logoUrl", "darkLogoUrl"] },
	);

	if (args.groupIds !== undefined) {
		// No `provider` option here: a dynamic.Resource has its own built-in
		// "pulumi-nodejs" provider (the serialized closure below IS the
		// provider) -- passing pocketIdProvider() as opts.provider routes it
		// through the wrong provider entirely and breaks resource type
		// resolution ("unknown resource type pulumi-nodejs:dynamic:Resource").
		new AllowedUserGroups(`${name}-groups`, {
			clientId: client.id,
			groupIds: args.groupIds,
		});
	}

	return { client };
}

// -----------------------------------------------------------------------------
// Group <-> client binding
// -----------------------------------------------------------------------------
// The generated SDK exposes allowedUserGroups/allowedOidcClients as
// read-only on both OidcClients and UserGroups -- there's no way to set this
// relationship through either resource. Pocket-Id's own API does have a
// dedicated endpoint for it (PUT .../allowed-user-groups) that just isn't
// wrapped by the generator, so this is a small dynamic provider calling it
// directly. Confirmed against the live API: idempotent (PUT the same list
// back is a no-op) and the response doesn't echo the groups back, so there's
// nothing to `read` back -- diff is a plain set comparison.
interface AllowedUserGroupsInputs {
	clientId: string;
	groupIds: string[];
}

interface AllowedUserGroupsArgs {
	clientId: pulumi.Input<string>;
	groupIds: pulumi.Input<string>[];
}

async function putAllowedUserGroups(
	clientId: string,
	groupIds: string[],
): Promise<void> {
	const config = new pulumi.Config("pocket-id-api");
	const apiKey = process.env.POCKET_ID_API_KEY;
	if (!apiKey) {
		throw new Error(
			"POCKET_ID_API_KEY must be set to manage Pocket-Id resources",
		);
	}

	const response = await fetch(
		`${config.require("baseUrl")}/api/oidc/clients/${clientId}/allowed-user-groups`,
		{
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				[config.require("apiKeyHeader")]: apiKey,
			},
			body: JSON.stringify({ userGroupIds: groupIds }),
		},
	);
	if (!response.ok) {
		throw new Error(
			`Failed to set allowed user groups for client ${clientId}: HTTP ${response.status}`,
		);
	}
}

export const sameIds = (a: string[], b: string[]) =>
	JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const allowedUserGroupsProvider: pulumi.dynamic.ResourceProvider<
	AllowedUserGroupsInputs,
	AllowedUserGroupsInputs
> = {
	async diff(_id, olds, news) {
		return {
			changes:
				olds.clientId !== news.clientId ||
				!sameIds(olds.groupIds, news.groupIds),
		};
	},
	async create(inputs) {
		await putAllowedUserGroups(inputs.clientId, inputs.groupIds);
		return { id: inputs.clientId, outs: inputs };
	},
	async update(_id, _olds, news) {
		await putAllowedUserGroups(news.clientId, news.groupIds);
		return { outs: news };
	},
	async delete(_id, props) {
		await putAllowedUserGroups(props.clientId, []);
	},
};

class AllowedUserGroups extends pulumi.dynamic.Resource {
	constructor(
		name: string,
		props: AllowedUserGroupsArgs,
		opts?: pulumi.CustomResourceOptions,
	) {
		super(allowedUserGroupsProvider, name, props, opts);
	}
}
