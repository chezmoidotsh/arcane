import * as proxmox from "@pulumi/proxmox";

// -----------------------------------------------------------------------------
// omni@pve -- Omni infrastructure provider (VM lifecycle scoped to
// `/pool/talos`; see
// projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni-infra-provider-proxmox/README.md)
// -----------------------------------------------------------------------------
// Custom roles are each the least-privilege set the ACL below actually needs
// -- copied verbatim from the manual `pveum role add` recipes this stack
// replaces (see docs/experiments/20260617-proxmox-csi-ccm/README.md and
// .../omni-infra-provider-proxmox/README.md, "Proxmox user and role setup").
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

// VM.Config.* checks during VM creation have no pool fallback (unlike
// VM.Allocate, which accepts /pool/{pool}) -- they're checked strictly
// against /vms/{vmid}. This role exists only to satisfy those create-time
// checks; it deliberately excludes VM.Clone/VM.Console/VM.PowerMgmt since
// granting those at /vms (unscoped to any pool) would reach every VM on the
// host, not just talos. Lifecycle operations on existing VMs stay covered by
// omniProviderRole at /pool/talos, once VM membership applies.
//
// VM.Audit *is* included despite that same host-wide reach: the infra
// provider polls `/nodes/{node}/qemu/{vmid}/status/current` for VMIDs it has
// just allocated but that Proxmox hasn't assigned to /pool/talos yet (pool
// membership is a side effect of a *successful* create, same as the
// VM.Config.* comment above) -- without it, that poll 403s and the provider
// can never confirm a VM it just created, or even notice a leftover/orphaned
// VMID from a previously failed provision. See rhodes-akn incident: stuck
// MachineRequests reconciling against leftover VMIDs 106/107 with no pool
// membership, indistinguishable from "not authorized" until this was added.
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

export const omniProviderNodeRole = new proxmox.VirtualEnvironmentRole(
	"pve-role-omni-provider-node",
	{
		roleId: "OmniProviderNode",
		privileges: ["Sys.AccessNetwork", "Sys.Audit"],
	},
);

// Sys.Audit only -- Sys.AccessNetwork has no purpose at `/` (it's a
// node-local privilege, already covered at /nodes/pve-01 by
// omniProviderNodeRole above) and granting it cluster-wide would be pure
// excess scope. Kept as its own role rather than reusing omniProviderNodeRole
// so the `/` grant below can't ever carry more than the one privilege it's
// actually for.
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

export const omniPoolAcl = new proxmox.Acl("pve-acl-omni-pool", {
	path: "/pool/talos",
	userId: omniUser.userId,
	roleId: omniProviderRole.roleId,
	propagate: true,
});

// VM.Config.* privileges are checked against `/vms/<vmid>`, not
// `/pool/talos` -- a brand-new VM isn't a member of the pool yet when
// Proxmox runs these checks during creation (pool membership is a side
// effect of a *successful* create, not a precondition), so the pool-scoped
// ACL above never applies at create time. Without this, `pveum` returns 403
// on VM.Config.Options the moment Omni tries to create a Talos VM. Scoped to
// omniProviderCreateRole (not the full omniProviderRole) since /vms reaches
// every VM on the host, not just talos.
export const omniVmsAcl = new proxmox.Acl("pve-acl-omni-vms", {
	path: "/vms",
	userId: omniUser.userId,
	roleId: omniProviderCreateRole.roleId,
	propagate: true,
});

export const omniNodeAcl = new proxmox.Acl("pve-acl-omni-node", {
	path: "/nodes/pve-01",
	userId: omniUser.userId,
	roleId: omniProviderNodeRole.roleId,
	propagate: true,
});

// GET /cluster/status is checked against `/` itself, not `/nodes/{node}` --
// the infra provider's pickNode step calls it to read cluster/quorum info
// before allocating a VM. propagate: false keeps the grant from cascading;
// omniProviderClusterRole keeps it to the one privilege (Sys.Audit) this
// exact-path check needs, nothing more.
export const omniClusterAcl = new proxmox.Acl("pve-acl-omni-cluster", {
	path: "/",
	userId: omniUser.userId,
	roleId: omniProviderClusterRole.roleId,
	propagate: false,
});

// SDN.Use on both bridges omni@pve attaches Talos VM NICs to: the legacy
// `vmbr1` bridge (Cilium L2 plane, `eth0`) and the `talosnet` VNet this
// stack declares in ../sdn.ts (node traffic plane, `eth1`). `PVESDNUser` is
// Proxmox VE's built-in role (SDN.Audit + SDN.Use) -- not redeclared here.
// `/sdn/zones/localnetwork/vmbr1` predates this stack (the `localnetwork`
// zone and `vmbr1` bridge are manual, outside the SDN abstraction this stack
// manages) -- kept as a plain ACL path, not tied to a Pulumi-managed zone.
export const omniSdnVmbr1Acl = new proxmox.Acl("pve-acl-omni-sdn-vmbr1", {
	path: "/sdn/zones/localnetwork/vmbr1",
	userId: omniUser.userId,
	roleId: "PVESDNUser",
	propagate: true,
});
