import { must } from "@chezmoi.sh/pulumi-lib";
import * as random from "@pulumi/random";
import * as truenas from "@pulumi/truenas";

import type { Nfs4AclAssignment } from "../acls";
import { zp1hs01 } from "../zpools/zp1hs01";

// See ./README.md for the shared conventions (UID range, field choices,
// password/parent handling) every account in this directory follows.

const immichPassword = new random.RandomPassword("password-immich", {
	length: 32,
	special: true,
});
export const immichPasswordSecret = immichPassword.result;

export const immichUser = new truenas.User(
	"user-immich",
	{
		username: "immich",
		fullName: "Compte de service pour Immich",
		password: immichPassword.result,
		uid: 30002,
		smb: true,
		groupCreate: true,
		groups: [],
		home: "/var/empty",
		shell: "/usr/sbin/nologin",
		sudoCommands: [],
	},
	{ parent: immichPassword },
);

// This stack can't apply an ACL to `applications/managed/app.immich` itself
// (see ../acls.ts for why) -- `NFSV4_MANAGED_APPLICATION` (owner-only
// read+write) needs to be applied by hand, with this account as the owner,
// via the TrueNAS UI. `../truenas-docs` turns this assignment into that
// instruction in the generated documentation.

const immichApplicationDataset = must(
	zp1hs01.get("applications/managed/app.immich")?.resource,
	"Unknown dataset `applications/managed/app.immich` in pool `zp1hs01`",
);
export const immichAclAssignment: Nfs4AclAssignment = {
	dataset: immichApplicationDataset,
	template: "NFSV4_MANAGED_APPLICATION",
};
