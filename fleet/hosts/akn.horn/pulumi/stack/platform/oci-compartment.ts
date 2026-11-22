import * as oci from "@pulumi/oci";
import type * as pulumi from "@pulumi/pulumi";

import { chezmoiSh } from "../config";

// The parent `chezmoi.sh` compartment is owned by the chezmoi.sh stack
// (stack/oci.ts there): destroying or rebuilding this stack must never take
// down the parent of exusiai.akn. Its id is read across through the same
// StackReference as the Pocket-Id groups (stack/config.ts). `requireOutput`, not `getOutput`: a
// missing output must fail the run, because `compartmentId` is optional and
// updatable on a compartment -- an undefined value would move this compartment
// under the tenancy root instead of failing.
const chezmoiShCompartmentId = chezmoiSh.requireOutput(
	"chezmoiShCompartmentId",
) as pulumi.Output<string>;

// New compartment: does not exist yet (verified empty via `oci iam
// compartment list --include-root`, only tenancy root + chezmoi.sh are
// returned). Isolates horn.akn's own OCI resources (VCN, instance,
// volume) under chezmoi.sh instead of sharing its parent compartment.
export const ociCompartment = new oci.identity.Compartment("kazimierz", {
	compartmentId: chezmoiShCompartmentId,
	name: "horn.akn",
	description:
		"horn.akn -- public VPS gateway (Pangolin + Gerbil + Traefik)",
});
