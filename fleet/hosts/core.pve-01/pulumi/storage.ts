import * as proxmox from "@pulumi/proxmox";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as os from "os";

const config = new pulumi.Config();

// -----------------------------------------------------------------------------
// pbs.pve.chezmoi.sh -- registers Proxmox VE's `pbs`-type storage entry
// against the datastore the pbs-core project (fleet/hosts/core.pbs/) manages
// -----------------------------------------------------------------------------
// Authenticates as `pve-backup@pbs`'s `pve-storage` token, which lives in the
// pbs-core project (fleet/hosts/core.pbs/pulumi/access.ts). The token ID is
// fixed (`<userid>!<tokenName>`); the one-time secret is copied by hand from
// pbs-core's `pveBackupTokenSecret` output into this stack's own secret config
// (`pulumi config set --secret pveBackupTokenSecret`) -- no StackReference,
// each project keeps its own passphrase (ADR-017). Rotating the token in
// pbs-core means updating this config value and applying this stack too.
const pveBackupTokenId = "pve-backup@pbs!pve-storage";
const pveBackupTokenSecret = config.requireSecret("pveBackupTokenSecret");

// `encryptionKey` is the datastore's client-side encryption key -- the same
// key material described in fleet/hosts/core.pbs/README.md,
// "Bootstrapping" step 6 (generated once via `proxmox-backup-client key
// create` on the PBS VM, with no Pulumi-managed origin). Sourced *only* from
// PVE_PBS_STORE_ENCRYPTION_KEY, a path to a local keyfile -- deliberately no
// Pulumi-config fallback: a credential this sensitive never gets an option
// that would write it into the git-tracked Pulumi.pve-01_core.live.yaml, even
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
	// `~/...` string and fails with ENOENT. Expand it ourselves, but only the
	// current user's home: `~other/key` means *another user's* home to a
	// shell, and rewriting it against `os.homedir()` would silently build a
	// nonsense path rather than fail.
	const resolvedPath =
		keyPath === "~" || keyPath.startsWith("~/")
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
		// (fleet/hosts/core.pbs/pulumi/jobs.ts), not per-job on the Proxmox VE
		// side -- see fleet/hosts/core.pbs/README.md, "Access model",
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
