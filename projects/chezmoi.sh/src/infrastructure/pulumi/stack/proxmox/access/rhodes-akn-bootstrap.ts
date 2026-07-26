import * as proxmox from "@pulumi/proxmox";
import * as pulumi from "@pulumi/pulumi";

// -----------------------------------------------------------------------------
// rhodes-akn-bootstrap@pve -- lets rhodes.akn's own Pulumi program
// self-provision its PVE identities without consuming a token minted here.
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

// Administrator at /access only -- can manage users/roles/ACLs/tokens, but
// unlike an Administrator grant at `/`, cannot touch VMs, storage, or SDN.
export const rhodesAknBootstrapAcl = new proxmox.Acl(
	"pve-acl-rhodes-akn-bootstrap",
	{
		path: "/access",
		userId: rhodesAknBootstrapUser.userId,
		roleId: "Administrator",
		propagate: true,
	},
);
