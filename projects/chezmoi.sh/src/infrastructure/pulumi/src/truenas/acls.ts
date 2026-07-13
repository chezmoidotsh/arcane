import * as pulumi from "@pulumi/pulumi";
import * as truenas from "@pulumi/truenas";

import { appsUser, builtInUsersGroup } from "./identities";
import { fireStickTvUser } from "./users/firesticktv";
import { jellyfinUser } from "./users/jellyfin";
import { zp1cs01 } from "./zpools/zp1cs01";
import { zp1hs01 } from "./zpools/zp1hs01";

// -----------------------------------------------------------------------------
// This stack does NOT apply filesystem ACLs to any dataset. It only manages
// NFS4 ACL *templates* -- named presets stored on the NAS, picked manually
// in the TrueNAS UI's ACL editor -- and documents (via `truenas-docs`, see
// `../truenas-docs/index.ts`) which template a human should apply to which
// dataset.
//
// This is a direct consequence of what this provider can and can't do,
// confirmed against the live API, not inferred from docs:
// - `truenas.FilesystemAcl` (which DOES apply an ACL to a path) only works
//   for `acltype: "POSIX1E"`. Attempting `acltype: "NFS4"` fails: the real
//   `filesystem.setacl` endpoint requires `type`/`flags` fields and a
//   `perms.BASIC` enum this SDK's `FilesystemAclDacl` type doesn't expose
//   at all (only `permRead`/`permWrite`/`permExecute`, a POSIX1E-shaped
//   flat boolean set).
// - `truenas.FilesystemAclTemplate` (this file) DOES work for NFS4, because
//   its `aclJson` is a raw JSON string, not constrained by that same flat
//   schema. But a template is just a stored preset -- `filesystem.setacl`
//   has no field to reference one, so nothing in this provider can apply a
//   template to a path. Only a human, via the UI, can.
//
// Given that, this stack's job shrinks to: keep the 5 templates below
// correct and up to date, and keep the documented dataset -> template
// mapping (`../truenas-docs`) from drifting -- applying them is a manual,
// operational step outside Pulumi's reach.
//
// `appsUser`/`builtInUsersGroup` live in `./identities.ts`, not here, and
// `./users/firesticktv.ts`/`./users/jellyfin.ts` are imported directly
// above (for `NFSV4_SMB_MEDIA`'s per-account entries) in that direction
// only -- see `./identities.ts` for why the reverse would be a circular
// import.
// -----------------------------------------------------------------------------

/** The 5 NFS4 ACL templates this stack manages -- see each `FilesystemAclTemplate` below for what each one grants. */
export type Nfs4AclTemplateName =
	| "NFSV4_MANAGED_APPLICATION"
	| "NFSV4_TRUENAS_APPLICATION"
	| "NFSV4_SMB_ALL"
	| "NFSV4_SMB_VIEWER"
	| "NFSV4_SMB_MEDIA";

/** One dataset paired with the NFS4 ACL template a human should apply to it -- consumed by `../truenas-docs` to render the manual-application guide. */
export interface Nfs4AclAssignment {
	dataset: truenas.Dataset;
	template: Nfs4AclTemplateName;
}

/**
 * The 14 individual NFS4 permission bits TrueNAS's `filesystem.getacl`
 * reports and `filesystem.setacl`/`filesystem.acltemplate` accept. Used
 * only by `writeOnlyBits` below -- every other entry in this file uses the
 * `basic` shorthand instead.
 */
type Nfs4PermBits = Record<
	| "READ_DATA"
	| "WRITE_DATA"
	| "APPEND_DATA"
	| "READ_NAMED_ATTRS"
	| "WRITE_NAMED_ATTRS"
	| "EXECUTE"
	| "DELETE"
	| "DELETE_CHILD"
	| "READ_ATTRIBUTES"
	| "WRITE_ATTRIBUTES"
	| "READ_ACL"
	| "WRITE_ACL"
	| "WRITE_OWNER"
	| "SYNCHRONIZE",
	boolean
>;

/**
 * Every bit `MODIFY` grants that `READ` doesn't -- i.e. "every write-shaped
 * right, none of the read-shaped ones". Confirmed against TrueNAS's own
 * live `filesystem.getacl` output for both presets (`pulumi refresh` can't
 * verify this the way it does the `basic` shorthand below, since this
 * exact bit combination has no `BASIC` keyword of its own).
 */
const writeOnlyBits: Nfs4PermBits = {
	READ_DATA: false,
	WRITE_DATA: true,
	APPEND_DATA: true,
	READ_NAMED_ATTRS: false,
	WRITE_NAMED_ATTRS: true,
	EXECUTE: false,
	DELETE: true,
	DELETE_CHILD: true,
	READ_ATTRIBUTES: false,
	WRITE_ATTRIBUTES: true,
	READ_ACL: false,
	WRITE_ACL: false,
	WRITE_OWNER: false,
	SYNCHRONIZE: true,
};

export interface Nfs4EntrySpec {
	/** `"owner@"`/`"group@"`/`"everyone@"` (NFS4 special identifiers) or `"USER"`/`"GROUP"` (named principal, requires `id`). */
	tag: "owner@" | "group@" | "everyone@" | "USER" | "GROUP";
	/** Numeric uid/gid -- required for `"USER"`/`"GROUP"`; defaults to `-1` (TrueNAS's own "no id" sentinel) for the special identifiers. */
	id?: pulumi.Input<number>;
	/**
	 * One of TrueNAS's basic NFS4 permission presets, in increasing order
	 * of access: TRAVERSE < READ < MODIFY < FULL_CONTROL. Mutually
	 * exclusive with `perms` -- set exactly one of the two.
	 */
	basic?: "FULL_CONTROL" | "MODIFY" | "READ" | "TRAVERSE";
	/**
	 * Explicit per-bit permissions, for the one case (`smbMediaTemplate`'s
	 * `writeOnlyBits`) no `basic` preset covers. Mutually exclusive with
	 * `basic` -- set exactly one of the two.
	 */
	perms?: Nfs4PermBits;
	/**
	 * `"ALLOW"` (default) or `"DENY"`. Only `smbMediaTemplate` below needs
	 * `"DENY"`, paired with `perms: writeOnlyBits` -- see the comment on
	 * that template for why the entry must be scoped to the write-shaped
	 * bits specifically, not `basic: "MODIFY"`: TrueNAS's
	 * `filesystem.setacl` canonicalizes stored ACEs (every DENY entry
	 * sorts before every ALLOW entry, regardless of the order they're
	 * submitted in), so a broad `DENY MODIFY` -- which includes the read
	 * bits -- ends up blocking read too, no matter how carefully an
	 * `ALLOW READ` entry is ordered ahead of it in this file.
	 */
	type?: "ALLOW" | "DENY";
}

/**
 * Builds a `FilesystemAclTemplate.aclJson` string from a short list of
 * `{tag, id?, basic|perms, type?}` entries -- every entry gets
 * `flags: {BASIC: "INHERIT"}` (new files/subdirectories under wherever
 * this template gets applied inherit the same entries), since nothing in
 * this stack's templates needs non-inheriting flags. `type` defaults to
 * `"ALLOW"`; only `smbMediaTemplate` below needs `"DENY"`.
 * Resolves any `id` (from a `truenas.getUser`/`getGroup` lookup) before
 * stringifying, since `aclJson` itself must be a plain string, not an
 * object containing unresolved Outputs/Promises.
 *
 * Key order (`flags`/`id`/`perms`/`tag`/`type`), the `-1` sentinel for
 * owner@/group@/everyone@ entries, and the absence of a `who` field are
 * not stylistic choices -- they match, byte for byte, what
 * `filesystem.acltemplate` itself returns for these templates (confirmed
 * via `pulumi refresh --diff`). Anything else here causes a spurious
 * `update` on every `pulumi preview`/`up`, forever, even though nothing
 * actually changed.
 */
export function nfs4AclJson(specs: Nfs4EntrySpec[]): pulumi.Output<string> {
	return pulumi.all(specs.map((s) => s.id ?? -1)).apply((ids) =>
		JSON.stringify(
			specs.map((s, i) => ({
				flags: { BASIC: "INHERIT" },
				id: ids[i],
				perms: s.perms ?? { BASIC: s.basic },
				tag: s.tag,
				type: s.type ?? "ALLOW",
			})),
		),
	);
}

// A NFS4 ACL granting one of the service accounts access to its own
// dataset (e.g. `applications/managed/app.immich`, via
// `NFSV4_MANAGED_APPLICATION`) isn't enough by itself: NFS4/POSIX both
// require execute (traverse) permission on every parent directory too, or
// the client can never reach the leaf dataset in the first place --
// `applications/managed` itself grants nothing to these accounts on its
// own. `managed_applications` exists to be that one group, granted
// TRAVERSE on `applications/managed` (applied by hand, like every other
// template in this file), with every service account that owns something
// under it as a member -- see `../users/*.ts`, which each add it to their
// own `groups`.
export const managedApplicationsGroup = new truenas.Group(
	"group-managed-applications",
	{
		name: "managed_applications",
	},
);

export const managedApplicationTemplate = new truenas.FilesystemAclTemplate(
	"acl-template-nfs4-managed-application",
	{
		name: "NFSV4_MANAGED_APPLICATION",
		acltype: "NFS4",
		comment:
			"Owner gets read+write, nobody else has any access. For service accounts this stack manages itself (Home Assistant, Immich, Paperless-ngx), as opposed to TrueNAS's own Apps feature.",
		aclJson: nfs4AclJson([
			{ tag: "owner@", basic: "MODIFY" },
			{ tag: "GROUP", id: managedApplicationsGroup.gid, basic: "TRAVERSE" },
		]),
	},
);

export const trueNASApplicationTemplate = new truenas.FilesystemAclTemplate(
	"acl-template-nfs4-truenas-application",
	{
		name: "NFSV4_TRUENAS_APPLICATION",
		acltype: "NFS4",
		comment:
			"Only TrueNAS's own `apps` service account gets read+write. For datasets backing TrueNAS's native Apps feature, not applications this stack manages itself.",
		aclJson: nfs4AclJson([
			{ tag: "USER", id: appsUser.apply((u) => u.uid), basic: "MODIFY" },
		]),
	},
);

export const smbAllTemplate = new truenas.FilesystemAclTemplate(
	"acl-template-nfs4-smb-all",
	{
		name: "NFSV4_SMB_ALL",
		acltype: "NFS4",
		comment:
			"Every local SMB account (TrueNAS's built-in `builtin_users` group) gets read+write. For datasets with no single dedicated owner.",
		aclJson: nfs4AclJson([
			{
				tag: "GROUP",
				id: builtInUsersGroup.apply((g) => g.gid),
				basic: "MODIFY",
			},
		]),
	},
);

export const smbViewerTemplate = new truenas.FilesystemAclTemplate(
	"acl-template-nfs4-smb-viewer",
	{
		name: "NFSV4_SMB_VIEWER",
		acltype: "NFS4",
		comment:
			"Owner gets read+write; every other local SMB account (`builtin_users`) gets read-only.",
		aclJson: nfs4AclJson([
			{ tag: "owner@", basic: "MODIFY" },
			{
				tag: "GROUP",
				id: builtInUsersGroup.apply((g) => g.gid),
				basic: "READ",
			},
		]),
	},
);

// Like NFSV4_SMB_ALL (every local SMB account gets read+write) -- except
// FireStickTV and Jellyfin, both consumer-only accounts with no business
// ever writing to the media library, are pinned to read-only.
//
// This is a plain `DENY writeOnlyBits` per account, nothing else -- no
// paired `ALLOW READ` entry, and deliberately not `DENY basic: "MODIFY"`.
// An earlier version of this template used `ALLOW READ` followed by `DENY
// MODIFY`, banking on NFS4/ZFS's per-bit ACE evaluation (each requested
// bit resolves against the first applicable entry that mentions it) to let
// the ALLOW claim the read bits before the DENY could reach them. That
// doesn't survive a real `pulumi up` + manual apply: TrueNAS's
// `filesystem.setacl` canonicalizes stored ACEs, moving every DENY entry
// ahead of every ALLOW entry regardless of submission order -- so `DENY
// MODIFY` (which includes the read bits) always resolves READ_DATA first,
// blocking read entirely, no matter how the entries were ordered here.
// `writeOnlyBits` sidesteps the whole problem: it never mentions a
// read-shaped bit, so canonicalization can put it anywhere and it still
// only blocks writes -- the read bits stay unresolved until the `GROUP
// builtin_users ALLOW MODIFY` entry below grants them (every `smb: true`
// account, including these two, is a member of that group).
export const smbMediaTemplate = new truenas.FilesystemAclTemplate(
	"acl-template-nfs4-smb-media",
	{
		name: "NFSV4_SMB_MEDIA",
		acltype: "NFS4",
		comment:
			"Like NFSV4_SMB_ALL (every local SMB account gets read+write), except FireStickTV and Jellyfin are pinned to read-only -- both only ever consume the media library, never write to it.",
		aclJson: nfs4AclJson([
			{
				tag: "USER",
				id: fireStickTvUser.uid,
				perms: writeOnlyBits,
				type: "DENY",
			},
			{ tag: "USER", id: jellyfinUser.uid, perms: writeOnlyBits, type: "DENY" },
			{
				tag: "GROUP",
				id: builtInUsersGroup.apply((g) => g.gid),
				basic: "MODIFY",
			},
		]),
	},
);

// --- zp1cs01/media, zp1hs01/userspace/shared --------------------------------
// Neither dataset has a single dedicated owner -- multiple local accounts
// need access, not one service account. `userspace/shared` is documented as
// plain NFSV4_SMB_ALL. `media` uses NFSV4_SMB_MEDIA instead: everywhere else,
// NFSV4_SMB_ALL's blanket read+write for every local SMB account still
// applies, but FireStickTV and Jellyfin are pinned to read-only.
// (Datasets that DO belong to one specific identity -- Home Assistant,
// Immich, Paperless-ngx -- have their assignment declared next to that
// identity's `truenas.User`, in `./users/`, not here.)

const mediaDataset = zp1cs01.get("media").resource;
export const mediaAclAssignment: Nfs4AclAssignment = {
	dataset: mediaDataset,
	template: "NFSV4_SMB_MEDIA",
};

const userspaceSharedDataset = zp1hs01.get("userspace/shared").resource;
export const userspaceSharedAclAssignment: Nfs4AclAssignment = {
	dataset: userspaceSharedDataset,
	template: "NFSV4_SMB_ALL",
};
