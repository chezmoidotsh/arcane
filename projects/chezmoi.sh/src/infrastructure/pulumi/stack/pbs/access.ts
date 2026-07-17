import * as pbs from "@pulumi/pbs";
import * as pulumi from "@pulumi/pulumi";

import { backupsDatastore } from "./datastore";

// -----------------------------------------------------------------------------
// pve-backup@pbs -- least-privilege identity for Proxmox VE's own storage
// integration
// -----------------------------------------------------------------------------
// Proxmox VE's `pbs` storage type (configured by hand -- Proxmox itself stays
// outside Pulumi/GitOps, see docs/decisions/015-migrate-crossplane-to-pulumi.md,
// "Non-Goals"; see ./README.md, "Bootstrapping" for the exact `pvesm add`
// invocation) needs an API token to push LXC/VM backups into the datastore
// (`backupsDatastore`, see ./datastore.ts). This token is scoped to
// `DatastoreBackup` on that one datastore only -- never `root@pam` in
// steady state, mirroring the CCM/CSI dual-token least-privilege pattern
// used elsewhere in this repo.
export const pveBackupUser = new pbs.User("pbs-user-pve-backup", {
	userid: "pve-backup@pbs",
	comment: "Proxmox VE storage integration -- pushes LXC/VM backups",
	enable: true,
});

export const pveBackupToken = new pbs.ApiToken(
	"pbs-token-pve-backup",
	{
		userid: pveBackupUser.userid,
		tokenName: "pve-storage",
		comment: "Used by Proxmox VE's `pbs`-type storage entry",
		enable: true,
	},
	{ parent: pveBackupUser },
);

// `tokenid` is the full `user@realm!tokenname` identifier PBS expects as an
// ACL `ugid` and as the Proxmox VE storage config's token ID -- computed by
// the provider, no manual string interpolation needed.
export const pveBackupTokenId = pveBackupToken.tokenid;
// One-time secret: PBS never returns it again after creation. Export it, then
// use it to configure Proxmox VE's storage entry and discard it from
// anywhere else -- see ./README.md, "Bootstrapping".
export const pveBackupTokenSecret = pveBackupToken.value;

export const pveBackupAcl = new pbs.Acl(
	"pbs-acl-pve-backup",
	{
		path: pulumi.interpolate`/datastore/${backupsDatastore.name}`,
		ugid: pveBackupTokenId,
		roleId: "DatastoreBackup",
		propagate: true,
	},
	{ parent: pveBackupToken },
);
