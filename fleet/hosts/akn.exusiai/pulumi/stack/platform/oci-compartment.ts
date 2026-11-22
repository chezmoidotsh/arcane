import * as oci from "@pulumi/oci";
import type * as pulumi from "@pulumi/pulumi";

import { chezmoiSh } from "../config";

// The parent `chezmoi.sh` compartment is owned by the chezmoi.sh stack (stack/oci.ts there). `requireOutput`,
// not `getOutput`: a missing output must fail the run, because `compartmentId` is optional and updatable on a
// compartment -- an undefined value would move this compartment under the tenancy root instead of failing.
const chezmoiShCompartmentId = chezmoiSh.requireOutput(
	"chezmoiShCompartmentId",
) as pulumi.Output<string>;

// Dedicated compartment: isolates exusiai.akn's VCN/instance from the rest.
export const ociCompartment = new oci.identity.Compartment("exusiai", {
	compartmentId: chezmoiShCompartmentId,
	name: "exusiai.akn",
	description: "exusiai.akn -- Minecraft server",
});
