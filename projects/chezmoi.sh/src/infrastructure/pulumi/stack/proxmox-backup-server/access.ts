import * as pbs from "@pulumi/proxmox-backup-server";
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
// (`backupsDatastore`, see ./datastore.ts) -- never `root@pam` in steady
// state, mirroring the CCM/CSI dual-token least-privilege pattern used
// elsewhere in this repo.
//
// Every role below is granted twice -- once to the user, once to the token.
// Confirmed live: granting a role to only the user, or only the token, both
// left `proxmox-backup-client` failing with `missing permissions '...'`.
// Granting the same role to both is what actually works.
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

const backupAclPath = pulumi.interpolate`/datastore/${backupsDatastore.name}`;

export const pveBackupAcl = new pbs.Acl(
	"pbs-acl-pve-backup",
	{
		path: backupAclPath,
		ugid: pveBackupUser.userid,
		roleId: "DatastoreBackup",
		propagate: true,
	},
	{ parent: pveBackupUser },
);

export const pveBackupTokenAcl = new pbs.Acl(
	"pbs-acl-pve-backup-token",
	{
		path: backupAclPath,
		ugid: pveBackupTokenId,
		roleId: "DatastoreBackup",
		propagate: true,
	},
	{ parent: pveBackupToken },
);

// `DatastoreBackup` alone only grants `Datastore.Backup` -- enough to push/pull
// backups, but not to list datastores. Proxmox VE's `pvesm add pbs` (and the
// GUI wizard) fetches the datastore list before it will create the storage
// entry, which needs `Datastore.Audit`. PBS has no built-in role that combines
// just Backup + Audit, so this second role uses `DatastoreReader` (Audit +
// Read) -- broader than strictly required (Read also allows browsing/
// restoring backups owned by other users on this datastore), but the
// narrowest built-in role that covers the listing requirement without
// escalating to `DatastoreAdmin`. PBS ACLs are additive, so this stacks
// cleanly with the Backup grant above -- and, like it, needs granting to both
// the user and the token.
//
// Deliberately NOT `DatastorePowerUser`, even though it would additionally
// grant `Datastore.Prune` and let Proxmox VE's own per-job "keep" retention
// prune old backups through this token: retention is already handled
// centrally by this datastore's own scheduled `PruneJob` (../jobs.ts), which
// runs server-side and never touches this token. Giving `Datastore.Prune` to
// the identity `vzdump` uses on every automated run would let a compromised
// Proxmox VE host delete existing offsite backups -- exactly what backups are
// meant to survive. See ../../../../../toolbox/proxmox-backup-server-docs/templates/partials.pve-integration.hbs
// for the matching operator-facing note not to set a "Prune Backups" policy on
// the Proxmox VE storage entry.
export const pveBackupReaderAcl = new pbs.Acl(
	"pbs-acl-pve-backup-reader",
	{
		path: backupAclPath,
		ugid: pveBackupUser.userid,
		roleId: "DatastoreReader",
		propagate: true,
	},
	{ parent: pveBackupUser },
);

export const pveBackupTokenReaderAcl = new pbs.Acl(
	"pbs-acl-pve-backup-token-reader",
	{
		path: backupAclPath,
		ugid: pveBackupTokenId,
		roleId: "DatastoreReader",
		propagate: true,
	},
	{ parent: pveBackupToken },
);
