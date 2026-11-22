// Only what is read from outside is exported: `.mise.toml` tasks and the
// StackReference of the other projects. Proxmox VE moved to the pve-01-core
// project (fleet/hosts/core.pve-01/pulumi/).
export { observabilityDns01Token, observabilityTailscaleOauthKey } from "./stack/observability";
export { chezmoiShCompartmentId } from "./stack/oci";
export { adminGroupId, familleGroupId, maisonGroupId } from "./stack/pocket-id";
