// Resources are created by importing the modules; only the stack outputs are exported.
//
// Moved from the chezmoi-sh-infra project with `pulumi state move`: the logical names, the types and the parent
// chains must stay as they are, or the moved resources get replaced (a new B2 key, a new PBS token, a new
// Cloudflare token). Moving a file never changes a URN: only these three things do.
//
// stack/config.ts               every input of the program
// stack/datastore/              the S3-backed datastore (B2 bucket and key, S3 endpoint, datastore) and its jobs
// stack/access/                 who talks to PBS: the pve-backup account and token, the ACME DNS-01 token
// stack/notifications/          where PBS tells us what happened (Slack)
import "./stack/datastore/datastore";
import "./stack/datastore/jobs";
import "./stack/access/pve-backup";
import "./stack/access/acme";
import "./stack/notifications/slack";

export { pbsDns01Token } from "./stack/access/acme";
export { pveBackupTokenId, pveBackupTokenSecret } from "./stack/access/pve-backup";
export { pbsDatastoreName } from "./stack/datastore/datastore";
