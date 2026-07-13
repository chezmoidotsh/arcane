import * as truenas from "@pulumi/truenas";

// Real, stable identities several templates/accounts reference by id --
// looked up (`getUserOutput`/`getGroupOutput`), never created: `apps` is a
// TrueNAS built-in service account, `builtin_users` a TrueNAS built-in
// group (see `./acls.ts` for why `builtin_users` is used instead of an
// invented "smb-users" group). The `*Output` lookup variants, not the
// plain-`Promise`-returning `getUser`/`getGroup`, are required here, not
// just a style choice: a resource input derived from a raw `Promise`
// (`.then(...)`) loses Pulumi's own dependency/known-ness tracking, which
// made every `FilesystemAclTemplate` in `./acls.ts` show a spurious
// `update` on every `pulumi preview` even when `aclJson` resolved to the
// exact same string -- confirmed by comparing old/new state, byte for
// byte, in `pulumi preview --json`. `.apply(...)`, not `.then(...)`,
// follows from that: it's the `Output`-native equivalent.
//
// Deliberately its own leaf module, with no imports of its own: `./acls.ts`
// needs `NFSV4_SMB_MEDIA` to reference `./users/firesticktv.ts` and
// `./users/jellyfin.ts` by id, and both of those already need
// `builtInUsersGroup` for their own `groups` field. If `builtInUsersGroup`
// lived in `./acls.ts` itself, importing those two account files back into
// `./acls.ts` would be a circular import -- Node hoists every `require`
// above other top-level code regardless of where the `import` line sits in
// the source, so `builtInUsersGroup` would still be `undefined` the moment
// either account file's own top-level code runs, crashing `pulumi preview`.
// Keeping this lookup here breaks that cycle: `./acls.ts` and
// `./users/*.ts` both depend on `./identities.ts`, never on each other.
export const appsUser = truenas.getUserOutput({ username: "apps" }); // TrueNAS's own Apps feature: uid 568, confirmed live
export const builtInUsersGroup = truenas.getGroupOutput({
	name: "builtin_users",
}); // every local account: id 91 / gid 545, confirmed live
