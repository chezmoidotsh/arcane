import * as proxmox from "@pulumi/proxmox";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as os from "os";

import {
	pveBackupTokenId,
	pveBackupTokenSecret,
} from "../proxmox-backup-server/access";

// -----------------------------------------------------------------------------
// pbs.pve.chezmoi.sh -- registers Proxmox VE's `pbs`-type storage entry
// against the datastore stack/proxmox-backup-server/ already manages
// -----------------------------------------------------------------------------
// Authenticates as `pve-backup@pbs`'s token, exported by
// ../proxmox-backup-server/access.ts -- same Pulumi program, same `pulumi up`
// run, so no manual copy-paste between stacks is needed (unlike the
// bootstrap-time manual step ../proxmox-backup-server/README.md's
// "Configuring Proxmox VE" section describes, which predates this stack).
//
// `encryptionKey` is the datastore's client-side encryption key -- the same
// key material described in ../proxmox-backup-server/README.md,
// "Bootstrapping" step 6 (generated once via `proxmox-backup-client key
// create` on the PBS VM, with no Pulumi-managed origin). Sourced *only* from
// PVE_PBS_STORE_ENCRYPTION_KEY, a path to a local keyfile -- deliberately no
// Pulumi-config fallback: a credential this sensitive never gets an option
// that would write it into the git-tracked Pulumi.chezmoi_sh.live.yaml, even
// as `--secret`. Not required on every run: once the resource exists, the
// key is applied at creation and then ignored (see `ignoreChanges` below),
// so a normal `pulumi up` with the env var unset shows no diff --
// `PVE_PBS_STORE_ENCRYPTION_KEY=/path/to/key pulumi up` only needs to be
// used for the one bootstrap apply that creates this resource.
function readStoragePbsEncryptionKey(): pulumi.Output<string> | undefined {
	const keyPath = process.env.PVE_PBS_STORE_ENCRYPTION_KEY;
	if (!keyPath) {
		return undefined;
	}
	// Node's fs module doesn't expand `~` the way a shell expands it in an
	// unquoted command -- a quoted value or one sourced from a non-shell
	// wrapper (a mise task, an IDE run config, ...) reaches us as a literal
	// `~/...` string and fails with ENOENT. Expand it ourselves.
	const resolvedPath = keyPath.startsWith("~")
		? os.homedir() + keyPath.slice(1)
		: keyPath;
	return pulumi.secret(fs.readFileSync(resolvedPath, "utf-8").trim());
}

export const pbsStorage = new proxmox.StoragePbs(
	"pve-storage-pbs",
	{
		storagePbsId: "pbs.pve.chezmoi.sh",
		server: "pbs.pve.chezmoi.sh",
		datastore: "Backblaze-B2",
		username: pveBackupTokenId,
		password: pveBackupTokenSecret,
		encryptionKey: readStoragePbsEncryptionKey(),
		contents: ["backup"],
		// Retention is handled centrally by the datastore's own PruneJob
		// (../proxmox-backup-server/jobs.ts), not per-job on the Proxmox VE
		// side -- see ../proxmox-backup-server/README.md, "Access model",
		// "No Datastore.Prune on this token, on purpose". `keepAll` here
		// mirrors that: this storage entry itself applies no retention.
		backups: {
			keepAll: true,
		},
	},
	{
		// Set once at creation (or whenever explicitly provided again);
		// never diffed afterwards -- see readStoragePbsEncryptionKey above.
		ignoreChanges: ["encryptionKey"],
	},
);
