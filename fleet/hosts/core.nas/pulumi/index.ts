// Resources are created by importing the modules; only the stack outputs are exported.
//
// Moved from the chezmoi-sh-infra project with `pulumi state move`: the logical names, the types and the parent
// chains must stay as they are, or the moved resources get replaced (new random passwords pushed to TrueNAS and
// OpenBao, new B2 keys, a new Cloudflare token). Moving a file never changes a URN: only these three things do.
//
// stack/config.ts     every input of the program
// stack/system/       the appliance itself: network, services, alerts, certificates, cron jobs
// stack/storage/      the zpools and their datasets, the SMB shares
// stack/access/       who may read what: groups, users and their OpenBao SMB secrets, NFS4 ACL templates
// stack/apps.ts       the TrueNAS Apps catalog, Garage and Nginx Proxy Manager
// stack/backup/       the Backblaze B2 buckets and the cloud-sync tasks that feed them
//
// The stack outputs are the same as chezmoi_sh.live exported for TrueNAS: the account passwords (read by hand,
// see stack/access/users/README.md, and by scripts/bao:smb:drift-check) and nfs4AclAssignments
// (toolbox/truenas-docs).
import * as pulumi from "@pulumi/pulumi";

import "./stack/system/network";
import "./stack/system/services";
import "./stack/system/alerts";
import "./stack/system/certificates";
import "./stack/system/jobs";
import "./stack/storage/zpools/zp1cs01";
import "./stack/storage/zpools/zp1hs01";
import "./stack/storage/zpools/zp1hs01-migrations-rsync";
import "./stack/storage/shares";
import "./stack/apps";
import "./stack/backup/cloudsync";
import {
	mediaAclAssignment,
	type Nfs4AclAssignment,
	userspaceSharedAclAssignment,
} from "./stack/access/acls";
import { homeAssistantAclAssignment } from "./stack/access/users/home-assistant";
import { immichAclAssignment } from "./stack/access/users/immich";
import { paperlessAclAssignment } from "./stack/access/users/paperless-ngx";

export { fireStickTvPasswordSecret } from "./stack/access/users/firesticktv";
export { homeAssistantPasswordSecret } from "./stack/access/users/home-assistant";
export { immichPasswordSecret } from "./stack/access/users/immich";
export { jellyfinPasswordSecret } from "./stack/access/users/jellyfin";
export { paperlessPasswordSecret } from "./stack/access/users/paperless-ngx";

// Every NFS4-ACL-template-to-dataset assignment this stack knows about, in
// one place -- this provider can't apply them itself (see ./stack/access/acls.ts),
// so this stack output is the only artifact tying that advisory list to
// actual infrastructure state. `toolbox/truenas-docs/generate.ts` reads it
// straight off the stack export's `pulumi:pulumi:Stack` outputs, the same
// way it reads every other section, with no import of `./stack/access/acls` or
// `./stack/access/users/*` needed.
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
