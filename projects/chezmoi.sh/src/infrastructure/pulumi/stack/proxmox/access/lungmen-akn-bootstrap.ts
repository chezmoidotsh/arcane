import * as k8s from "@pulumi/kubernetes";
import * as proxmox from "@pulumi/proxmox";
import * as pulumi from "@pulumi/pulumi";

// -----------------------------------------------------------------------------
// lungmen-akn-bootstrap@pve -- lets lungmen.akn's own Pulumi program
// self-provision its PVE identities without consuming a token minted here.
// Same pattern as rhodes-akn-bootstrap.ts (see that file for the full
// reasoning) — mirrored here for lungmen.akn's Omni-based recreation
// (chezmoidotsh/arcane#1188).
// -----------------------------------------------------------------------------
export const lungmenAknBootstrapUser = new proxmox.VirtualEnvironmentUser(
	"pve-user-lungmen-akn-bootstrap",
	{
		userId: "lungmen-akn-bootstrap@pve",
		comment:
			"Delegated access-control admin for lungmen.akn's own Pulumi program (scoped to /access)",
		enabled: true,
	},
);

export const lungmenAknBootstrapToken = new proxmox.UserToken(
	"pve-token-lungmen-akn-bootstrap",
	{
		userId: lungmenAknBootstrapUser.userId,
		tokenName: "bootstrap",
		comment:
			"lungmen.akn Pulumi stack — self-provisions its own PVE identities",
		privilegesSeparation: false,
	},
);

// `lungmenAknBootstrapToken.value` is already the complete, ready-to-use
// `USER@REALM!TOKENID=SECRET` credential string — see rhodes-akn-bootstrap.ts
// for why this must be passed through as-is, not rebuilt from id/secret parts.
const lungmenAknBootstrapApiToken = lungmenAknBootstrapToken.value;

// Delivered as a direct Kubernetes Secret into lungmen-akn's own cluster —
// deliberately NOT as a Pulumi StackReference output (see rhodes-akn-bootstrap.ts
// for the per-project passphrase-isolation reasoning). Explicit named provider,
// not the ambient default: unlike rhodes.akn (a single-context project), the
// lungmen.akn Pulumi program's ambient default provider is currently unset
// (every existing lungmen.akn stack file goes through Vault/ESO, not
// Kubernetes directly) — pinning this resource to an explicit provider avoids
// ever depending on an ambient config that could point at the wrong cluster
// during the old-cluster/new-cluster transition.
const lungmenAkn = new k8s.Provider("lungmen-akn", {
	context: new pulumi.Config().require("lungmenAknKubernetesContext"),
});

new k8s.core.v1.Secret(
	"lungmen-akn-bootstrap-pve",
	{
		metadata: { name: "lungmen-akn-bootstrap-pve", namespace: "kube-system" },
		type: "Opaque",
		stringData: {
			"api-token": lungmenAknBootstrapApiToken,
		},
	},
	{ provider: lungmenAkn },
);

// Administrator at /access only -- can manage users/roles/ACLs/tokens, but
// unlike an Administrator grant at `/`, cannot touch VMs, storage, or SDN.
export const lungmenAknBootstrapAcl = new proxmox.Acl(
	"pve-acl-lungmen-akn-bootstrap",
	{
		path: "/access",
		userId: lungmenAknBootstrapUser.userId,
		roleId: "Administrator",
		propagate: true,
	},
);

// -----------------------------------------------------------------------------
// Delegation rights: lungmen.akn's Pulumi program uses this identity to grant
// its own kubernetes-cloud-provider@pve identity ACLs at /nodes/pve-01 and
// /pool/talos (see lungmen.akn/stack/proxmox.ts). Proxmox rejects an ACL grant
// at a path the granting user has no rights on itself ("403 Permission check
// failed"), so this identity needs Permissions.Modify (+ Pool.Allocate for
// the pool path) at exactly those two paths — same narrow-scope reasoning as
// rhodes-akn-bootstrap.ts.
// -----------------------------------------------------------------------------
const lungmenAknBootstrapDelegateRole = new proxmox.VirtualEnvironmentRole(
	"pve-role-lungmen-akn-bootstrap-delegate",
	{
		roleId: "LungmenAknBootstrapDelegate",
		privileges: ["Permissions.Modify", "Pool.Allocate"],
	},
);

export const lungmenAknBootstrapAclNodePve01 = new proxmox.Acl(
	"pve-acl-lungmen-akn-bootstrap-node-pve-01",
	{
		path: "/nodes/pve-01",
		userId: lungmenAknBootstrapUser.userId,
		roleId: lungmenAknBootstrapDelegateRole.roleId,
		propagate: true,
	},
);

export const lungmenAknBootstrapAclPoolTalos = new proxmox.Acl(
	"pve-acl-lungmen-akn-bootstrap-pool-talos",
	{
		path: "/pool/talos",
		userId: lungmenAknBootstrapUser.userId,
		roleId: lungmenAknBootstrapDelegateRole.roleId,
		propagate: true,
	},
);
