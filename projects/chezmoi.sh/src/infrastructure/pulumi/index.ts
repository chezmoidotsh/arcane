// Only what is read from outside is exported: `.mise.toml` tasks and the
// StackReference of the other projects.
import "./stack/proxmox";

export { observabilityDns01Token, observabilityTailscaleOauthKey } from "./stack/observability";
export { chezmoiShCompartmentId } from "./stack/oci";
export { adminGroupId, familleGroupId, maisonGroupId } from "./stack/pocket-id";
