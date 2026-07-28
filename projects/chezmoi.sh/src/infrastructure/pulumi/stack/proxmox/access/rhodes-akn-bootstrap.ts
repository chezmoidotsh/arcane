import * as k8s from "@pulumi/kubernetes";
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

// `rhodesAknBootstrapToken.value` is already the complete, ready-to-use
// `USER@REALM!TOKENID=SECRET` credential string. Re-concatenating
// userId!tokenName onto it produces a doubly-prefixed, invalid token that
// Proxmox rejects with "authentication failure: no such user" — pass it
// through as-is, don't rebuild it.
const rhodesAknBootstrapApiToken = rhodesAknBootstrapToken.value;

// Delivered as a direct Kubernetes Secret into rhodes.akn's own cluster —
// deliberately NOT as a Pulumi StackReference output. Each project's Pulumi
// state is encrypted with its own, unique passphrase (see
// docs/procedures/infrastructure/INF-20260705-00.pulumi-state-and-import.md);
// a cross-project StackReference read of a *secret* output only decrypts if
// the reading stack also holds the exporting stack's passphrase, which this
// repo deliberately does not share (keeps each project's blast radius
// contained — a leaked rhodes.akn passphrase must not also expose every
// other secret in this stack, e.g. the root@pam password). Writing directly
// into the target cluster sidesteps that: it's also what a future in-cluster
// operator reconciling rhodes.akn's own stack would need anyway (RBAC read
// access to a Secret in its own cluster), not a second Pulumi decrypt key.
const rhodesAkn = new k8s.Provider("rhodes-akn", {
	context: new pulumi.Config().require("rhodesAknKubernetesContext"),
});

new k8s.core.v1.Secret(
	"rhodes-akn-bootstrap-pve",
	{
		metadata: { name: "rhodes-akn-bootstrap-pve", namespace: "kube-system" },
		type: "Opaque",
		stringData: {
			"api-token": rhodesAknBootstrapApiToken,
		},
	},
	{ provider: rhodesAkn },
);

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

// -----------------------------------------------------------------------------
// Delegation rights: rhodes.akn's Pulumi program uses this identity to grant
// its own kubernetes-cloud-provider@pve identity ACLs at /nodes/pve-01 and
// /pool/talos (see rhodes.akn/stack/proxmox.ts). Proxmox rejects an ACL grant
// at a path the granting user has no rights on itself ("403 Permission check
// failed"), so this identity needs Permissions.Modify (+ Pool.Allocate for
// the pool path) at exactly those two paths. Deliberately NOT Administrator
// and NOT scoped to `/`: this grants the *ability to assign permissions*
// there, not to create/modify/delete VMs, storage, or SDN itself -- the
// narrow-scope intent from the /access grant above still holds.
// -----------------------------------------------------------------------------
const rhodesAknBootstrapDelegateRole = new proxmox.VirtualEnvironmentRole(
	"pve-role-rhodes-akn-bootstrap-delegate",
	{
		roleId: "RhodesAknBootstrapDelegate",
		privileges: ["Permissions.Modify", "Pool.Allocate"],
	},
);

export const rhodesAknBootstrapAclNodePve01 = new proxmox.Acl(
	"pve-acl-rhodes-akn-bootstrap-node-pve-01",
	{
		path: "/nodes/pve-01",
		userId: rhodesAknBootstrapUser.userId,
		roleId: rhodesAknBootstrapDelegateRole.roleId,
		propagate: true,
	},
);

export const rhodesAknBootstrapAclPoolTalos = new proxmox.Acl(
	"pve-acl-rhodes-akn-bootstrap-pool-talos",
	{
		path: "/pool/talos",
		userId: rhodesAknBootstrapUser.userId,
		roleId: rhodesAknBootstrapDelegateRole.roleId,
		propagate: true,
	},
);
