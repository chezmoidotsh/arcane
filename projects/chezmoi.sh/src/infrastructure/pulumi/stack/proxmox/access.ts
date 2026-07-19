import * as proxmox from "@pulumi/proxmox";

// -----------------------------------------------------------------------------
// Custom roles
// -----------------------------------------------------------------------------
// Each role is the least-privilege set an identity below actually needs --
// copied verbatim from the manual `pveum role add` recipes this stack
// replaces (see docs/experiments/20260617-proxmox-csi-ccm/README.md and
// projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni-infra-provider-proxmox/README.md,
// "Proxmox user and role setup").
export const exporterRole = new proxmox.VirtualEnvironmentRole(
	"pve-role-exporter",
	{
		roleId: "Exporter",
		privileges: ["Datastore.Audit", "Pool.Audit", "Sys.Audit", "VM.Audit"],
	},
);

export const kubernetesCcmRole = new proxmox.VirtualEnvironmentRole(
	"pve-role-kubernetes-ccm",
	{
		roleId: "KubernetesCCM",
		privileges: ["Sys.Audit", "VM.Audit", "VM.GuestAgent.Audit"],
	},
);

export const kubernetesCsiRole = new proxmox.VirtualEnvironmentRole(
	"pve-role-kubernetes-csi",
	{
		roleId: "KubernetesCSI",
		privileges: [
			"Datastore.Allocate",
			"Datastore.AllocateSpace",
			"Datastore.Audit",
			"VM.Allocate",
			"VM.Audit",
			"VM.Clone",
			"VM.Config.CPU",
			"VM.Config.Disk",
			"VM.Config.HWType",
			"VM.Config.Memory",
			"VM.Config.Options",
			"VM.Migrate",
			"VM.PowerMgmt",
		],
	},
);

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

export const omniProviderNodeRole = new proxmox.VirtualEnvironmentRole(
	"pve-role-omni-provider-node",
	{
		roleId: "OmniProviderNode",
		privileges: ["Sys.AccessNetwork", "Sys.Audit"],
	},
);

// -----------------------------------------------------------------------------
// prometheus@pve -- read-only identity for pve-exporter
// -----------------------------------------------------------------------------
export const prometheusUser = new proxmox.VirtualEnvironmentUser(
	"pve-user-prometheus",
	{
		userId: "prometheus@pve",
		comment: "prometheus-pve-exporter monitoring",
		enabled: true,
	},
);

export const prometheusToken = new proxmox.UserToken("pve-token-prometheus", {
	userId: prometheusUser.userId,
	tokenName: "exporter",
	comment: "pve-exporter scrape token",
	privilegesSeparation: false,
});

export const prometheusAcl = new proxmox.Acl("pve-acl-prometheus", {
	path: "/",
	userId: prometheusUser.userId,
	roleId: exporterRole.roleId,
	propagate: true,
});

// -----------------------------------------------------------------------------
// kubernetes-ccm@pve -- proxmox-cloud-controller-manager (topology labels,
// providerID, node lifecycle only -- no VM/LXC lifecycle privileges; see
// docs/experiments/20260617-proxmox-csi-ccm/README.md)
// -----------------------------------------------------------------------------
export const kubernetesCcmUser = new proxmox.VirtualEnvironmentUser(
	"pve-user-kubernetes-ccm",
	{
		userId: "kubernetes-ccm@pve",
		enabled: true,
	},
);

export const kubernetesCcmToken = new proxmox.UserToken(
	"pve-token-kubernetes-ccm",
	{
		userId: kubernetesCcmUser.userId,
		tokenName: "ccm",
		privilegesSeparation: false,
	},
);

// Node-scoped grant: topology + lifecycle status. Live ACL path is
// `/nodes/pve` (not `/nodes/pve-01`) -- kept as-is for zero-recreation
// import; harmless on a single-node cluster where `pve` and `pve-01` cover
// the same host, but should be corrected to `/nodes/pve-01` (matching
// OmniProviderNode's binding below) the next time a second node makes the
// distinction matter.
export const kubernetesCcmNodeAcl = new proxmox.Acl(
	"pve-acl-kubernetes-ccm-node",
	{
		path: "/nodes/pve",
		userId: kubernetesCcmUser.userId,
		roleId: kubernetesCcmRole.roleId,
		propagate: true,
	},
);

// Pool-scoped grant: VM/guest-agent audit, scoped to the `talos` pool only
// (see ./pools.ts) -- the CCM cannot see or act on VMs outside it.
export const kubernetesCcmPoolAcl = new proxmox.Acl(
	"pve-acl-kubernetes-ccm-pool",
	{
		path: "/pool/talos",
		userId: kubernetesCcmUser.userId,
		roleId: kubernetesCcmRole.roleId,
		propagate: true,
	},
);

// -----------------------------------------------------------------------------
// kubernetes-csi@pve -- proxmox-csi-plugin (volume provisioning, scoped to
// the `talos` pool's storages)
// -----------------------------------------------------------------------------
export const kubernetesCsiUser = new proxmox.VirtualEnvironmentUser(
	"pve-user-kubernetes-csi",
	{
		userId: "kubernetes-csi@pve",
		enabled: true,
	},
);

export const kubernetesCsiToken = new proxmox.UserToken(
	"pve-token-kubernetes-csi",
	{
		userId: kubernetesCsiUser.userId,
		tokenName: "csi",
		privilegesSeparation: false,
	},
);

export const kubernetesCsiPoolAcl = new proxmox.Acl(
	"pve-acl-kubernetes-csi-pool",
	{
		path: "/pool/talos",
		userId: kubernetesCsiUser.userId,
		roleId: kubernetesCsiRole.roleId,
		propagate: true,
	},
);

// -----------------------------------------------------------------------------
// omni@pve -- Omni infrastructure provider (VM lifecycle scoped to
// `/pool/talos`; see
// projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni-infra-provider-proxmox/README.md)
// -----------------------------------------------------------------------------
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

export const omniNodeAcl = new proxmox.Acl("pve-acl-omni-node", {
	path: "/nodes/pve-01",
	userId: omniUser.userId,
	roleId: omniProviderNodeRole.roleId,
	propagate: true,
});

// SDN.Use on both bridges omni@pve attaches Talos VM NICs to: the legacy
// `vmbr1` bridge (Cilium L2 plane, `eth0`) and the `talosnet` VNet this
// stack declares in ./sdn.ts (node traffic plane, `eth1`). `PVESDNUser` is
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
