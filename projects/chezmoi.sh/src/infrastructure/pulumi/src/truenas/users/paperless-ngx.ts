import { must } from "@chezmoi.sh/pulumi-lib";
import * as random from "@pulumi/random";
import * as truenas from "@pulumi/truenas";

import { posixDacls } from "../acls";
import { zp1hs01 } from "../zpools/zp1hs01";

// See ./README.md for the shared conventions (UID range, field choices,
// password/parent handling) every account in this directory follows.
//
// Username is `paperless`, not `paperless-ngx` -- this file is named after
// the app (matching the `applications/managed/com.paperless-ngx` dataset
// and every other reference to this app elsewhere in the repo), but the
// account itself is just called `paperless`.

const paperlessPassword = new random.RandomPassword("password-paperless", {
	length: 32,
	special: true,
});
export const paperlessPasswordSecret = paperlessPassword.result;

export const paperlessUser = new truenas.User(
	"user-paperless",
	{
		username: "paperless",
		fullName: "Compte de service pour Paperless-ngx",
		password: paperlessPassword.result,
		uid: 30003,
		smb: true,
		groupCreate: true,
		groups: [],
		home: "/var/empty",
		shell: "/usr/sbin/nologin",
		sudoCommands: [],
	},
	{ parent: paperlessPassword },
);

// Sole identity permitted on `applications/managed/com.paperless-ngx` --
// Paperless-ngx's own application storage, mounted into Kubernetes via the
// SMB CSI driver authenticating as this account. Owner and group get full
// access, OTHER gets none.

const paperlessApplicationDataset = must(
	zp1hs01.get("applications/managed/com.paperless-ngx")?.resource,
	"Unknown dataset `applications/managed/com.paperless-ngx` in pool `zp1hs01`",
);
export const paperlessAcl = new truenas.FilesystemAcl(
	"acl-app-paperless-ngx",
	{
		acltype: "POSIX1E",
		dacls: posixDacls("rwx------"),
		path: paperlessApplicationDataset.mountPoint,
		uid: paperlessUser.uid,
		gid: paperlessUser.group,
	},
	{ parent: paperlessApplicationDataset },
);
