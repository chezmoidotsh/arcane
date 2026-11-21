// Only what is read from outside is exported: `.mise.toml` tasks, scripts,
// toolbox/truenas-docs and the StackReference of the other projects.
import "./stack/proxmox";

export { observabilityDns01Token, observabilityTailscaleOauthKey } from "./stack/observability";
export { adminGroupId, familleGroupId, maisonGroupId } from "./stack/pocket-id";
export { pbsDns01Token, pveBackupTokenId, pveBackupTokenSecret } from "./stack/proxmox-backup-server";
export {
  fireStickTvPasswordSecret,
  homeAssistantPasswordSecret,
  immichPasswordSecret,
  jellyfinPasswordSecret,
  nfs4AclAssignments,
  paperlessPasswordSecret,
} from "./stack/truenas";
