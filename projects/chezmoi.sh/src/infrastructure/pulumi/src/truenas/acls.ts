import {
	must,
	parseUnixMode,
	type UnixPermissionTriad,
} from "@chezmoi.sh/pulumi-lib";
import * as truenas from "@pulumi/truenas";

import { zp1cs01 } from "./zpools/zp1cs01";
import { zp1hs01 } from "./zpools/zp1hs01";

// -----------------------------------------------------------------------------
// Every `truenas.FilesystemAcl` in this stack uses `acltype: "POSIX1E"`
// (owner/group/other, the classic UNIX permission model) instead of NFS4
// ACLs. POSIX1E is the simpler of the two models this provider supports --
// three permission slots (owner, group, other) instead of an arbitrary list
// of NFS4 ACEs -- which is the whole point: this stack manages exactly the
// access control a personal NAS needs (one owning user, one owning group,
// everyone else), not the fine-grained multi-principal ACLs NFS4 allows for.
// -----------------------------------------------------------------------------

/**
 * Turns one `{read,write,execute}` triad into the pair of `FilesystemAclDacl`
 * entries `posixDacls()` needs for it -- see that function for why both
 * exist.
 */
function entries(
	tag: "USER_OBJ" | "GROUP_OBJ" | "OTHER",
	perm: UnixPermissionTriad,
): truenas.types.input.FilesystemAclDacl[] {
	const base = {
		tag,
		id: -1, // required by the provider for USER_OBJ/GROUP_OBJ/OTHER (only USER/GROUP entries -- unused here -- carry a real id)
		permRead: perm.read,
		permWrite: perm.write,
		permExecute: perm.execute,
	};
	return [
		{ ...base, default: false }, // access ACL: governs this path itself
		{ ...base, default: true }, // default ACL: inherited by anything created under this path later
	];
}

/**
 * Builds the `dacls` array for a `truenas.FilesystemAcl` (POSIX1E) from a
 * 9-character `ls -l`-style mode string (e.g. `"rwxrwxr-x"`), covering the
 * owner (`USER_OBJ`), owning group (`GROUP_OBJ`), and everyone else
 * (`OTHER`) -- no named `USER`/`GROUP` entries, since every dataset in this
 * stack has exactly one owning user and one owning group, never a list of
 * additional named principals.
 *
 * Each of the 3 slots gets TWO entries, not one: a POSIX ACL is really two
 * parallel ACLs on the same path --
 * - the **access ACL** (`default: false`) governs the path itself: can the
 *   owning user/group/everyone-else read, write, or traverse *this*
 *   dataset right now.
 * - the **default ACL** (`default: true`) is a template, not a live grant:
 *   it's copied onto whatever gets created *under* this path afterwards
 *   (a new file, a new subdirectory), so that new content inherits the
 *   same policy instead of falling back to whatever the creating process's
 *   umask happens to produce.
 *
 * Declaring only the default ACL (as an earlier draft of this code did)
 * leaves the dataset's own, current permissions unmanaged -- only future
 * children would ever see the intended policy, not the dataset itself.
 * Declaring only the access ACL would do the reverse: the dataset itself
 * would be correct, but nothing created inside it later would inherit
 * anything, silently falling out of policy over time. Both together is
 * what "chmod a directory and have it stick" actually requires.
 */
export function posixDacls(
	mode: string,
): truenas.types.input.FilesystemAclDacl[] {
	const perms = parseUnixMode(mode);
	return [
		...entries("USER_OBJ", perms.owner),
		...entries("GROUP_OBJ", perms.group),
		...entries("OTHER", perms.other),
	];
}

// -----------------------------------------------------------------------------
// Filesystem permissions for datasets that have no single owning identity of
// their own -- multiple local accounts need access, not one dedicated
// service account. (Datasets that DO belong to one specific identity --
// Home Assistant, Immich, Paperless-ngx -- have their `FilesystemAcl`
// declared next to that identity's `truenas.User`, in `./users/`, not here.
// A dataset's ACL lives wherever its owner is decided: colocated under
// `./users/<name>.ts` when there's a dedicated account, here when there
// isn't one and never will be.)
//
// `nobody`/`builtin_users` are looked up (`truenas.getUser`/`getGroup`),
// never created: they're TrueNAS built-ins that exist on every install.
// `builtin_users` in particular is the reason these ACLs don't need an
// umbrella "smb-users" `truenas.Group` invented for this purpose -- TrueNAS
// already ships one containing every local account, and using it here means
// newly-created NAS accounts automatically gain the access these ACLs
// intend for "any local user", with no Pulumi change required.
// -----------------------------------------------------------------------------

// Exported (not just used locally) so `truenas-docs` can read the real
// `username`/`name` back for its generated ACL/identity listing, instead of
// a hardcoded "nobody"/"builtin_users" string duplicating what's already
// known here.
export const nobodyUser = truenas.getUser({ username: "nobody" });
export const builtInUsersGroup = truenas.getGroup({ name: "builtin_users" });

// --- zp1cs01/media/** -------------------------------------------------------
// Owner: `nobody` (no dataset here needs a single dedicated owner). Group:
// `builtin_users` gets RW -- any locally-authenticated SMB user can manage
// media. Other gets read+execute only: this is what the NFS media shares
// actually rely on (`../shares.ts` maps every NFS client to `nobody`, which
// falls into OTHER here, not GROUP), and NFS shares are `readonly: true`
// regardless, so write access was never meant to reach this path via NFS.

const mediaDataset = must(
	zp1cs01.get("media")?.resource,
	"Unknown dataset `media` in pool `zp1cs01`",
);
export const mediaAcl = new truenas.FilesystemAcl(
	"acl-media",
	{
		acltype: "POSIX1E",
		dacls: posixDacls("rwxrwxr-x"),
		path: mediaDataset.mountPoint,
		uid: nobodyUser.then((u) => u.uid),
		gid: builtInUsersGroup.then((g) => g.gid),
	},
	{ parent: mediaDataset },
);

// --- zp1hs01/userspace/shared -----------------------------------------------
// Same reasoning as media/**, tighter on OTHER: this dataset is SMB-only
// (no NFS share exists for it), so there's no `nobody`-mapped consumer that
// needs even read access -- OTHER keeps just the execute bit, enough to
// traverse into the directory, nothing to read or write outside of being a
// member of `builtin_users`.

const userspaceSharedDataset = must(
	zp1hs01.get("userspace/shared")?.resource,
	"Unknown dataset `userspace/shared` in pool `zp1hs01`",
);
export const userspaceSharedAcl = new truenas.FilesystemAcl(
	"acl-userspace-shared",
	{
		acltype: "POSIX1E",
		dacls: posixDacls("rwxrwx--x"),
		path: userspaceSharedDataset.mountPoint,
		uid: nobodyUser.then((u) => u.uid),
		gid: builtInUsersGroup.then((g) => g.gid),
	},
	{ parent: userspaceSharedDataset },
);
