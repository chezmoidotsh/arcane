import * as proxmox from "@pulumi/proxmox";
import * as pulumi from "@pulumi/pulumi";

export interface ProxmoxClusterIdentityArgs {
	/** Proxmox VE user id, e.g. "kubernetes-cloud-provider@pve". */
	userId: string;
	/** Fills the identity's Purpose column when the host's docs are regenerated (mise run proxmox:docs:generate). */
	comment: string;
	/** Custom role granting exactly the privileges this identity needs. */
	role: {
		roleId: string;
		privileges: pulumi.Input<string>[];
	};
	/**
	 * One ACL grant per path, all bound to `role.roleId`. Keep every path as
	 * narrow as it can be (a resource pool, a specific node) rather than `/` —
	 * see stack/proxmox/README.md, "Adding a new identity or ACL binding".
	 */
	aclPaths: string[];
	/** API token name (e.g. "ccm"). Always created with privilegesSeparation
	 * disabled, so the token carries exactly the user's own permissions. */
	tokenName: string;
	tokenComment: string;
	/** The already-configured Proxmox provider to create these resources against. */
	provider: proxmox.Provider;
}

/**
 * Provisions a single Proxmox VE service identity for a Kubernetes cluster
 * integration: a custom role, a user, an API token, and one ACL grant per
 * path. Mirrors the per-identity pattern hand-rolled in chezmoi.sh's
 * stack/proxmox/access.ts, packaged for reuse by cluster-owned Pulumi
 * programs that provision their own Proxmox identities directly (via a
 * delegated token — see that stack's rhodes-akn-bootstrap@pve, its
 * README.md's "Bootstrapping" section) instead of consuming one minted by
 * chezmoi.sh's stack.
 */
export class ProxmoxClusterIdentityComponent extends pulumi.ComponentResource {
	public readonly tokenId: pulumi.Output<string>;
	public readonly tokenSecret: pulumi.Output<string>;

	constructor(
		name: string,
		args: ProxmoxClusterIdentityArgs,
		opts?: pulumi.ComponentResourceOptions,
	) {
		super("chezmoi:proxmox:ClusterIdentity", name, {}, opts);
		const parent: pulumi.CustomResourceOptions = {
			parent: this,
			provider: args.provider,
		};

		const role = new proxmox.VirtualEnvironmentRole(
			`${name}-role`,
			{
				roleId: args.role.roleId,
				privileges: args.role.privileges,
			},
			parent,
		);

		const user = new proxmox.VirtualEnvironmentUser(
			`${name}-user`,
			{
				userId: args.userId,
				comment: args.comment,
				enabled: true,
			},
			parent,
		);

		const token = new proxmox.UserToken(
			`${name}-token`,
			{
				userId: user.userId,
				tokenName: args.tokenName,
				comment: args.tokenComment,
				privilegesSeparation: false,
			},
			parent,
		);

		for (const path of args.aclPaths) {
			const suffix = path.replace(/^\/+/, "").replace(/\//g, "-") || "root";
			new proxmox.Acl(
				`${name}-acl-${suffix}`,
				{
					path,
					userId: user.userId,
					roleId: role.roleId,
					propagate: true,
				},
				parent,
			);
		}

		this.tokenId = pulumi.interpolate`${token.userId}!${token.tokenName}`;
		this.tokenSecret = token.value;
		this.registerOutputs({
			tokenId: this.tokenId,
			tokenSecret: this.tokenSecret,
		});
	}
}
