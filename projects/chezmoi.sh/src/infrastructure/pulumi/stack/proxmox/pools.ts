import * as proxmox from "@pulumi/proxmox";

// -----------------------------------------------------------------------------
// core -- critical platform LXCs (omni, omni-infra-provider-proxmox, o11y,
// oci-registry, pve-exporter); required for everything else to function
// -----------------------------------------------------------------------------
export const corePool = new proxmox.VirtualEnvironmentPool("pve-pool-core", {
	poolId: "core",
	comment:
		"Critical platform LXCs — required for everything else (oci-registry, o11y, omni)",
});

// -----------------------------------------------------------------------------
// talos -- Omni-managed Talos VMs; the ACL boundary the omni@pve,
// kubernetes-ccm@pve, and kubernetes-csi@pve identities are scoped to (see
// ./access.ts). Never add a non-Kubernetes VM/LXC to this pool -- pool
// membership is exactly what grants those identities access.
// -----------------------------------------------------------------------------
export const talosPool = new proxmox.VirtualEnvironmentPool("pve-pool-talos", {
	poolId: "talos",
	comment: "Omni-managed Talos VMs",
});

// Storage membership only -- VM/LXC membership is a side effect of VM
// creation (Omni machine classes set `pool: talos` in their provider data;
// see omni-infra-provider-proxmox/README.md, "Machine classes"), which stays
// manual along with the rest of VM/LXC lifecycle (see
// docs/decisions/015-migrate-crossplane-to-pulumi.md, "Non-Goals").
// Declaring per-VM pool membership here would make this stack reachable from
// VM resources it must stay structurally isolated from.
export const talosPoolLocalStorage = new proxmox.PoolMembership(
	"pve-pool-talos-storage-local",
	{
		poolId: talosPool.poolId,
		storageId: "local",
	},
);

export const talosPoolNvmeLvmStorage = new proxmox.PoolMembership(
	"pve-pool-talos-storage-nvme-lvm",
	{
		poolId: talosPool.poolId,
		storageId: "nvme-lvm",
	},
);
