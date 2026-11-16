// Moved from the chezmoi-sh-infra project with `pulumi state move`: the
// logical names, the types and the parent chains must stay as they are, or
// the moved resources get replaced (new random passwords pushed to TrueNAS
// and OpenBao, new B2 keys, a new Cloudflare token).
//
// The stack outputs are the same as chezmoi_sh.live exported for TrueNAS:
// the account passwords (read by hand, see ./users/README.md, and by
// scripts/bao:smb:drift-check) and nfs4AclAssignments (toolbox/truenas-docs).
import * as pulumi from "@pulumi/pulumi";

import "./alerts";
import "./apps";
import "./certificates";
import "./cloudsync";
import "./jobs";
import "./network";
import "./services";
import "./shares";
import "./zpools/zp1cs01";
import "./zpools/zp1hs01";
import "./zpools/zp1hs01-migrations-rsync";
import {
	mediaAclAssignment,
	type Nfs4AclAssignment,
	userspaceSharedAclAssignment,
} from "./acls";

import { homeAssistantAclAssignment } from "./users/home-assistant";
import { immichAclAssignment } from "./users/immich";
import { paperlessAclAssignment } from "./users/paperless-ngx";

export { fireStickTvPasswordSecret } from "./users/firesticktv";
export { homeAssistantPasswordSecret } from "./users/home-assistant";
export { immichPasswordSecret } from "./users/immich";
export { jellyfinPasswordSecret } from "./users/jellyfin";
export { paperlessPasswordSecret } from "./users/paperless-ngx";

// Every NFS4-ACL-template-to-dataset assignment this stack knows about, in
// one place -- this provider can't apply them itself (see ./acls.ts),
// so this stack output is the only artifact tying that advisory list to
// actual infrastructure state. `toolbox/truenas-docs/generate.ts` reads it
// straight off the stack export's `pulumi:pulumi:Stack` outputs, the same
// way it reads every other section, with no import of `./acls` or
// `./users/*` needed.
const allAclAssignments: Nfs4AclAssignment[] = [
	mediaAclAssignment,
	userspaceSharedAclAssignment,
	homeAssistantAclAssignment,
	immichAclAssignment,
	paperlessAclAssignment,
];

export const nfs4AclAssignments = pulumi.all(
	allAclAssignments.map((a) =>
		a.dataset.mountPoint.apply((mountPoint) => ({
			dataset: mountPoint.replace(/^\/mnt\//, ""),
			template: a.template,
		})),
	),
);
