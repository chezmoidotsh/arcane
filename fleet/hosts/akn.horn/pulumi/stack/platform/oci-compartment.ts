import * as oci from "@pulumi/oci";

import { tenancyOcid } from "../config";

// The parent `chezmoi.sh` compartment is owned by the chezmoi.sh stack (stack/oci.ts there): it is looked up by
// name in the tenancy instead of being read from that stack. The lookup must find exactly one compartment and
// fail otherwise, because `compartmentId` is updatable on a compartment: a wrong value would move this
// compartment instead of failing.
const parentCompartmentId = oci.identity
	.getCompartmentsOutput({ compartmentId: tenancyOcid, name: "chezmoi.sh", state: "ACTIVE" })
	.compartments.apply((found) => {
		if (found.length !== 1) {
			throw new Error(`expected exactly one compartment named "chezmoi.sh", found ${found.length}`);
		}
		return found[0].id;
	});

// Dedicated compartment: isolates horn.akn's own OCI resources (VCN, instance, volume) under chezmoi.sh instead
// of sharing its parent compartment.
export const ociCompartment = new oci.identity.Compartment("kazimierz", {
	compartmentId: parentCompartmentId,
	name: "horn.akn",
	description: "horn.akn -- public VPS gateway (Pangolin + Gerbil + Traefik)",
});
