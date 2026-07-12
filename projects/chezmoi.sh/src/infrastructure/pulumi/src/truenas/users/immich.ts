import { must } from "@chezmoi.sh/pulumi-lib";
import * as random from "@pulumi/random";
import * as truenas from "@pulumi/truenas";

import { posixDacls } from "../acls";
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

// Sole identity permitted on `applications/managed/app.immich` -- this is
// Immich's own application storage (photos, thumbnails, ML models), mounted
// into Kubernetes via the SMB CSI driver authenticating as this account.
// Owner and group get full access, OTHER gets none.

const immichApplicationDataset = must(
	zp1hs01.get("applications/managed/app.immich")?.resource,
	"Unknown dataset `applications/managed/app.immich` in pool `zp1hs01`",
);
export const immichAcl = new truenas.FilesystemAcl(
	"acl-app-immich",
	{
		acltype: "POSIX1E",
		dacls: posixDacls("rwx------"),
		path: immichApplicationDataset.mountPoint,
		uid: immichUser.uid,
		gid: immichUser.group,
	},
	{ parent: immichApplicationDataset },
);
