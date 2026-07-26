import * as proxmox from "@pulumi/proxmox";

// -----------------------------------------------------------------------------
// prometheus@pve -- read-only identity for pve-exporter
// -----------------------------------------------------------------------------

// Read-only: metrics scraping needs audit access only, no mutation rights.
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

// Cluster-wide ("/") so every node and VM is scrapable.
export const prometheusAcl = new proxmox.Acl("pve-acl-prometheus", {
	path: "/",
	userId: prometheusUser.userId,
	roleId: exporterRole.roleId,
	propagate: true,
});
