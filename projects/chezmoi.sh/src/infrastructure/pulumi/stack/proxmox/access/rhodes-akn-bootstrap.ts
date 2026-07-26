import * as proxmox from "@pulumi/proxmox";
import * as pulumi from "@pulumi/pulumi";

// -----------------------------------------------------------------------------
// rhodes-akn-bootstrap@pve -- delegated access-control admin for rhodes.akn's
// own Pulumi program (projects/rhodes.akn/src/infrastructure/pulumi/stack/
// proxmox.ts). That program self-provisions its own Kubernetes CCM/CSI
// identity directly against pve-01 (a proxmox.Provider it configures itself)
// instead of consuming a token minted here — creating/updating a PVE
// user+role+token+ACL requires *some* sufficiently privileged identity, and
// this is that identity, scoped as narrowly as the ACL system allows: bound
// only under `/access`, not `/`. A token with `Administrator` at `/access`
// can manage users, roles, ACLs and tokens, but — unlike root@pam or an
// `Administrator` grant at `/` — cannot touch VMs, storage, SDN or any other
// object in the tree. (`Administrator` is reused here rather than a
// hand-picked privilege list because PVE's own access-control endpoints
// don't document a finer-grained set for role/user/token CRUD, and this
// stack already has one live, confirmed-working precedent for that grant —
// see ../README.md, "Bootstrapping", the `root@pam!pulumi-import` token's
// caution note.)
// -----------------------------------------------------------------------------
export const rhodesAknBootstrapUser = new proxmox.VirtualEnvironmentUser(
	"pve-user-rhodes-akn-bootstrap",
	{
		userId: "rhodes-akn-bootstrap@pve",
		comment:
			"Delegated access-control admin for rhodes.akn's own Pulumi program (scoped to /access)",
		enabled: true,
	},
);

export const rhodesAknBootstrapToken = new proxmox.UserToken(
	"pve-token-rhodes-akn-bootstrap",
	{
		userId: rhodesAknBootstrapUser.userId,
		tokenName: "bootstrap",
		comment: "rhodes.akn Pulumi stack — self-provisions its own PVE identities",
		privilegesSeparation: false,
	},
);

// Exported (via ../index.ts) for rhodes.akn's Pulumi program to consume through
// a StackReference — a one-time delegation credential, not a per-apply
// secret: rhodes.akn's own provider config uses it (via env var, never
// written to Pulumi config — same "credentials never in git" rule as this
// stack's own root@pam password, see ../README.md) to authenticate the
// proxmox.Provider it configures for itself.
export const rhodesAknBootstrapTokenId = pulumi.interpolate`${rhodesAknBootstrapToken.userId}!${rhodesAknBootstrapToken.tokenName}`;
export const rhodesAknBootstrapTokenSecret = rhodesAknBootstrapToken.value;

export const rhodesAknBootstrapAcl = new proxmox.Acl(
	"pve-acl-rhodes-akn-bootstrap",
	{
		path: "/access",
		userId: rhodesAknBootstrapUser.userId,
		roleId: "Administrator",
		propagate: true,
	},
);
