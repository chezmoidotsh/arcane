import * as random from "@pulumi/random";
import * as truenas from "@pulumi/truenas";

import { builtInUsersGroup } from "../acls";

// See ./README.md for the shared conventions (UID range, field choices,
// password/parent handling) every account in this directory follows. This
// account owns no dataset -- like `firesticktv.ts`, it's a dedicated SMB
// login, this time for Jellyfin (Kubernetes) to reach the media shares
// (Films, Series TV, Animes, Musiques) instead of the NFS exports it used
// before. Access to those shares is already granted to every local SMB
// account via `NFSV4_SMB_ALL` (../acls.ts), so there's no `Nfs4AclAssignment`
// to declare here either. Unlike `firesticktv.ts`, this *is* a service
// account backing an application, so it still takes a `uid` from the
// 30000-30999 SA range.

const jellyfinPassword = new random.RandomPassword("password-jellyfin", {
	length: 32,
	special: true,
});
export const jellyfinPasswordSecret = jellyfinPassword.result;

export const jellyfinUser = new truenas.User(
	"user-jellyfin",
	{
		username: "jellyfin",
		fullName: "Compte de service pour Jellyfin",
		password: jellyfinPassword.result,
		uid: 30004,
		smb: true,
		groupCreate: true,
		// TrueNAS automatically adds every `smb: true` account to its
		// built-in `builtin_users` group on creation -- not something this
		// stack asked for, but not undesirable either (see ../acls.ts:
		// that's the exact group NFSV4_SMB_ALL/NFSV4_SMB_VIEWER grant
		// access to). Declaring it explicitly here, instead of `[]`, stops
		// `pulumi preview` from perpetually trying to revert it: `[]` was
		// never a state TrueNAS would actually hold.
		groups: [builtInUsersGroup.apply((g) => g.id)],
		home: "/var/empty",
		shell: "/usr/sbin/nologin",
		sudoCommands: [],
	},
	{ parent: jellyfinPassword },
);
