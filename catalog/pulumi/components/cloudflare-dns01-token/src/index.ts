import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";

const ZONE_READ = "c8fed203ed3043cba015a93ad1616f1f"; // Zone Read (Zone)
const ZONE_DNS_EDIT = "4755a26eedb94da69e1066d98aa820be"; // Zone DNS Edit / DNS Write (Zone)

export interface Dns01TokenArgs {
	/** Project or cluster the token belongs to (e.g. "amiya.akn", "chezmoi.sh"). */
	owner: string;
	/** Application/service the token authenticates (e.g. "cert-manager", "caddy-dns01/observability"). */
	application: string;
	/** Cloudflare account ID the token is owned by. */
	accountId: pulumi.Input<string>;
	/** Cloudflare zone ID the token is scoped to. */
	zoneId: pulumi.Input<string>;
}

/**
 * A Cloudflare Account (Owned) API token scoped to Zone Read + DNS Edit on a single
 * zone — exactly the permission shape every ACME DNS-01 solver (cert-manager, Caddy's
 * cloudflare-dns plugin, Home Assistant's built-in ACME, ...) needs to complete a
 * DNS-01 challenge.
 *
 * Uses `cloudflare.AccountToken`, not `cloudflare.ApiToken`: the token is created
 * as an Account (Owned) token (`/accounts/{account_id}/tokens`), a distinct
 * Cloudflare resource from classic User API Tokens (`/user/tokens`) that
 * `cloudflare.ApiToken` targets.
 *
 * Only creates the token. If the consumer expects it in Vault, write it yourself
 * with `vault.kv.SecretV2` alongside this component, parented directly to the
 * component instance (it is itself a valid Pulumi resource) so both share the
 * token's lifecycle — secret placement is the calling stack's decision, not this
 * component's.
 */
export class Dns01TokenComponent extends pulumi.ComponentResource {
	public readonly tokenId: pulumi.Output<string>;
	public readonly tokenValue: pulumi.Output<string>;
	/** URN of the underlying AccountToken — the `pulumi up --replace` target for rotation. */
	public readonly tokenUrn: pulumi.Output<pulumi.URN>;

	constructor(
		name: string,
		args: Dns01TokenArgs,
		opts?: pulumi.ComponentResourceOptions,
	) {
		super("chezmoi:cloudflare:Dns01Token", name, {}, opts);
		const parent: pulumi.ComponentResourceOptions = { parent: this };

		const token = new cloudflare.AccountToken(
			`${name}-token`,
			{
				accountId: args.accountId,
				name: `(${args.owner}) - ${args.application}`,
				policies: [
					{
						effect: "allow",
						permissionGroups: [{ id: ZONE_READ }, { id: ZONE_DNS_EDIT }],
						// args.zoneId may be a secret Output — a plain template literal would
						// interpolate Pulumi's opaque "calling toString on an Output" warning
						// instead of the value, so the JSON must be built inside .apply().
						// AccountTokenPolicy.resources is a JSON string, not an object.
						resources: pulumi.output(args.zoneId).apply((zoneId) =>
							JSON.stringify({
								[`com.cloudflare.api.account.zone.${zoneId}`]: "*",
							}),
						),
					},
				],
			},
			parent,
		);

		this.tokenId = token.id;
		this.tokenValue = token.value;
		this.tokenUrn = token.urn;
		this.registerOutputs({ tokenId: this.tokenId });
	}
}
