import { must } from "@chezmoi.sh/pulumi-lib";
import * as random from "@pulumi/random";
import * as truenas from "@pulumi/truenas";

import { posixDacls } from "../acls";
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
		groups: [],
		home: "/var/empty",
		shell: "/usr/sbin/nologin",
		sudoCommands: [],
	},
	{ parent: homeAssistantPassword },
);

// Sole identity permitted on `backups/hass.chezmoi.sh`: owner and group both
// get full access, OTHER gets none -- no other account, human or service,
// can read or write Home Assistant's own backups.

const homeAssistantBackupDataset = must(
	zp1hs01.get("backups/hass.chezmoi.sh")?.resource,
	"Unknown dataset `backups/hass.chezmoi.sh` in pool `zp1hs01`",
);
export const homeAssistantBackupAcl = new truenas.FilesystemAcl(
	"acl-backups-home-assistant",
	{
		acltype: "POSIX1E",
		dacls: posixDacls("rwx------"),
		path: homeAssistantBackupDataset.mountPoint,
		uid: homeAssistantUser.uid,
		gid: homeAssistantUser.group,
	},
	{ parent: homeAssistantBackupDataset },
);
