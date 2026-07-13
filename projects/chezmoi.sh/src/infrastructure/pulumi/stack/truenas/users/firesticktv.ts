import * as random from "@pulumi/random";
import * as truenas from "@pulumi/truenas";

import { builtInUsersGroup } from "../identities";

// See ./README.md for the shared conventions (field choices, password/parent
// handling) every account in this directory follows -- with two deliberate
// exceptions here: no `uid` (this isn't a service account, so it doesn't
// take one from the 30000-30999 SA range; TrueNAS assigns one from its
// normal range instead) and no owned dataset/`Nfs4AclAssignment`. This
// account exists purely so the Fire TV Stick has its own SMB login to
// browse the media shares (Films, Séries, Animés, Musique). `../acls.ts`'s
// `smbMediaTemplate` (NFSV4_SMB_MEDIA) references this account by id
// directly, to pin it (and Jellyfin) to read-only on the media dataset.

const fireStickTvPassword = new random.RandomPassword("password-firesticktv", {
	length: 32,
	special: true,
});
export const fireStickTvPasswordSecret = fireStickTvPassword.result;

export const fireStickTvUser = new truenas.User(
	"user-firesticktv",
	{
		username: "firesticktv",
		fullName: "Compte SMB dédié à la Fire TV Stick",
		password: fireStickTvPassword.result,
		smb: true,
		groupCreate: true,
		// See ../users/home-assistant.ts for why this is declared explicitly
		// instead of left unset: TrueNAS adds every `smb: true` account to
		// `builtin_users` on creation regardless, so `[]` would just cause a
		// perpetual revert attempt on every `pulumi preview`.
		groups: [builtInUsersGroup.apply((g) => g.id)],
		home: "/var/empty",
		shell: "/usr/sbin/nologin",
		sudoCommands: [],
	},
	{ parent: fireStickTvPassword },
);
