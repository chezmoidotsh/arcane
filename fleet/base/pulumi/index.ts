// Resources are created by importing the modules; only what another project reads is exported (StackReference).
//
// Renamed from the chezmoi-sh-infra project with `pulumi state move`: the logical names, the types and the parent
// chains must stay as they are, or the moved resources get replaced. Moving a file never changes a URN.
//
// stack/config.ts          every input of the program
// stack/cloud/             the parent OCI compartment `chezmoi.sh`
// stack/identity/          the Pocket-Id groups shared by every cluster
// stack/observability/     the Cloudflare DNS-01 token and the Tailscale OAuth client of the observability LXC;
//                          leaves with the appliance at step 10 of MIGR-20261114-00
import "./stack/cloud/oci";
import "./stack/identity/pocket-id";
import "./stack/observability/credentials";

export { chezmoiShCompartmentId } from "./stack/cloud/oci";
export { adminGroupId, familleGroupId, maisonGroupId } from "./stack/identity/pocket-id";
export { observabilityDns01Token, observabilityTailscaleOauthKey } from "./stack/observability/credentials";
