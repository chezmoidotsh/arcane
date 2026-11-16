import * as random from "@pulumi/random";
import * as truenas from "@pulumi/truenas";

import type { Nfs4AclAssignment } from "../acls";
import { builtInUsersGroup } from "../identities";
import { zp1hs01 } from "../zpools/zp1hs01";

// See ./README.md for the shared conventions (UID range, field choices,
// password/parent handling) every account in this directory follows.

const homeAssistantPassword = new random.RandomPassword(
	"password-home-assistant",
	{
		length: 32,
		special: true,
	},
);
export const homeAssistantPasswordSecret = homeAssistantPassword.result;

export const homeAssistantUser = new truenas.User(
	"user-home-assistant",
	{
		username: "home-assistant",
		fullName: "Compte de service pour Home Assistant",
		password: homeAssistantPassword.result,
		uid: 30001,
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
	{ parent: homeAssistantPassword },
);

// This stack can't apply an ACL to `backups/hass.chezmoi.sh` itself (see
// ../acls.ts for why) -- `NFSV4_MANAGED_APPLICATION` (owner-only
// read+write) needs to be applied by hand, with this account as the owner,
// via the TrueNAS UI. `toolbox/truenas-docs` turns this assignment into that
// instruction in the generated documentation.

const homeAssistantBackupDataset = zp1hs01.get(
	"backups/hass.chezmoi.sh",
).resource;
export const homeAssistantAclAssignment: Nfs4AclAssignment = {
	dataset: homeAssistantBackupDataset,
	template: "NFSV4_MANAGED_APPLICATION",
};
