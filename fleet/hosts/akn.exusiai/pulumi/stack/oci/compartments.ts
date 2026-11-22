import * as oci from "@pulumi/oci";
import type * as pulumi from "@pulumi/pulumi";

import { chezmoiSh } from "../pocket-id";

// The parent `chezmoi.sh` compartment is owned by the chezmoi.sh stack
// (stack/oci.ts there) -- read its id across through the same StackReference
// as the Pocket-Id groups instead of declaring a duplicate. `requireOutput`,
// not `getOutput`: a missing output must fail the run, because `compartmentId`
// is optional and updatable on a compartment -- an undefined value would move
// this compartment under the tenancy root instead of failing.
const chezmoiShCompartmentId = chezmoiSh.requireOutput(
	"chezmoiShCompartmentId",
) as pulumi.Output<string>;

// Dedicated compartment: isolates exusiai.akn's VCN/instance from the rest.
export const exusiai = new oci.identity.Compartment("exusiai", {
	compartmentId: chezmoiShCompartmentId,
	name: "exusiai.akn",
	description: "exusiai.akn -- Minecraft server",
});
