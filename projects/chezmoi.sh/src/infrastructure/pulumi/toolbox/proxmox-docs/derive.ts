import type {
	AclDoc,
	PoolDoc,
	PoolMembershipDoc,
	RoleDoc,
	SdnSubnetDoc,
	SdnVnetDoc,
	SdnZoneDoc,
	TokenDoc,
	UserDoc,
} from "./extract";

// -----------------------------------------------------------------------------
// Cross-resource derivations
// -----------------------------------------------------------------------------
// Everything here answers a question no single resource can: which pool is an
// enforcement boundary (pools x ACLs), which identity has no token (users x
// tokens), how a subnet nests under a zone (three SDN types joined).
//
// This layer exists so the templates never hard-code a count, a name, or a
// list. Static prose in `templates/` may state an invariant or a rationale --
// it must never state "three identities" or "the talos pool", because those
// rot the moment the stack changes. Anything countable is derived here and
// rendered from data, so the document cannot drift from the state it was
// generated from.
// -----------------------------------------------------------------------------

export interface IdentityDoc {
	userId: string;
	/** From the user's `comment` in `stack/proxmox/access.ts`. Empty means the code is missing a comment. */
	purpose?: string;
	enabled?: boolean;
	/** Grants held by this identity, most-privileged scope first. */
	grants: AclDoc[];
	tokens: TokenDoc[];
	/** True when this identity authenticates with a password rather than an API token. */
	passwordOnly: boolean;
	/** True when any of its grants sits at `/`. */
	hasGlobalGrant: boolean;
}

/** Joins users to their tokens and ACL grants -- the shape the access table renders from. */
export function deriveIdentities(
	users: UserDoc[],
	tokens: TokenDoc[],
	acls: AclDoc[],
): IdentityDoc[] {
	return users.map((user): IdentityDoc => {
		const ownTokens = tokens.filter((t) => t.userId === user.userId);
		const grants = acls.filter((a) => a.grantee === user.userId);
		return {
			userId: user.userId,
			purpose: user.comment,
			enabled: user.enabled,
			grants,
			tokens: ownTokens,
			passwordOnly: ownTokens.length === 0,
			hasGlobalGrant: grants.some((g) => g.global),
		};
	});
}

export interface AccessSummary {
	identities: IdentityDoc[];
	/** Identities holding at least one API token. */
	tokenIdentities: IdentityDoc[];
	/** Every token across every identity. */
	tokens: TokenDoc[];
	/** `user@realm!name` for each token -- projected here so templates can list them without a pluck helper. */
	tokenIds: string[];
	/** Identities with no token -- they authenticate some other way (a password held outside this stack). */
	passwordIdentities: IdentityDoc[];
	/** User IDs of the above, for the same reason as `tokenIds`. */
	passwordIdentityIds: string[];
	/** Identities granted something at `/`. */
	globalIdentities: IdentityDoc[];
	/** True when every token disables privilege separation, i.e. each carries exactly its user's permissions. */
	allTokensInheritUser: boolean;
	/** True when every `/` grant is audit-only -- i.e. nothing can write host-wide. */
	globalGrantsAreReadOnly: boolean;
}

export function deriveAccessSummary(
	identities: IdentityDoc[],
	roles: RoleDoc[],
): AccessSummary {
	const roleById = new Map(roles.map((r) => [r.roleId, r]));
	const globalIdentities = identities.filter((i) => i.hasGlobalGrant);
	const allTokens = identities.flatMap((i) => i.tokens);
	const passwordIdentities = identities.filter((i) => i.passwordOnly);

	return {
		identities,
		tokenIdentities: identities.filter((i) => i.tokens.length > 0),
		tokens: allTokens,
		tokenIds: allTokens.map((t) => `\`${t.tokenId}\``),
		passwordIdentities,
		passwordIdentityIds: passwordIdentities.map((i) => `\`${i.userId}\``),
		globalIdentities,
		allTokensInheritUser:
			allTokens.length > 0 &&
			allTokens.every((t) => t.privilegeSeparation === false),
		globalGrantsAreReadOnly: globalIdentities.every((identity) =>
			identity.grants
				.filter((g) => g.global)
				// A role this stack does not declare (a Proxmox built-in like
				// PVESDNUser) is unknown here, so it cannot be assumed read-only.
				.every((g) => roleById.get(g.roleId)?.auditOnly === true),
		),
	};
}

export interface PoolSummary extends PoolDoc {
	/** Storages attached to this pool. */
	storages: string[];
	/** Grants bound to `/pool/<id>`. Non-empty means membership *is* a permission. */
	grants: AclDoc[];
	/**
	 * True when at least one ACL is bound to this pool. Drives both the
	 * "enforcement boundary" wording and the caution callout, so neither can
	 * outlive the grant that justified it.
	 */
	isBoundary: boolean;
}

export function derivePools(
	pools: PoolDoc[],
	memberships: PoolMembershipDoc[],
	acls: AclDoc[],
): PoolSummary[] {
	return pools.map((pool): PoolSummary => {
		const grants = acls.filter((a) => a.poolId === pool.poolId);
		return {
			...pool,
			storages: memberships
				.filter((m) => m.poolId === pool.poolId && m.storageId !== undefined)
				.map((m) => m.storageId as string),
			grants,
			isBoundary: grants.length > 0,
		};
	});
}

export interface SdnRow {
	zoneId: string;
	zoneKind: string;
	vnetId: string;
	vnetAlias?: string;
	cidr: string;
	gateway?: string;
	snat?: boolean;
	dhcp?: string;
}

/**
 * Flattens zones -> VNets -> subnets into one row per subnet. A flat table
 * scales to any number of zones without nesting headings three deep, and a
 * single-zone setup renders as a single row.
 *
 * A VNet with no subnet, or a zone with no VNet, still produces a row: a
 * half-configured fabric is exactly the thing the document should show rather
 * than silently omit.
 */
export function deriveSdn(
	zones: SdnZoneDoc[],
	vnets: SdnVnetDoc[],
	subnets: SdnSubnetDoc[],
): SdnRow[] {
	const rows: SdnRow[] = [];

	for (const zone of zones) {
		const zoneVnets = vnets.filter((v) => v.zone === zone.zoneId);
		if (zoneVnets.length === 0) {
			rows.push({
				zoneId: zone.zoneId,
				zoneKind: zone.kind,
				vnetId: "—",
				cidr: "—",
			});
			continue;
		}

		for (const vnet of zoneVnets) {
			const vnetSubnets = subnets.filter((s) => s.vnet === vnet.vnetId);
			if (vnetSubnets.length === 0) {
				rows.push({
					zoneId: zone.zoneId,
					zoneKind: zone.kind,
					vnetId: vnet.vnetId,
					vnetAlias: vnet.alias,
					cidr: "—",
				});
				continue;
			}

			for (const subnet of vnetSubnets) {
				rows.push({
					zoneId: zone.zoneId,
					zoneKind: zone.kind,
					vnetId: vnet.vnetId,
					vnetAlias: vnet.alias,
					cidr: subnet.cidr,
					gateway: subnet.gateway,
					snat: subnet.snat,
					dhcp: subnet.dhcpRanges
						.map((r) => `${r.startAddress}–${r.endAddress}`)
						.join(", "),
				});
			}
		}
	}

	return rows;
}
