import * as proxmox from "@pulumi/proxmox";

// -----------------------------------------------------------------------------
// omni@pve -- Omni infrastructure provider (VM lifecycle scoped to
// `/pool/talos`; see
// projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni-infra-provider-proxmox/README.md)
// -----------------------------------------------------------------------------

// Full VM lifecycle (allocate/clone/config/power/console), granted on
// /pool/talos below.
export const omniProviderRole = new proxmox.VirtualEnvironmentRole(
	"pve-role-omni-provider",
	{
		roleId: "OmniProvider",
		privileges: [
			"Datastore.Allocate",
			"Datastore.AllocateSpace",
			"Datastore.AllocateTemplate",
			"Datastore.Audit",
			"Pool.Allocate",
			"Pool.Audit",
			"VM.Allocate",
			"VM.Audit",
			"VM.Clone",
			"VM.Config.CDROM",
			"VM.Config.CPU",
			"VM.Config.Disk",
			"VM.Config.HWType",
			"VM.Config.Memory",
			"VM.Config.Network",
			"VM.Config.Options",
			"VM.Console",
			"VM.PowerMgmt",
		],
	},
);

// VM.Config.* is checked at /vms/{vmid} directly, with no pool fallback --
// minimal privileges for the host-wide /vms grant below, so VM creation
// works without handing out full VM control on every VM on the host.
// VM.Audit is included because a freshly allocated VMID isn't a pool member
// yet either, and its status still needs to be readable.
export const omniProviderCreateRole = new proxmox.VirtualEnvironmentRole(
	"pve-role-omni-provider-create",
	{
		roleId: "OmniProviderCreate",
		privileges: [
			"VM.Allocate",
			"VM.Audit",
			"VM.Config.CDROM",
			"VM.Config.CPU",
			"VM.Config.Disk",
			"VM.Config.HWType",
			"VM.Config.Memory",
			"VM.Config.Network",
			"VM.Config.Options",
		],
	},
);

// Network/audit access on pve-01 itself, granted below -- outside pool scope.
export const omniProviderNodeRole = new proxmox.VirtualEnvironmentRole(
	"pve-role-omni-provider-node",
	{
		roleId: "OmniProviderNode",
		privileges: ["Sys.AccessNetwork", "Sys.Audit"],
	},
);

// Sys.Audit only -- GET /cluster/status is checked at `/` itself; nothing
// broader is needed there.
export const omniProviderClusterRole = new proxmox.VirtualEnvironmentRole(
	"pve-role-omni-provider-cluster",
	{
		roleId: "OmniProviderCluster",
		privileges: ["Sys.Audit"],
	},
);

// Authenticates with a password (`PROXMOX_PASSWORD`, baked into the LXC image
// at build time via `secrets/proxmox.sops.env`), not an API token -- no
// `UserToken` for this identity. `password` is deliberately left unset here:
// Pulumi never reads or writes it, so the existing credential stays untouched
// on import.
export const omniUser = new proxmox.VirtualEnvironmentUser("pve-user-omni", {
	userId: "omni@pve",
	comment: "Omni infra provider - VM lifecycle scoped to /pool/talos",
	enabled: true,
});

// Main grant: full VM lifecycle, scoped to the talos pool only.
export const omniPoolAcl = new proxmox.Acl("pve-acl-omni-pool", {
	path: "/pool/talos",
	userId: omniUser.userId,
	roleId: omniProviderRole.roleId,
	propagate: true,
});

// VM.Config.* is checked at /vms/{vmid}, not /pool/talos -- required for
// creating a VM, and for auditing its status before it joins the pool.
export const omniVmsAcl = new proxmox.Acl("pve-acl-omni-vms", {
	path: "/vms",
	userId: omniUser.userId,
	roleId: omniProviderCreateRole.roleId,
	propagate: true,
});

// Node-local access on pve-01, where Talos VM NICs live.
export const omniNodeAcl = new proxmox.Acl("pve-acl-omni-node", {
	path: "/nodes/pve-01",
	userId: omniUser.userId,
	roleId: omniProviderNodeRole.roleId,
	propagate: true,
});

// GET /cluster/status (pickNode step) is checked at `/`, not /nodes/{node}.
// propagate: false keeps the grant to that exact-path check only.
export const omniClusterAcl = new proxmox.Acl("pve-acl-omni-cluster", {
	path: "/",
	userId: omniUser.userId,
	roleId: omniProviderClusterRole.roleId,
	propagate: false,
});

// SDN.Use on the legacy `vmbr1` bridge (Talos VM NICs' `eth0`, Cilium L2
// plane). The matching grant for `talosnet` (`eth1`) lives in ../sdn.ts,
// next to the VNet it applies to. `PVESDNUser` is Proxmox's built-in role
// (SDN.Audit + SDN.Use) -- not redeclared here.
export const omniSdnVmbr1Acl = new proxmox.Acl("pve-acl-omni-sdn-vmbr1", {
	path: "/sdn/zones/localnetwork/vmbr1",
	userId: omniUser.userId,
	roleId: "PVESDNUser",
	propagate: true,
});
