import * as pocketid from "@pulumi/pocket-id";
import * as pulumi from "@pulumi/pulumi";

// Pocket-Id is the SSO provider for every cluster/app in this homelab. One
// provider instance per Pulumi program, cached at module scope so every
// call site in the same program shares it instead of each one wiring its
// own bootstrap.
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
 * module scope so every Pocket-Id resource in the same program (OidcClients,
 * UserGroups, ...) shares one instance.
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
			`Failed to set allowed user groups for client ${clientId}: HTTP ${response.status}: ${await response.text()}`,
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

/**
 * Binds a Pocket-Id client to the groups allowed to sign into it.
 *
 * Provider limitation: this can't be parented to the real `pocket-id-api`
 * provider (`opts.provider: pocketIdProvider()`) -- tried it, and it breaks
 * with "unknown resource type pulumi-nodejs:dynamic:Resource". A
 * `dynamic.Resource` has its own built-in "pulumi-nodejs" provider (the
 * serialized closure above IS the provider); routing it through the
 * generated openapi-bridge provider instead breaks resource type
 * resolution, because that provider has no idea what a `dynamic:Resource`
 * is. So this resource stays on Pulumi's default dynamic-provider plumbing,
 * unparented to `pocketIdProvider()`. Issue 1170 tracks replacing the
 * generated provider with a native one that wraps this endpoint properly.
 */
export class AllowedUserGroups extends pulumi.dynamic.Resource {
	constructor(
		name: string,
		props: AllowedUserGroupsArgs,
		opts?: pulumi.CustomResourceOptions,
	) {
		super(allowedUserGroupsProvider, name, props, opts);
	}
}

// -----------------------------------------------------------------------------
// Client secret
// -----------------------------------------------------------------------------
// Pocket-Id never returns a client secret after creation, but the same
// `POST /api/oidc/clients/{id}/secret` endpoint that lets you set one also
// generates one server-side when the body is empty and echoes it back in the
// response -- unlike a Pulumi-generated `random.RandomPassword`, this doesn't
// add a second source of randomness for something the target service already
// does correctly.
interface OidcClientSecretArgs {
	clientId: pulumi.Input<string>;
}

async function generateOidcClientSecret(clientId: string): Promise<string> {
	const config = new pulumi.Config("pocket-id-api");
	const apiKey = process.env.POCKET_ID_API_KEY;
	if (!apiKey) {
		throw new Error(
			"POCKET_ID_API_KEY must be set to manage Pocket-Id resources",
		);
	}

	const response = await fetch(
		`${config.require("baseUrl")}/api/oidc/clients/${clientId}/secret`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				[config.require("apiKeyHeader")]: apiKey,
			},
			body: JSON.stringify({}),
		},
	);
	if (!response.ok) {
		throw new Error(
			`Failed to generate the secret for client ${clientId}: HTTP ${response.status}: ${await response.text()}`,
		);
	}
	return ((await response.json()) as { secret: string }).secret;
}

const oidcClientSecretProvider: pulumi.dynamic.ResourceProvider<
	{ clientId: string },
	{ clientId: string; secret: string }
> = {
	async diff(_id, olds, news) {
		const changes = olds.clientId !== news.clientId;
		return { changes, replaces: changes ? ["clientId"] : [] };
	},
	async create(inputs) {
		const secret = await generateOidcClientSecret(inputs.clientId);
		return { id: inputs.clientId, outs: { clientId: inputs.clientId, secret } };
	},
};

/**
 * Generates a Pocket-Id client secret and exposes it as `.secret`. There's
 * nothing to update once created (the only input is `clientId`); rotate with
 * `pulumi up --replace` on this resource, which deletes then recreates it,
 * hitting the endpoint again for a fresh value -- same command
 * `vaultSecretMetadata()` documents in its `x-renewal-cmd` metadata.
 *
 * Same provider limitation as {@link AllowedUserGroups}: stays unparented to
 * `pocketIdProvider()`, see its docstring for why.
 */
export class OidcClientSecret extends pulumi.dynamic.Resource {
	public declare readonly secret: pulumi.Output<string>;

	constructor(
		name: string,
		props: OidcClientSecretArgs,
		opts?: pulumi.CustomResourceOptions,
	) {
		super(
			oidcClientSecretProvider,
			name,
			{ ...props, secret: undefined },
			{ ...opts, additionalSecretOutputs: ["secret"] },
		);
	}
}
