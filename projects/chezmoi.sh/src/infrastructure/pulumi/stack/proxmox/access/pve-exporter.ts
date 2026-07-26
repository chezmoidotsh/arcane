import * as proxmox from "@pulumi/proxmox";

// -----------------------------------------------------------------------------
// prometheus@pve -- read-only identity for pve-exporter
// -----------------------------------------------------------------------------
// Copied verbatim from the manual `pveum role add` recipe this stack replaces
// (see docs/experiments/20260617-proxmox-csi-ccm/README.md and
// projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni-infra-provider-proxmox/README.md,
// "Proxmox user and role setup").
export const exporterRole = new proxmox.VirtualEnvironmentRole(
	"pve-role-exporter",
	{
		roleId: "Exporter",
		privileges: ["Datastore.Audit", "Pool.Audit", "Sys.Audit", "VM.Audit"],
	},
);

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
