import { must } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import * as truenas from "@pulumi/truenas";

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
// Given that, this stack's job shrinks to: keep the 4 templates below
// correct and up to date, and keep the documented dataset -> template
// mapping (`../truenas-docs`) from drifting -- applying them is a manual,
// operational step outside Pulumi's reach.
// -----------------------------------------------------------------------------

/** The 4 NFS4 ACL templates this stack manages -- see each `FilesystemAclTemplate` below for what each one grants. */
export type Nfs4AclTemplateName =
	| "NFSV4_MANAGED_APPLICATION"
	| "NFSV4_TRUENAS_APPLICATION"
	| "NFSV4_SMB_ALL"
	| "NFSV4_SMB_VIEWER";

/** One dataset paired with the NFS4 ACL template a human should apply to it -- consumed by `../truenas-docs` to render the manual-application guide. */
export interface Nfs4AclAssignment {
	dataset: truenas.Dataset;
	template: Nfs4AclTemplateName;
}

interface Nfs4EntrySpec {
	/** `"owner@"`/`"group@"`/`"everyone@"` (NFS4 special identifiers) or `"USER"`/`"GROUP"` (named principal, requires `id`). */
	tag: "owner@" | "group@" | "everyone@" | "USER" | "GROUP";
	/** Numeric uid/gid -- required for `"USER"`/`"GROUP"`; defaults to `-1` (TrueNAS's own "no id" sentinel) for the special identifiers. */
	id?: pulumi.Input<number>;
	/** One of TrueNAS's basic NFS4 permission presets, in increasing order of access: TRAVERSE < READ < MODIFY < FULL_CONTROL. */
	basic: "FULL_CONTROL" | "MODIFY" | "READ" | "TRAVERSE";
}

/**
 * Builds a `FilesystemAclTemplate.aclJson` string from a short list of
 * `{tag, id?, basic}` entries -- every entry is `type: "ALLOW"` with
 * `flags: {BASIC: "INHERIT"}` (new files/subdirectories under wherever
 * this template gets applied inherit the same entries), since nothing in
 * this stack's 4 templates needs a DENY entry or non-inheriting flags.
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
function nfs4AclJson(specs: Nfs4EntrySpec[]): pulumi.Output<string> {
	return pulumi.all(specs.map((s) => s.id ?? -1)).apply((ids) =>
		JSON.stringify(
			specs.map((s, i) => ({
				flags: { BASIC: "INHERIT" },
				id: ids[i],
				perms: { BASIC: s.basic },
				tag: s.tag,
				type: "ALLOW",
			})),
		),
	);
}

// Real, stable identities these templates reference by id -- looked up
// (`truenas.getUserOutput`/`getGroupOutput`), never created: `apps` is a
// TrueNAS built-in service account, `builtin_users` a TrueNAS built-in
// group (see below for why it's used instead of an invented "smb-users"
// group). The `*Output` lookup variants, not the plain-`Promise`-returning
// `getUser`/`getGroup`, are required here, not just a style choice: a
// resource input derived from a raw `Promise` (`.then(...)`) loses
// Pulumi's own dependency/known-ness tracking, which made every
// `FilesystemAclTemplate` below show a spurious `update` on every
// `pulumi preview` even when `aclJson` resolved to the exact same string
// -- confirmed by comparing old/new state, byte for byte, in
// `pulumi preview --json`. `.apply(...)`, not `.then(...)`, follows from
// that: it's the `Output`-native equivalent.
//
// Exported (not just used locally) so `../truenas/users/*.ts` can put the
// same `builtin_users` id in their own accounts' `groups` -- see there for
// why that's needed, not optional.
export const appsUser = truenas.getUserOutput({ username: "apps" }); // TrueNAS's own Apps feature: uid 568, confirmed live
export const builtInUsersGroup = truenas.getGroupOutput({
	name: "builtin_users",
}); // every local account: id 91 / gid 545, confirmed live

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

// --- zp1cs01/media, zp1hs01/userspace/shared --------------------------------
// Neither dataset has a single dedicated owner -- multiple local accounts
// need access, not one service account -- so both are documented as
// NFSV4_SMB_ALL. (Datasets that DO belong to one specific identity --
// Home Assistant, Immich, Paperless-ngx -- have their assignment declared
// next to that identity's `truenas.User`, in `./users/`, not here.)

const mediaDataset = must(
	zp1cs01.get("media")?.resource,
	"Unknown dataset `media` in pool `zp1cs01`",
);
export const mediaAclAssignment: Nfs4AclAssignment = {
	dataset: mediaDataset,
	template: "NFSV4_SMB_ALL",
};

const userspaceSharedDataset = must(
	zp1hs01.get("userspace/shared")?.resource,
	"Unknown dataset `userspace/shared` in pool `zp1hs01`",
);
export const userspaceSharedAclAssignment: Nfs4AclAssignment = {
	dataset: userspaceSharedDataset,
	template: "NFSV4_SMB_ALL",
};
