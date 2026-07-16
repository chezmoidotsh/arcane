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

export { garageAdminEndpointUrl, garageAdminTokem } from "./apps";
export { fireStickTvPasswordSecret } from "./users/firesticktv";
export { homeAssistantPasswordSecret } from "./users/home-assistant";
export { immichPasswordSecret } from "./users/immich";
export { jellyfinPasswordSecret } from "./users/jellyfin";
export { paperlessPasswordSecret } from "./users/paperless-ngx";

// Every NFS4-ACL-template-to-dataset assignment this stack knows about, in
// one place -- this provider can't apply them itself (see ../truenas/acls.ts),
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
